import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api.js";
import schema from "./schema.js";
import { modules } from "./setup.test.js";

const task = { tenantId: "tenant-a", useCase: "answer", taskKey: "run-1" };
const attempt = { ...task, attemptKey: "request-1" };
const page = { numItems: 50, cursor: null };
const receipt = {
  outcome: "success" as const,
  finishedAt: 3000,
  usage: { kind: "unknown" as const },
  cost: { kind: "unknown" as const },
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(10000);
});
afterEach(() => vi.useRealTimers());
async function fixture(count = 1) {
  const t = convexTest(schema, modules);
  await t.mutation(api.production.startTask, { ...task, startedAt: 1000 });
  await t.run(async (ctx) => {
    for (let index = 0; index < count; index++)
      await ctx.db.insert("production_attempts", {
        ...attempt,
        attemptKey: `request-${index + 1}`,
        provider: "synthetic",
        model: "synthetic",
        startedAt: 1100,
        state: { kind: "pending" },
      });
  });
  return t;
}
async function expectHidden(t: Awaited<ReturnType<typeof fixture>>) {
  expect(await t.query(api.production.getTask, task)).toBeNull();
  expect(
    (
      await t.query(api.production.listTasks, {
        tenantId: task.tenantId,
        useCase: task.useCase,
        paginationOpts: page,
      })
    ).page,
  ).toEqual([]);
  expect(
    (
      await t.query(api.production.listAttempts, {
        ...task,
        paginationOpts: page,
      })
    ).page,
  ).toEqual([]);
  expect(
    (
      await t.query(api.production.summarizeTasks, {
        tenantId: task.tenantId,
        useCase: task.useCase,
        from: 0,
        to: 10000,
      })
    ).taskCount,
  ).toBe(0);
}
async function lateWrites(t: Awaited<ReturnType<typeof fixture>>) {
  expect(
    await t.mutation(api.production.startTask, { ...task, startedAt: 1000 }),
  ).toEqual({ created: false });
  expect(
    await t.mutation(api.production.startTask, { ...task, startedAt: 9000 }),
  ).toEqual({ created: false });
  expect(
    await t.mutation(api.production.startAttempt, {
      ...attempt,
      provider: "synthetic",
      model: "synthetic",
      startedAt: 2000,
    }),
  ).toEqual({ created: false });
  await t.mutation(api.production.markAttemptUnknown, attempt);
  await t.mutation(api.production.finishAttempt, { ...attempt, receipt });
  await t.mutation(api.production.finishTask, {
    ...task,
    outcome: "success",
    finishedAt: 3000,
    attemptsComplete: true,
  });
}

test("task deletion is immediately hidden, drains bounded batches, and permanently fences late identities", async () => {
  const t = await fixture(205);
  expect(await t.mutation(api.productionLifecycle.deleteTask, task)).toEqual({
    complete: false,
  });
  await expectHidden(t);
  await lateWrites(t);
  expect(
    await t.run((ctx) => ctx.db.query("production_attempts").collect()),
  ).toHaveLength(205);
  await t.mutation(internal.productionLifecycle.cleanTask, task);
  expect(
    await t.run((ctx) => ctx.db.query("production_attempts").collect()),
  ).toHaveLength(105);
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(
    await t.run((ctx) => ctx.db.query("production_attempts").collect()),
  ).toEqual([]);
  expect(await t.mutation(api.productionLifecycle.deleteTask, task)).toEqual({
    complete: true,
  });
  await lateWrites(t);
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  await expectHidden(t);
  const fences = await t.run((ctx) =>
    ctx.db.query("production_deleted_tasks").collect(),
  );
  expect(fences).toHaveLength(1);
  expect(Object.keys(fences[0]).sort()).toEqual(
    [
      "_creationTime",
      "_id",
      "cleanupPending",
      "taskKey",
      "tenantId",
      "useCase",
    ].sort(),
  );
});

