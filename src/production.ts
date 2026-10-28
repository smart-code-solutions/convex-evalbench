import { v, type Infer } from "convex/values";

export const tenantRetention = v.union(
  v.object({ kind: v.literal("retained"), before: v.number() }),
  v.object({ kind: v.literal("deleted") }),
);
export const taskScope = { tenantId: v.string(), useCase: v.string() };
export const taskIdentity = { ...taskScope, taskKey: v.string() };
export const taskStart = {
  ...taskIdentity,
  startedAt: v.number(),
  version: v.optional(v.string()),
};
export const taskOutcome = v.union(
  v.literal("success"),
  v.literal("failure"),
  v.literal("unknown"),
);
export const taskState = v.union(
  v.object({ kind: v.literal("running") }),
  v.object({
    kind: v.literal("finished"),
    finishedAt: v.number(),
    outcome: taskOutcome,
    attemptsComplete: v.boolean(),
  }),
);
export const taskFields = { ...taskStart, state: taskState };
export const taskDocument = v.object({
  ...taskFields,
  _id: v.id("production_tasks"),
  _creationTime: v.number(),
});
export const attemptIdentity = { ...taskIdentity, attemptKey: v.string() };
export const attemptStart = {
  ...attemptIdentity,
  provider: v.string(),
  model: v.string(),
  startedAt: v.number(),
};
export const attemptUsage = v.union(
  v.object({ kind: v.literal("unknown") }),
  v.object({
    kind: v.literal("known"),
    inputTokens: v.number(),
    outputTokens: v.number(),
    cachedInputTokens: v.optional(v.number()),
  }),
);
export const attemptCost = v.union(
  v.object({ kind: v.literal("unknown") }),
  v.object({
    kind: v.literal("known"),
    nanos: v.number(),
    source: v.union(
      v.literal("authoritative"),
      v.literal("token_estimate"),
      v.literal("reservation_estimate"),
    ),
  }),
);
export const attemptReceipt = v.object({
  outcome: v.union(
    v.literal("success"),
    v.literal("error"),
    v.literal("timeout"),
    v.literal("rate_limit"),
    v.literal("cancelled"),
  ),
  finishedAt: v.number(),
  firstTextAt: v.optional(v.number()),
  usage: attemptUsage,
  cost: attemptCost,
});
export const attemptState = v.union(
  v.object({ kind: v.literal("pending") }),
  v.object({ kind: v.literal("unknown") }),
  v.object({ kind: v.literal("finished"), receipt: attemptReceipt }),
);
export const attemptFields = { ...attemptStart, state: attemptState };
export const attemptDocument = v.object({
  ...attemptFields,
  _id: v.id("production_attempts"),
  _creationTime: v.number(),
});
// Component document IDs cross the host boundary as opaque strings.
export const productionTask = v.object({
  ...taskFields,
  _id: v.string(),
  _creationTime: v.number(),
});
export const productionAttempt = v.object({
  ...attemptFields,
  _id: v.string(),
  _creationTime: v.number(),
});
export type TaskReceipt = Infer<typeof taskState>;
export type AttemptReceipt = Infer<typeof attemptReceipt>;

/** Unknown values may be refined; known receipt facts cannot be overwritten. */
export function refineReceipt(
  old: AttemptReceipt,
  next: AttemptReceipt,
): AttemptReceipt {
  if (
    old.outcome !== next.outcome ||
    old.finishedAt !== next.finishedAt ||
    (old.firstTextAt !== undefined && old.firstTextAt !== next.firstTextAt) ||
    (old.usage.kind === "known" && !sameValue(old.usage, next.usage)) ||
    (old.cost.kind === "known" && !sameValue(old.cost, next.cost))
  ) {
    throw new Error("Conflicting attempt receipt");
  }
  return next;
}

export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(b, key) &&
        sameValue(Reflect.get(a, key), Reflect.get(b, key)),
    )
  );
}

export function nonnegative(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid ${name}`);
}

export function validateReceipt(
  receipt: AttemptReceipt,
  startedAt: number,
): void {
  nonnegative(receipt.finishedAt, "finishedAt");
  if (receipt.finishedAt < startedAt)
    throw new Error("Receipt precedes dispatch");
  if (receipt.firstTextAt !== undefined) {
    nonnegative(receipt.firstTextAt, "firstTextAt");
    if (
      receipt.firstTextAt < startedAt ||
      receipt.firstTextAt > receipt.finishedAt
    )
      throw new Error("First text outside attempt");
  }
  if (receipt.usage.kind === "known") {
    for (const value of [
      receipt.usage.inputTokens,
      receipt.usage.outputTokens,
      receipt.usage.cachedInputTokens ?? 0,
    ]) {
      if (!Number.isSafeInteger(value) || value < 0)
        throw new Error("Invalid token count");
    }
    if ((receipt.usage.cachedInputTokens ?? 0) > receipt.usage.inputTokens)
      throw new Error("Cached tokens exceed input");
  }
  if (
    receipt.cost.kind === "known" &&
    (!Number.isSafeInteger(receipt.cost.nanos) || receipt.cost.nanos < 0)
  )
    throw new Error("Invalid cost nanos");
}

export const productionSummary = v.object({
  taskCount: v.number(),
  finishedTasks: v.number(),
  successfulTasks: v.number(),
  failedTasks: v.number(),
  unknownOutcomeTasks: v.number(),
  attemptCount: v.number(),
  unresolvedAttempts: v.number(),
  failedAttempts: v.number(),
  knownUsageAttempts: v.number(),
  knownCostAttempts: v.number(),
  cachedUsageAttempts: v.number(),
  firstTextAttempts: v.number(),
  inputTokens: v.number(),
  outputTokens: v.number(),
  cachedInputTokens: v.number(),
  knownCostNanos: v.number(),
  costPerSuccessfulTaskNanos: v.union(v.number(), v.null()),
  latencyMs: v.object({
    p50: v.union(v.number(), v.null()),
    p95: v.union(v.number(), v.null()),
    p99: v.union(v.number(), v.null()),
    sampleCount: v.number(),
  }),
  coverage: v.object({
    tasksTruncated: v.boolean(),
    tasksWithTruncatedAttempts: v.number(),
    taskLimit: v.number(),
    attemptsPerTaskLimit: v.number(),
    oldestTaskStartedAt: v.union(v.number(), v.null()),
    asOf: v.number(),
  }),
});
