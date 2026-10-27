/* global process, console, setTimeout, clearTimeout */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { ConvexClient } from "convex/browser";
import { internal } from "./convex/_generated/api.js";

const url = process.env.CONVEX_SELF_HOSTED_URL;
const key = process.env.CONVEX_SELF_HOSTED_ADMIN_KEY;
if (!url || !key || new URL(url).hostname !== "127.0.0.1") {
  throw new Error(
    "Run with --env-file=.env.local against the owned localhost backend",
  );
}
const client = new ConvexClient(url);
client.setAdminAuth(key);
const tenantId = `local-pilot-${randomUUID()}`;
const taskKey = randomUUID();
const args = {
  tenantId,
  taskKey,
  dispatchKey: randomUUID(),
  ownerId: tenantId,
  provider: "mock",
  model: "pilot-model",
};
const identity = { tenantId, taskKey, dispatchKey: args.dispatchKey };
const range = { tenantId, from: 0, to: Date.now() + 60000 };
let unsubscribe = () => {};
try {
  await assert.rejects(
    client.mutation(internal.taskPilot.admit, {
      ...args,
      provider: "x".repeat(257),
    }),
    /Invalid provider/,
  );
  assert.equal(
    (await client.query(internal.taskPilot.inspectSummary, range)).taskCount,
    0,
  );
  const admission = await client.mutation(internal.taskPilot.admit, args);
  assert.equal(admission.kind, "dispatch");
  assert.equal(
    (await client.mutation(internal.taskPilot.admit, args)).kind,
    "pending",
  );
  const receipt = {
    outcome: "success",
    finishedAt: Date.now(),
    usage: {
      kind: "known",
      inputTokens: 100,
      outputTokens: 20,
      cachedInputTokens: 30,
    },
    cost: { kind: "known", nanos: 1000, source: "authoritative" },
  };
  await assert.rejects(
    client.mutation(internal.taskPilot.settle, {
      ...identity,
      receipt: { ...receipt, firstTextAt: 0 },
    }),
    /First text outside attempt/,
  );
  assert.equal(
    (await client.query(internal.taskPilot.inspectSummary, range))
      .knownCostNanos,
    0,
  );
  const snapshots = [];
  let resolveUpdate;
  let resolveInitial;
  const initial = new Promise((resolve) => {
    resolveInitial = resolve;
  });
  const updated = new Promise((resolve) => {
    resolveUpdate = resolve;
  });
  unsubscribe = client.onUpdate(
    internal.taskPilot.inspectSummary,
    range,
    (value) => {
      snapshots.push(value.knownCostNanos);
      resolveInitial();
      if (value.costPerSuccessfulTaskNanos === 1000) resolveUpdate();
    },
  );
  let initialTimer;
  try {
    await Promise.race([
      initial,
      new Promise((_, reject) => {
        initialTimer = setTimeout(
          () => reject(new Error("Initial subscription timed out")),
          10000,
        );
      }),
    ]);
  } finally {
    clearTimeout(initialTimer);
  }
  await client.mutation(internal.taskPilot.settle, { ...identity, receipt });
  await client.mutation(internal.taskPilot.settle, { ...identity, receipt });
  await client.mutation(internal.taskPilot.complete, {
    tenantId,
    taskKey,
    finishedAt: receipt.finishedAt,
    outcome: "success",
    attemptsComplete: true,
  });
  let timer;
  try {
    await Promise.race([
      updated,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Subscription timed out")),
          10000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
  const result = await client.query(internal.taskPilot.inspectSummary, range);
  assert.equal(result.attemptCount, 1);
  assert.deepEqual(
    await client.query(internal.taskPilot.inspectPages, { tenantId, taskKey }),
    { tasks: 1, attempts: 1 },
  );
  assert.equal(result.knownCostNanos, 1000);
  assert.equal(result.costPerSuccessfulTaskNanos, 1000);
  assert.equal(snapshots[0], 0);
  console.log(
    JSON.stringify({
      passed: true,
      scope: "local sibling-component accounting and subscription",
      taskCount: result.taskCount,
      attemptCount: result.attemptCount,
      costPerSuccessfulTaskNanos: result.costPerSuccessfulTaskNanos,
      snapshots,
    }),
  );
} finally {
  unsubscribe();
  await client.close();
}
