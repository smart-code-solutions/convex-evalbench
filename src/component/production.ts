import { paginationOptsValidator, type PaginationOptions } from "convex/server";
import { v } from "convex/values";
import { paginator } from "convex-helpers/server/pagination";
import schema from "./schema.js";
import { mutation, query, type QueryCtx } from "./_generated/server.js";
import {
  taskIdentity,
  taskScope,
  taskStart,
  taskDocument,
  taskOutcome,
  attemptIdentity,
  attemptStart,
  attemptDocument,
  attemptReceipt,
  nonnegative,
  refineReceipt,
  sameValue,
  validateReceipt,
  productionSummary,
} from "../production.js";

function validateKeys(args: Record<string, unknown>) {
  for (const [name, value] of Object.entries(args)) {
    if (typeof value === "string" && (!value.trim() || value.length > 256))
      throw new Error(`Invalid ${name}`);
  }
}
async function findTask(
  ctx: QueryCtx,
  args: { tenantId: string; useCase: string; taskKey: string },
) {
  return ctx.db
    .query("production_tasks")
    .withIndex("by_identity", (q) =>
      q
        .eq("tenantId", args.tenantId)
        .eq("useCase", args.useCase)
        .eq("taskKey", args.taskKey),
    )
    .unique();
}
async function requireTask(
  ctx: QueryCtx,
  args: { tenantId: string; useCase: string; taskKey: string },
) {
  const row = await findTask(ctx, args);
  if (!row) throw new Error("Task not found");
  return row;
}
async function requireAttempt(
  ctx: QueryCtx,
  args: {
    tenantId: string;
    useCase: string;
    taskKey: string;
    attemptKey: string;
  },
) {
  const row = await ctx.db
    .query("production_attempts")
    .withIndex("by_identity", (q) =>
      q
        .eq("tenantId", args.tenantId)
        .eq("useCase", args.useCase)
        .eq("taskKey", args.taskKey)
        .eq("attemptKey", args.attemptKey),
    )
    .unique();
  if (!row) throw new Error("Attempt not found");
  return row;
}
function validatePage(opts: PaginationOptions) {
  if (
    !Number.isInteger(opts.numItems) ||
    opts.numItems < 1 ||
    opts.numItems > 50
  )
    throw new Error("Page size must be 1–50");
}

