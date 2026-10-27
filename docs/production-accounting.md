# Production task accounting pilot

This unpublished fork adds strict accounting beside Evalbench's best-effort
traces and evaluation batches. **The upstream npm package does not contain it.**

## Install and configure

Build the fork with Node 22+:

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm build
corepack pnpm pack --out ../convex-evalbench-pilot.tgz
```

Install that tarball in your app using its package manager:

```sh
bun add /absolute/path/to/convex-evalbench-pilot.tgz
```

Add the component beside the application's existing AI Budget instance:

```ts
// convex/convex.config.ts — keep your existing app and app.use(aiBudget).
import evalbench from "convex-evalbench/convex.config";
app.use(evalbench);
```

Run the app's usual isolated Convex setup/codegen, then construct the client:

```ts
import { Evalbench } from "convex-evalbench";
import { components } from "./_generated/api";
const tasks = new Evalbench(components.evalbench).production;
```

AI Budget is a development dependency of this repo's example, not a nested
component or runtime dependency of Evalbench. The workspace's Agent 0.7.8 type
patch does not propagate to consumers; see [compatibility.md](compatibility.md).

## API

Identities contain `tenantId` and `useCase`. A task adds `taskKey`; an attempt
adds `attemptKey`. Use opaque IDs, never prompts or personal information.

| Method               | Arguments after `ctx`                                         |
| -------------------- | ------------------------------------------------------------- |
| `startTask`          | `{ tenantId, useCase, taskKey, startedAt, version? }`         |
| `startAttempt`       | `{ ...taskIdentity, attemptKey, provider, model, startedAt }` |
| `markAttemptUnknown` | `attemptIdentity`                                             |
| `finishAttempt`      | `{ ...attemptIdentity, receipt }`                             |
| `finishTask`         | `{ ...taskIdentity, outcome, finishedAt, attemptsComplete }`  |
| `getTask`            | `taskIdentity`                                                |
| `listTasks`          | `{ tenantId, useCase, paginationOpts }`                       |
| `listAttempts`       | `{ ...taskIdentity, paginationOpts }`                         |
| `summarizeTasks`     | `{ tenantId, useCase, from, to }`                             |

Starts return `{ created }`. Reads are reactive queries; writes are strict
mutations whose failures propagate. Pagination accepts 1–50 rows.

```ts
await tasks.finishAttempt(ctx, {
  tenantId: communityId,
  useCase: "resident-ask",
  taskKey: runId,
  attemptKey: requestId,
  receipt: {
    outcome: "success",
    finishedAt,
    firstTextAt,
    usage: {
      kind: "known",
      inputTokens: 100,
      outputTokens: 20,
      cachedInputTokens: 30,
    },
    cost: { kind: "known", nanos: 1200, source: "token_estimate" },
  },
});
```

Usage and cost independently accept `{ kind: "unknown" }`. Cost sources are
`authoritative`, `token_estimate`, or `reservation_estimate`. Read cost from the
canonical budget receipt; this component does not price, reserve or charge.
Token counts and nanos must be nonnegative safe integers. Cached input is a
subset of input. Attempt outcomes are success/error/timeout/rate_limit/cancelled.
Task outcomes are application-supplied success/failure/unknown.

## Integration boundaries

1. Accept a task with a stable identity, accepted timestamp and version.
2. In a host mutation, reserve existing AI Budget and start one attempt together.
   Dispatch in an action only after fresh admission. Settle the budget and
   receipt in a second host mutation. Every actual retry/fallback gets a new
   attempt; do not also count SDK/Agent aggregate usage as another dispatch.
3. Finish the task when the application commits its product outcome and no new
   task-scoped dispatches can start. Include deferred work in this boundary or
   give it a separate task. A model response alone is not task success.

[`taskPilot.ts`](../example/convex/taskPilot.ts) implements the budget coordination
with sibling components. Durable dispatch mapping makes replay return `pending`,
never another dispatch. Blocked admissions return normally so diagnostics commit.
Budget counter/history folding remains its own asynchronous responsibility.

External inference is outside the transaction. Preserve uncertain dispatches as
unknown; reconcile saved provider evidence. Retry settlement after accounting
failure, never re-run the provider because persistence failed. The host owns
durable receipt/result retention and recovery; this package is not an outbox or
external-call runner. The executable example deliberately calls no provider.

## UI queries

The app must authorize the exact tenant before calling component queries. Use
BoardSense's `currentUserCanManageCommunity` or EasyGov's existing account policy.
Never expose a client-supplied tenant without membership checks.

```ts
import { productionSummary } from "convex-evalbench";
import { v } from "convex/values";
import { query } from "./_generated/server";

export const summary = query({
  args: { communityId: v.string(), from: v.number(), to: v.number() },
  returns: productionSummary,
  handler: async (ctx, { communityId, ...range }) => {
    await requireCommunityAdmin(ctx, communityId); // your application's policy
    return tasks.summarizeTasks(ctx, {
      tenantId: communityId,
      useCase: "resident-ask",
      ...range,
    });
  },
});
```

```tsx
const metrics = useQuery(api.aiObservability.summary, {
  communityId,
  from,
  to,
});
```

No polling is needed. Keep a subscription's time range fixed; update its bounds
deliberately for a moving window. The existing dashboard does not yet render
these new reports.

## Report semantics

The report selects the newest **50 tasks** started in `[from, to)` for one tenant
and use case, with at most **50 attempts per task**. It reports truncation,
limits, oldest selected start and query evaluation time. Totals include selected
task attempts completed after the range end: this is a task-start cohort, not a
calendar spend report. Latency percentiles use exact nearest rank over completed
task durations; display sample count, especially with small p99 samples.

Token/cache/cost totals are known partial sums with explicit coverage counts.
Inspect attempt cost sources before calling estimates actual billed spend.
Cost per successful task includes failed tasks and retries. It is `null` unless
the requested cohort fits, all tasks have known final outcomes, all attempts have
known costs, and the host declares complete instrumentation.

`attemptsComplete: false` permanently discloses missing instrumentation; it is
not a pending-work marker and cannot later become true. Known pending attempts
already suppress full cost metrics until their receipts resolve. A task with no
provider calls can explicitly declare complete instrumentation and zero cost.

Finished tasks reject new attempts but accept late receipts for existing attempts.
Receipts may refine unknown usage/cost; known facts cannot be overwritten or
erased. Changed product outcomes/new executions need new task identities.

## Run the local proof

```sh
corepack pnpm local:start
# In another shell:
corepack pnpm exec convex dev --once --typecheck-components
node --env-file=.env.local example/task-proof.mjs
```

The proof uses admin authentication against the owned localhost backend,
synthetic IDs and deterministic receipts, checking rollback, replay and live
query updates. Unit/transaction tests run with `corepack pnpm test`.

Production accounting has **no retention/deletion API yet**; `pruneTraces` only
prunes spans. Keep this pilot on local/synthetic data until deletion and late-write
fencing are integrated. Tools, retrieval/eval scores, feedback, guardrails,
token-level ITL, stream chunk timing and context utilization are not automatic.
See the [full checklist mapping](metrics-coverage.md).
