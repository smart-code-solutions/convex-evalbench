import { AIBudget } from "@convex-dev/ai-budget";
import { v } from "convex/values";
import {
  Evalbench,
  attemptReceipt,
  productionSummary,
  taskOutcome,
} from "@smart-code-solutions/convex-evalbench";
import { components } from "./_generated/api.js";
import { internalMutation, internalQuery, query } from "./_generated/server.js";

const budget = new AIBudget(components.aiBudget);
const tasks = new Evalbench(components.evalbench).production;
const useCase = "resident-ask";
const identity = {
  tenantId: v.string(),
  taskKey: v.string(),
  dispatchKey: v.string(),
};
const admissionResult = v.union(
  v.object({ kind: v.literal("blocked"), reason: v.string() }),
  v.object({ kind: v.literal("dispatch"), requestId: v.string() }),
  v.object({ kind: v.literal("pending"), requestId: v.string() }),
);

/** Trusted host entrypoint; the action has already resolved community and budget owner. */
export const admit = internalMutation({
  args: {
    ...identity,
    ownerId: v.string(),
    provider: v.string(),
    model: v.string(),
  },
  returns: admissionResult,
  handler: async (ctx, args) => {
    const previous = await ctx.db
      .query("pilotDispatches")
      .withIndex("by_dispatch", (q) =>
        q
          .eq("tenantId", args.tenantId)
          .eq("taskKey", args.taskKey)
          .eq("dispatchKey", args.dispatchKey),
      )
      .unique();
    if (previous) {
      if (
        previous.model !== args.model ||
        previous.provider !== args.provider ||
        previous.ownerId !== args.ownerId
      )
        throw new Error("Conflicting dispatch");
      return previous.admission.kind === "blocked"
        ? previous.admission
        : { kind: "pending" as const, requestId: previous.admission.requestId };
    }
    const task = { tenantId: args.tenantId, taskKey: args.taskKey, useCase };
    const startedAt = Date.now();
    if (!(await tasks.getTask(ctx, task)))
      await tasks.startTask(ctx, { ...task, startedAt });
    const admission = await budget.begin(ctx, {
      userId: args.ownerId,
      action: useCase,
      model: args.model,
      estimatedCostNanos: 1_000_000,
      estimatedTokens: 1000,
      messages: [],
    });
    const saved = admission.allowed
      ? { kind: "admitted" as const, requestId: admission.requestId, startedAt }
      : { kind: "blocked" as const, reason: admission.reason };
    await ctx.db.insert("pilotDispatches", { ...args, admission: saved });
    if (!admission.allowed)
      return { kind: "blocked" as const, reason: admission.reason };
    await tasks.startAttempt(ctx, {
      ...task,
      attemptKey: admission.requestId,
      provider: args.provider,
      model: args.model,
      startedAt,
    });
    return { kind: "dispatch" as const, requestId: admission.requestId };
  },
});

/** No provider call belongs in this mutation. Retry this receipt, never the inference. */
export const settle = internalMutation({
  args: { ...identity, receipt: attemptReceipt },
  returns: v.null(),
  handler: async (ctx, args) => {
    const dispatch = await ctx.db
      .query("pilotDispatches")
      .withIndex("by_dispatch", (q) =>
        q
          .eq("tenantId", args.tenantId)
          .eq("taskKey", args.taskKey)
          .eq("dispatchKey", args.dispatchKey),
      )
      .unique();
    if (!dispatch || dispatch.admission.kind !== "admitted")
      throw new Error("No admitted dispatch");
    const { requestId, startedAt } = dispatch.admission;
    const { receipt } = args;
    if (receipt.usage.kind !== "known")
      throw new Error("Reconcile unknown provider usage before settlement");
    const { costNanos } = await budget.settle(ctx, {
      requestId,
      promptTokens: receipt.usage.inputTokens,
      completionTokens: receipt.usage.outputTokens,
      cachedTokens: receipt.usage.cachedInputTokens,
      ...(receipt.cost.kind === "known" &&
      receipt.cost.source === "authoritative"
        ? { costNanos: receipt.cost.nanos }
        : {}),
      ...(receipt.outcome === "success" ? {} : { error: receipt.outcome }),
      latencyMs: receipt.finishedAt - startedAt,
    });
    const request = await budget.requests.get(ctx, { requestId });
    if (
      receipt.cost.kind === "known" &&
      receipt.cost.source === "authoritative" &&
      receipt.cost.nanos !== costNanos
    )
      throw new Error("Conflicting authoritative cost");
    const source = request?.costSource;
    await tasks.finishAttempt(ctx, {
      tenantId: args.tenantId,
      useCase,
      taskKey: args.taskKey,
      attemptKey: requestId,
      receipt: {
        ...receipt,
        cost:
          source === "authoritative" ||
          source === "token_estimate" ||
          source === "reservation_estimate"
            ? { kind: "known", nanos: costNanos, source }
            : { kind: "unknown" },
      },
    });
    return null;
  },
});

export const complete = internalMutation({
  args: {
    tenantId: v.string(),
    taskKey: v.string(),
    finishedAt: v.number(),
    outcome: taskOutcome,
    attemptsComplete: v.boolean(),
  },
  returns: v.null(),
  handler: (ctx, args) => tasks.finishTask(ctx, { ...args, useCase }),
});

// A minimal personal-tenant example. BoardSense uses currentUserCanManageCommunity instead.
export const summary = query({
  args: { from: v.number(), to: v.number() },
  returns: productionSummary,
  handler: async (ctx, args) => {
    const user = await ctx.auth.getUserIdentity();
    if (!user) throw new Error("Sign in to view AI task metrics");
    return tasks.summarizeTasks(ctx, {
      ...args,
      tenantId: user.tokenIdentifier,
      useCase,
    });
  },
});
export const inspectSummary = internalQuery({
  args: { tenantId: v.string(), from: v.number(), to: v.number() },
  returns: productionSummary,
  handler: (ctx, args) => tasks.summarizeTasks(ctx, { ...args, useCase }),
});

export const inspectPages = internalQuery({
  args: { tenantId: v.string(), taskKey: v.string() },
  returns: v.object({ tasks: v.number(), attempts: v.number() }),
  handler: async (ctx, { tenantId, taskKey }) => {
    const paginationOpts = { cursor: null, numItems: 50 };
    const page = await tasks.listTasks(ctx, {
      tenantId,
      useCase,
      paginationOpts,
    });
    const attempts = await tasks.listAttempts(ctx, {
      tenantId,
      useCase,
      taskKey,
      paginationOpts,
    });
    return { tasks: page.page.length, attempts: attempts.page.length };
  },
});