test("tenant deletion drains multiple tables and use cases, cannot be reset and leaves other tenants intact", async () => {
  const t = await fixture(110);
  await t.run(async (ctx) => {
    for (let index = 0; index < 110; index++)
      await ctx.db.insert("production_tasks", {
        ...task,
        useCase: `case-${index}`,
        taskKey: `run-${index}`,
        startedAt: 1000,
        state: { kind: "running" },
      });
  });
  const other = { ...task, tenantId: "tenant-b" };
  await t.mutation(api.production.startTask, { ...other, startedAt: 1000 });
  await t.mutation(api.productionLifecycle.deleteTask, task);
  await t.mutation(api.productionLifecycle.deleteTenant, {
    tenantId: task.tenantId,
  });
  await expectHidden(t);
  await lateWrites(t);
  await t.mutation(api.productionLifecycle.pruneTenant, {
    tenantId: task.tenantId,
    before: 0,
  });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect((await t.query(api.production.getTask, other))?.taskKey).toBe(
    other.taskKey,
  );
  expect(
    await t.run((ctx) => ctx.db.query("production_attempts").collect()),
  ).toEqual([]);
  expect(
    await t.run((ctx) => ctx.db.query("production_deleted_tasks").collect()),
  ).toEqual([]);
  expect(
    await t.mutation(api.productionLifecycle.deleteTenant, {
      tenantId: task.tenantId,
    }),
  ).toEqual({ complete: true });
  await lateWrites(t);
  await t.mutation(api.productionLifecycle.deleteTask, task);
  expect(
    await t.run((ctx) => ctx.db.query("production_deleted_tasks").collect()),
  ).toEqual([]);
  expect(
    (await t.run((ctx) => ctx.db.query("production_tenants").collect()))[0],
  ).toMatchObject({ state: { kind: "deleted" }, cleanupPending: false });
});

test("retention hides old running/finished tasks immediately, advances monotonically and fences their keys", async () => {
  const t = await fixture(205);
  const recent = { ...task, taskKey: "recent" };
  await t.mutation(api.production.startTask, { ...recent, startedAt: 6000 });
  await t.mutation(api.productionLifecycle.pruneTenant, {
    tenantId: task.tenantId,
    before: 5000,
  });
  expect(
    await t.mutation(api.production.startTask, { ...task, startedAt: 9000 }),
  ).toEqual({ created: false });
  expect(await t.query(api.production.getTask, task)).toBeNull();
  expect(
    (
      await t.query(api.production.listAttempts, {
        ...task,
        paginationOpts: page,
      })
    ).page,
  ).toEqual([]);
  expect(
    (
      await t.query(api.production.listTasks, {
        tenantId: task.tenantId,
        useCase: task.useCase,
        paginationOpts: page,
      })
    ).page.map((row) => row.taskKey),
  ).toEqual(["recent"]);
  expect(
    (
      await t.query(api.production.summarizeTasks, {
        tenantId: task.tenantId,
        useCase: task.useCase,
        from: 0,
        to: 10000,
      })
    ).taskCount,
  ).toBe(1);
  await expect(
    t.mutation(api.production.startTask, { ...recent, startedAt: 1000 }),
  ).rejects.toThrow("Conflicting");
  await t.mutation(api.productionLifecycle.pruneTenant, {
    tenantId: task.tenantId,
    before: 2000,
  });
  await lateWrites(t);
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(
    (await t.run((ctx) => ctx.db.query("production_tenants").collect()))[0]
      .state,
  ).toEqual({ kind: "retained", before: 5000 });
  expect(
    (await t.run((ctx) => ctx.db.query("production_tasks").collect())).map(
      (row) => row.taskKey,
    ),
  ).toEqual(["recent"]);
  expect(
    await t.run((ctx) => ctx.db.query("production_attempts").collect()),
  ).toEqual([]);
  expect(
    await t.mutation(api.productionLifecycle.pruneTenant, {
      tenantId: task.tenantId,
      before: 5000,
    }),
  ).toEqual({ complete: true });
});

test("unseen expired starts establish a fence and cannot later reuse the key with a newer timestamp", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.productionLifecycle.pruneTenant, {
    tenantId: task.tenantId,
    before: 5000,
  });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  await lateWrites(t);
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  await expectHidden(t);
  await expect(
    t.mutation(api.productionLifecycle.pruneTenant, {
      tenantId: task.tenantId,
      before: 20000,
    }),
  ).rejects.toThrow("future");
  await expect(
    t.mutation(api.productionLifecycle.pruneTenant, {
      tenantId: task.tenantId,
      before: NaN,
    }),
  ).rejects.toThrow();
});

test("duplicate deletion and stale cleanup jobs do not erase another tenant or revive data", async () => {
  const t = await fixture();
  await Promise.all([
    t.mutation(api.productionLifecycle.deleteTask, task),
    t.mutation(api.productionLifecycle.deleteTask, task),
  ]);
  await t.mutation(api.productionLifecycle.deleteTenant, {
    tenantId: task.tenantId,
  });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  await t.mutation(internal.productionLifecycle.cleanTask, task);
  await t.mutation(internal.productionLifecycle.cleanTenant, {
    tenantId: task.tenantId,
  });
  await expectHidden(t);
  expect(
    await t.run((ctx) => ctx.db.query("production_attempts").collect()),
  ).toEqual([]);
});
