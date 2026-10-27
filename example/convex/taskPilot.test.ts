import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import budgetTest from "@convex-dev/ai-budget/test";
import { AIBudget } from "@convex-dev/ai-budget";
import { register } from "../../src/test.js";
import schema from "./schema.js";
import { api, internal, components } from "./_generated/api.js";

const modules = import.meta.glob("./**/*.ts");
const args = {
  tenantId: "test-issuer|community-1",
  taskKey: "saved-question",
  dispatchKey: "dispatch-1",
  model: "pilot-model",
  provider: "mock",
  ownerId: "resident-1",
};
const budget = new AIBudget(components.aiBudget);
const identity = {
  tenantId: args.tenantId,
  taskKey: args.taskKey,
  dispatchKey: args.dispatchKey,
};
const range = { tenantId: args.tenantId, from: 0, to: 9999999999999 };
function setup() {
  const t = convexTest(schema, modules);
  register(t);
  budgetTest.register(t, "aiBudget");
  return t;
}
function receipt() {
  return {
    outcome: "success" as const,
    finishedAt: Date.now() + 10,
    usage: {
      kind: "known" as const,
      inputTokens: 100,
      outputTokens: 20,
      cachedInputTokens: 30,
    },
    cost: {
      kind: "known" as const,
      nanos: 1000,
      source: "authoritative" as const,
    },
  };
}

describe("sibling AI Budget + production accounting", () => {
  test("admission replay never authorizes another dispatch; receipts replay without duplicate charges", async () => {
    const t = setup();
    const admitted = await t.mutation(internal.taskPilot.admit, args);
    expect(admitted.kind).toBe("dispatch");
    const replayed = await t.mutation(internal.taskPilot.admit, args);
    expect(replayed.kind).toBe("pending");
    const observed = receipt();
    await t.mutation(internal.taskPilot.settle, {
      ...identity,
      receipt: observed,
    });
    await t.mutation(internal.taskPilot.settle, {
      ...identity,
      receipt: observed,
    });
    await t.mutation(internal.taskPilot.complete, {
      tenantId: args.tenantId,
      taskKey: args.taskKey,
      finishedAt: observed.finishedAt,
      outcome: "success",
      attemptsComplete: true,
    });
    expect(
      await t.query(internal.taskPilot.inspectSummary, range),
    ).toMatchObject({
      taskCount: 1,
      successfulTasks: 1,
      attemptCount: 1,
      knownCostNanos: 1000,
      costPerSuccessfulTaskNanos: 1000,
    });
    const requests = await t.query((ctx) =>
      budget.requests.list(ctx, { userId: args.ownerId }),
    );
    expect(requests).toHaveLength(1);
    expect(requests[0].costNanos).toBe(1000);
    expect(
      await t.query(internal.taskPilot.inspectPages, {
        tenantId: args.tenantId,
        taskKey: args.taskKey,
      }),
    ).toEqual({ tasks: 1, attempts: 1 });
  });

  test("parent mutation failure rolls back both reservation and attempt", async () => {
    const t = setup();
    await expect(
      t.mutation(async (ctx) => {
        await ctx.runMutation(internal.taskPilot.admit, args);
        throw new Error("Parent failed");
      }),
    ).rejects.toThrow("Parent failed");
    expect(
      (await t.query(internal.taskPilot.inspectSummary, range)).taskCount,
    ).toBe(0);
    expect(
      await t.query((ctx) =>
        budget.requests.list(ctx, { userId: args.ownerId }),
      ),
    ).toEqual([]);
    expect(
      await t.run((ctx) => ctx.db.query("pilotDispatches").collect()),
    ).toEqual([]);
  });

  test("invalid attempt receipt rolls back budget settlement; retry only the corrected receipt", async () => {
    const t = setup();
    const admitted = await t.mutation(internal.taskPilot.admit, args);
    if (admitted.kind !== "dispatch") throw new Error("Expected admission");
    const observed = receipt();
    await expect(
      t.mutation(internal.taskPilot.settle, {
        ...identity,
        receipt: { ...observed, firstTextAt: 0 },
      }),
    ).rejects.toThrow("First text outside attempt");
    expect(
      (
        await t.query((ctx) =>
          budget.requests.get(ctx, { requestId: admitted.requestId }),
        )
      )?.status,
    ).toBe("pending");
    expect(
      (await t.query(internal.taskPilot.inspectSummary, range)).knownCostNanos,
    ).toBe(0);
    await t.mutation(internal.taskPilot.settle, {
      ...identity,
      receipt: observed,
    });
    expect(
      (await t.query(internal.taskPilot.inspectSummary, range)).knownCostNanos,
    ).toBe(1000);
  });

  test("blocked admission commits diagnostics and never creates a dispatched attempt", async () => {
    const t = setup();
    await t.mutation((ctx) =>
      budget.models.setPolicy(ctx, { mode: "denylist", models: [args.model] }),
    );
    expect(await t.mutation(internal.taskPilot.admit, args)).toMatchObject({
      kind: "blocked",
    });
    expect(await t.mutation(internal.taskPilot.admit, args)).toMatchObject({
      kind: "blocked",
    });
    expect(
      await t.run((ctx) => ctx.db.query("pilotDispatches").collect()),
    ).toHaveLength(1);
    expect(
      (await t.query(internal.taskPilot.inspectSummary, range)).attemptCount,
    ).toBe(0);
  });

  test("public UI query requires login and derives its tenant from the identity", async () => {
    const t = setup();
    await t.mutation(internal.taskPilot.admit, args);
    await expect(
      t.query(api.taskPilot.summary, { from: range.from, to: range.to }),
    ).rejects.toThrow("Sign in");
    const owner = t.withIdentity({ tokenIdentifier: args.tenantId });
    expect(
      (
        await owner.query(api.taskPilot.summary, {
          from: range.from,
          to: range.to,
        })
      ).taskCount,
    ).toBe(1);
    expect(
      (
        await t
          .withIdentity({ tokenIdentifier: "other-tenant" })
          .query(api.taskPilot.summary, { from: range.from, to: range.to })
      ).taskCount,
    ).toBe(0);
  });
});
