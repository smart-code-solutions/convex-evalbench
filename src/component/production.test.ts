import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api.js";
import schema from "./schema.js";
import { modules } from "./setup.test.js";
import type { AttemptReceipt } from "../production.js";

const scope = { tenantId: "community-1", useCase: "resident-ask" };
const task = { ...scope, taskKey: "question-1" };
const attempt = { ...task, attemptKey: "dispatch-1" };
const start = {
  ...attempt,
  provider: "google",
  model: "test-model",
  startedAt: 1100,
};
const receipt: AttemptReceipt = {
  outcome: "success",
  finishedAt: 1800,
  firstTextAt: 1200,
  usage: {
    kind: "known",
    inputTokens: 100,
    outputTokens: 20,
    cachedInputTokens: 30,
  },
  cost: { kind: "known", nanos: 1200, source: "token_estimate" },
};
const range = { ...scope, from: 0, to: 10000 };
const page = { numItems: 50, cursor: null };
async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation(api.production.startTask, { ...task, startedAt: 1000 });
  await t.mutation(api.production.startAttempt, start);
  return t;
}

describe("production task accounting", () => {
  test("idempotent starts/receipts do not double count; conflicts reject", async () => {
    const t = await setup();
    expect(
      await t.mutation(api.production.startTask, { ...task, startedAt: 1000 }),
    ).toEqual({ created: false });
    expect(await t.mutation(api.production.startAttempt, start)).toEqual({
      created: false,
    });
    await expect(
      t.mutation(api.production.startAttempt, { ...start, model: "different" }),
    ).rejects.toThrow("Conflicting");
    await expect(
      t.mutation(api.production.startTask, { ...task, startedAt: 1001 }),
    ).rejects.toThrow("Conflicting");
    await t.mutation(api.production.finishAttempt, { ...attempt, receipt });
    await t.mutation(api.production.finishAttempt, { ...attempt, receipt });
    await expect(
      t.mutation(api.production.finishAttempt, {
        ...attempt,
        receipt: {
          ...receipt,
          cost: { kind: "known", nanos: 1, source: "authoritative" },
        },
      }),
    ).rejects.toThrow("Conflicting");
    expect(
      (await t.query(api.production.summarizeTasks, range)).knownCostNanos,
    ).toBe(1200);
  });

  test("lost responses stay unknown and accept late receipts without reopening task", async () => {
    const t = await setup();
    await t.mutation(api.production.markAttemptUnknown, attempt);
    await t.mutation(api.production.finishTask, {
      ...task,
      finishedAt: 2000,
      outcome: "unknown",
      attemptsComplete: true,
    });
    expect(await t.query(api.production.summarizeTasks, range)).toMatchObject({
      unresolvedAttempts: 1,
      knownCostNanos: 0,
      costPerSuccessfulTaskNanos: null,
    });
    await t.mutation(api.production.finishAttempt, { ...attempt, receipt });
    await t.mutation(api.production.markAttemptUnknown, attempt);
    expect(
      (
        await t.query(api.production.listAttempts, {
          ...task,
          paginationOpts: page,
        })
      ).page[0].state.kind,
    ).toBe("finished");
    expect((await t.query(api.production.getTask, task))?.state).toMatchObject({
      outcome: "unknown",
    });
    await expect(
      t.mutation(api.production.startAttempt, {
        ...start,
        attemptKey: "new-work",
      }),
    ).rejects.toThrow("Task is finished");
    expect(await t.mutation(api.production.startAttempt, start)).toEqual({
      created: false,
    });
  });

  test("missing token/cache/cost data stays explicit and can be refined once", async () => {
    const t = await setup();
    await t.mutation(api.production.finishAttempt, {
      ...attempt,
      receipt: {
        ...receipt,
        usage: { kind: "unknown" },
        cost: { kind: "unknown" },
      },
    });
    await t.mutation(api.production.finishTask, {
      ...task,
      finishedAt: 2000,
      outcome: "success",
      attemptsComplete: true,
    });
    expect(await t.query(api.production.summarizeTasks, range)).toMatchObject({
      knownCostAttempts: 0,
      knownUsageAttempts: 0,
      costPerSuccessfulTaskNanos: null,
    });
    await t.mutation(api.production.finishAttempt, { ...attempt, receipt });
    expect(await t.query(api.production.summarizeTasks, range)).toMatchObject({
      knownCostAttempts: 1,
      knownUsageAttempts: 1,
      costPerSuccessfulTaskNanos: 1200,
    });
    await expect(
      t.mutation(api.production.finishAttempt, {
        ...attempt,
        receipt: { ...receipt, usage: { kind: "unknown" } },
      }),
    ).rejects.toThrow("Conflicting");
  });

  test("cost per successful task includes failed tasks and retries; latency uses task durations", async () => {
    const t = await setup();
    await t.mutation(api.production.finishAttempt, {
      ...attempt,
      receipt: { ...receipt, outcome: "rate_limit" },
    });
    await t.mutation(api.production.startAttempt, {
      ...start,
      attemptKey: "retry",
      startedAt: 1800,
    });
    await t.mutation(api.production.finishAttempt, {
      ...attempt,
      attemptKey: "retry",
      receipt: { ...receipt, firstTextAt: 1900, finishedAt: 2000 },
    });
    await t.mutation(api.production.finishTask, {
      ...task,
      finishedAt: 2200,
      outcome: "success",
      attemptsComplete: true,
    });
    const failed = { ...task, taskKey: "failed-task" };
    await t.mutation(api.production.startTask, { ...failed, startedAt: 1000 });
    await t.mutation(api.production.startAttempt, { ...start, ...failed });
    await t.mutation(api.production.finishAttempt, {
      ...attempt,
      ...failed,
      receipt: { ...receipt, outcome: "error" },
    });
    await t.mutation(api.production.finishTask, {
      ...failed,
      finishedAt: 3000,
      outcome: "failure",
      attemptsComplete: true,
    });
    expect(await t.query(api.production.summarizeTasks, range)).toMatchObject({
      taskCount: 2,
      successfulTasks: 1,
      failedTasks: 1,
      attemptCount: 3,
      failedAttempts: 2,
      knownCostNanos: 3600,
      costPerSuccessfulTaskNanos: 3600,
      latencyMs: { p50: 1200, p95: 2000, p99: 2000, sampleCount: 2 },
    });
  });

  test("empty or incompletely instrumented tasks cannot invent a successful zero-cost metric", async () => {
    const t = convexTest(schema, modules);
    expect(
      (await t.query(api.production.summarizeTasks, range))
        .costPerSuccessfulTaskNanos,
    ).toBeNull();
    await t.mutation(api.production.startTask, { ...task, startedAt: 1000 });
    await t.mutation(api.production.finishTask, {
      ...task,
      finishedAt: 2000,
      outcome: "success",
      attemptsComplete: false,
    });
    expect(
      (await t.query(api.production.summarizeTasks, range))
        .costPerSuccessfulTaskNanos,
    ).toBeNull();
  });

  test("all reads and writes use tenant plus use case scope", async () => {
    const t = await setup();
    const other = { ...task, tenantId: "other-community" };
    expect(await t.query(api.production.getTask, other)).toBeNull();
    expect(
      (
        await t.query(api.production.listAttempts, {
          ...other,
          paginationOpts: page,
        })
      ).page,
    ).toEqual([]);
    expect(
      (
        await t.query(api.production.listTasks, {
          ...scope,
          tenantId: "other-community",
          paginationOpts: page,
        })
      ).page,
    ).toEqual([]);
    await expect(
      t.mutation(api.production.finishAttempt, {
        ...attempt,
        ...other,
        receipt,
      }),
    ).rejects.toThrow("Attempt not found");
    await expect(
      t.mutation(api.production.finishTask, {
        ...other,
        finishedAt: 2000,
        outcome: "success",
        attemptsComplete: true,
      }),
    ).rejects.toThrow("Task not found");
  });

  test("rejects invalid numeric measurements, times and oversized pages", async () => {
    const t = await setup();
    for (const cost of [-1, 0.1, Number.MAX_SAFE_INTEGER + 1]) {
      await expect(
        t.mutation(api.production.finishAttempt, {
          ...attempt,
          receipt: {
            ...receipt,
            cost: { kind: "known", nanos: cost, source: "authoritative" },
          },
        }),
      ).rejects.toThrow("Invalid cost");
    }
    await expect(
      t.mutation(api.production.finishAttempt, {
        ...attempt,
        receipt: { ...receipt, firstTextAt: 900 },
      }),
    ).rejects.toThrow("First text");
    await expect(
      t.mutation(api.production.finishAttempt, {
        ...attempt,
        receipt: {
          ...receipt,
          usage: {
            kind: "known",
            inputTokens: 1,
            outputTokens: 2,
            cachedInputTokens: 3,
          },
        },
      }),
    ).rejects.toThrow("Cached tokens");
    await expect(
      t.query(api.production.listTasks, {
        ...scope,
        paginationOpts: { ...page, numItems: 500 },
      }),
    ).rejects.toThrow("Page size");
  });

  test("bounded cohorts announce task and attempt truncation and suppress full cost metric", async () => {
    const t = await setup();
    await t.run(async (ctx) => {
      for (let i = 0; i < 51; i++) {
        await ctx.db.insert("production_tasks", {
          ...task,
          taskKey: `extra-${i}`,
          startedAt: 1100 + i,
          state: { kind: "running" },
        });
      }
    });
    expect(await t.query(api.production.summarizeTasks, range)).toMatchObject({
      taskCount: 50,
      coverage: { tasksTruncated: true },
      costPerSuccessfulTaskNanos: null,
    });
    const firstPage = await t.query(api.production.listTasks, {
      ...scope,
      paginationOpts: page,
    });
    expect(firstPage.isDone).toBe(false);
    expect(
      (
        await t.query(api.production.listTasks, {
          ...scope,
          paginationOpts: { ...page, cursor: firstPage.continueCursor },
        })
      ).page,
    ).toHaveLength(2);
    await t.run(async (ctx) => {
      for (let i = 0; i < 51; i++)
        await ctx.db.insert("production_attempts", {
          ...start,
          attemptKey: `many-${i}`,
          state: { kind: "pending" },
        });
    });
    expect(
      await t.query(api.production.summarizeTasks, { ...range, to: 1050 }),
    ).toMatchObject({
      attemptCount: 50,
      coverage: { tasksWithTruncatedAttempts: 1 },
    });
  });
});