export const startTask = mutation({
  args: taskStart,
  returns: v.object({ created: v.boolean() }),
  handler: async (ctx, args) => {
    validateKeys(args);
    nonnegative(args.startedAt, "startedAt");
    const row = await findTask(ctx, args);
    if (row) {
      if (row.startedAt !== args.startedAt || row.version !== args.version)
        throw new Error("Conflicting task start");
      return { created: false };
    }
    await ctx.db.insert("production_tasks", {
      ...args,
      state: { kind: "running" },
    });
    return { created: true };
  },
});
export const finishTask = mutation({
  args: {
    ...taskIdentity,
    outcome: taskOutcome,
    finishedAt: v.number(),
    attemptsComplete: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await requireTask(ctx, args);
    nonnegative(args.finishedAt, "finishedAt");
    if (args.finishedAt < row.startedAt)
      throw new Error("Task completion precedes start");
    const state = {
      kind: "finished" as const,
      outcome: args.outcome,
      finishedAt: args.finishedAt,
      attemptsComplete: args.attemptsComplete,
    };
    if (row.state.kind === "finished" && !sameValue(row.state, state))
      throw new Error("Conflicting task completion");
    await ctx.db.patch("production_tasks", row._id, { state });
    return null;
  },
});
export const startAttempt = mutation({
  args: attemptStart,
  returns: v.object({ created: v.boolean() }),
  handler: async (ctx, args) => {
    validateKeys(args);
    nonnegative(args.startedAt, "startedAt");
    const task = await requireTask(ctx, args);
    if (args.startedAt < task.startedAt)
      throw new Error("Attempt precedes task");
    const row = await ctx.db
      .query("production_attempts")
      .withIndex("by_identity", (q) =>
        q
          .eq("tenantId", args.tenantId)
          .eq("useCase", args.useCase)
          .eq("taskKey", args.taskKey)
          .eq("attemptKey", args.attemptKey),
      )
      .unique();
    if (row) {
      if (
        row.startedAt !== args.startedAt ||
        row.provider !== args.provider ||
        row.model !== args.model
      )
        throw new Error("Conflicting attempt start");
      return { created: false };
    }
    if (task.state.kind === "finished")
      throw new Error("Task is finished; create a new task for new work");
    await ctx.db.insert("production_attempts", {
      ...args,
      state: { kind: "pending" },
    });
    return { created: true };
  },
});
export const markAttemptUnknown = mutation({
  args: attemptIdentity,
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await requireAttempt(ctx, args);
    if (row.state.kind === "pending")
      await ctx.db.patch("production_attempts", row._id, {
        state: { kind: "unknown" },
      });
    return null;
  },
});
export const finishAttempt = mutation({
  args: { ...attemptIdentity, receipt: attemptReceipt },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await requireAttempt(ctx, args);
    validateReceipt(args.receipt, row.startedAt);
    const receipt =
      row.state.kind === "finished"
        ? refineReceipt(row.state.receipt, args.receipt)
        : args.receipt;
    await ctx.db.patch("production_attempts", row._id, {
      state: { kind: "finished", receipt },
    });
    return null;
  },
});
export const getTask = query({
  args: taskIdentity,
  returns: v.union(taskDocument, v.null()),
  handler: findTask,
});
export const listTasks = query({
  args: { ...taskScope, paginationOpts: paginationOptsValidator },
  returns: v.object({
    page: v.array(taskDocument),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, args) => {
    validatePage(args.paginationOpts);
    const { page, isDone, continueCursor } = await paginator(ctx.db, schema)
      .query("production_tasks")
      .withIndex("by_scope_started", (q) =>
        q.eq("tenantId", args.tenantId).eq("useCase", args.useCase),
      )
      .order("desc")
      .paginate(args.paginationOpts);
    return { page, isDone, continueCursor };
  },
});
export const listAttempts = query({
  args: { ...taskIdentity, paginationOpts: paginationOptsValidator },
  returns: v.object({
    page: v.array(attemptDocument),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, args) => {
    validatePage(args.paginationOpts);
    const { page, isDone, continueCursor } = await paginator(ctx.db, schema)
      .query("production_attempts")
      .withIndex("by_task_started", (q) =>
        q
          .eq("tenantId", args.tenantId)
          .eq("useCase", args.useCase)
          .eq("taskKey", args.taskKey),
      )
      .order("asc")
      .paginate(args.paginationOpts);
    return { page, isDone, continueCursor };
  },
});

/** A bounded start-time cohort, not a deployment-wide analytics rollup. */
export const summarizeTasks = query({
  args: { ...taskScope, from: v.number(), to: v.number() },
  returns: productionSummary,
  handler: async (ctx, args) => {
    nonnegative(args.from, "from");
    nonnegative(args.to, "to");
    if (args.to <= args.from) throw new Error("Invalid time range");
    const rows = await ctx.db
      .query("production_tasks")
      .withIndex("by_scope_started", (q) =>
        q
          .eq("tenantId", args.tenantId)
          .eq("useCase", args.useCase)
          .gte("startedAt", args.from)
          .lt("startedAt", args.to),
      )
      .order("desc")
      .take(51);
    const tasks = rows.slice(0, 50);
    let finishedTasks = 0,
      successfulTasks = 0,
      failedTasks = 0,
      unknownOutcomeTasks = 0;
    let attemptCount = 0,
      unresolvedAttempts = 0,
      failedAttempts = 0,
      knownUsageAttempts = 0,
      knownCostAttempts = 0,
      cachedUsageAttempts = 0,
      firstTextAttempts = 0;
    let inputTokens = 0,
      outputTokens = 0,
      cachedInputTokens = 0,
      knownCostNanos = 0,
      tasksWithTruncatedAttempts = 0;
    const latencies: number[] = [];
    for (const task of tasks) {
      if (task.state.kind === "finished") {
        finishedTasks++;
        if (task.state.outcome === "success") successfulTasks++;
        if (task.state.outcome === "failure") failedTasks++;
        if (task.state.outcome === "unknown") unknownOutcomeTasks++;
        latencies.push(task.state.finishedAt - task.startedAt);
      }
      const attempts = await ctx.db
        .query("production_attempts")
        .withIndex("by_task_started", (q) =>
          q
            .eq("tenantId", args.tenantId)
            .eq("useCase", args.useCase)
            .eq("taskKey", task.taskKey),
        )
        .take(51);
      if (attempts.length > 50) tasksWithTruncatedAttempts++;
      for (const attempt of attempts.slice(0, 50)) {
        attemptCount++;
        if (attempt.state.kind !== "finished") {
          unresolvedAttempts++;
          continue;
        }
        const receipt = attempt.state.receipt;
        if (receipt.outcome !== "success") failedAttempts++;
        if (receipt.firstTextAt !== undefined) firstTextAttempts++;
        if (receipt.usage.kind === "known") {
          knownUsageAttempts++;
          inputTokens += receipt.usage.inputTokens;
          outputTokens += receipt.usage.outputTokens;
          if (receipt.usage.cachedInputTokens !== undefined) {
            cachedUsageAttempts++;
            cachedInputTokens += receipt.usage.cachedInputTokens;
          }
        }
        if (receipt.cost.kind === "known") {
          knownCostAttempts++;
          knownCostNanos += receipt.cost.nanos;
        }
      }
    }
    latencies.sort((a, b) => a - b);
    const percentile = (p: number) =>
      latencies.length ? latencies[Math.ceil(p * latencies.length) - 1] : null;
    const costComplete =
      !rows[50] &&
      tasksWithTruncatedAttempts === 0 &&
      finishedTasks === tasks.length &&
      tasks.every(
        (task) => task.state.kind === "finished" && task.state.attemptsComplete,
      ) &&
      unknownOutcomeTasks === 0 &&
      unresolvedAttempts === 0 &&
      knownCostAttempts === attemptCount;
    return {
      taskCount: tasks.length,
      finishedTasks,
      successfulTasks,
      failedTasks,
      unknownOutcomeTasks,
      attemptCount,
      unresolvedAttempts,
      failedAttempts,
      knownUsageAttempts,
      knownCostAttempts,
      cachedUsageAttempts,
      firstTextAttempts,
      inputTokens,
      outputTokens,
      cachedInputTokens,
      knownCostNanos,
      costPerSuccessfulTaskNanos:
        costComplete && successfulTasks > 0
          ? knownCostNanos / successfulTasks
          : null,
      latencyMs: {
        p50: percentile(0.5),
        p95: percentile(0.95),
        p99: percentile(0.99),
        sampleCount: latencies.length,
      },
      coverage: {
        tasksTruncated: rows.length > 50,
        tasksWithTruncatedAttempts,
        taskLimit: 50,
        attemptsPerTaskLimit: 50,
        oldestTaskStartedAt: tasks.at(-1)?.startedAt ?? null,
        asOf: Date.now(),
      },
    };
  },
});
