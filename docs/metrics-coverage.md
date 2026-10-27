# Metrics coverage and delivery

This compares the original AI metrics checklist with upstream Evalbench at
`105c07ddd1d927e0bbb3ba321c1df939489e1852`. It describes capabilities and proposed
extensions, not completed implementation. Refreshing dependencies does not add
missing measurements, accounting, or summaries.

## Delivery model

1. Application/provider adapters observe calls, streams, tools, and outcomes.
2. Convex mutations persist normalized observations; actions perform external
   calls and evaluation execution.
3. Bounded indexed queries and stored summaries return metrics with their
   denominators, coverage, and freshness.
4. App-authorized Convex queries expose those results to a custom UI or the
   companion dashboard. The component does not authorize tenants automatically.

Evalbench already provides span storage, reactive trace/run queries, versioned
datasets, evaluation workers, scorer hooks, comparisons, and a dashboard. The
proposed additions below must preserve that functionality.

## Checklist mapping

| Requirement                                  | Upstream capability                                                                                     | Required addition                                                                                                                                                                                                              |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Time to first token/text                     | AI SDK adapter measures total call duration; Agent usage hook cannot measure individual LLM start time. | Timestamp dispatch and first nonempty text event. Expose first-text coverage. Client first-render timing is separate.                                                                                                          |
| Inter-token latency                          | Stream text is observable, but token timings are not stored.                                            | Measure semantic text-chunk gaps. Label them as inter-chunk latency; exact ITL requires provider token-level timing.                                                                                                           |
| End-to-end p50/p95/p99                       | Individual spans and eval items can contain durations.                                                  | Persist task start/end and use-case/version dimensions; aggregate distributions. Do not average percentile values.                                                                                                             |
| Per-user and system token throughput         | Spans can contain token totals and elapsed time.                                                        | Add user-scoped generation rates and wall-clock interval throughput; these use different denominators.                                                                                                                         |
| Input/output tokens per request              | Both model adapters record available usage totals.                                                      | Preserve missing usage and correlate actual provider attempts, including retries and batching.                                                                                                                                 |
| Prompt-cache hit rate                        | Provider metadata may contain cache information.                                                        | Normalize cache read/write quantities and report request hit rate separately from cached-token share. Distinguish prompt caching from application result caching.                                                              |
| Cost per successful task                     | Optional span/item `costUsd` fields exist.                                                              | Add authoritative attempt receipts, stable task correlation, pricing provenance, and explicit product success criteria. Headline unit economics divides all cohort spend, including failed tasks/retries, by successful tasks. |
| Labeled eval success on version changes      | Versioned datasets, targets, scorers, run counters, and comparisons exist.                              | Application explicitly registers behavior versions and starts an idempotent evaluation batch for the required suite. No automatic discovery of prompt changes exists.                                                          |
| Groundedness                                 | Custom scorers and LLM-as-judge can evaluate it.                                                        | Supply retrieved evidence, rubric, and scorer; retain the judgment's version and evidence references. An evaluator existing does not establish calibrated correctness.                                                         |
| Retrieval precision@k and recall@k           | Custom scorers can implement them.                                                                      | Supply ranked retrieval results, relevance labels, `k`, and the expected relevant set. Recall cannot be inferred from returned results alone.                                                                                  |
| Judge scores calibrated against human labels | Judge/custom/consensus results and comparisons exist.                                                   | Join human and judge assessments on the same subject, rubric, and dataset version; report agreement and coverage. Consensus is not human calibration.                                                                          |
| Thumbs, edits, and freeform feedback         | No dedicated feedback contract in the inspected schema.                                                 | Add authorized, revision-aware feedback linked to its task/output. Sensitive text can remain in app-owned evidence.                                                                                                            |
| Provider error/timeout/rate-limit rates      | Spans support error status and an error type.                                                           | Normalize failure categories and provider/model dimensions; count attempted dispatches and expose unknown/missing observations.                                                                                                |
| Provider retry and fallback rates            | Eval workers track retries of dataset targets.                                                          | Capture real provider attempts and retry/fallback relationships. Evaluation-worker attempts are not provider HTTP attempts.                                                                                                    |
| Guardrail and refusal rates                  | Generic spans/metadata can carry application observations.                                              | Add explicit guardrail/refusal decisions and policy versions with valid denominators.                                                                                                                                          |
| Tool-call error rate                         | Generic `tool` spans can be manually recorded.                                                          | Instrument actual tool execution and classify success/failure. The Agent usage hook alone does not record every tool outcome.                                                                                                  |
| Steps/tokens per completed task              | Hierarchical spans and token totals provide some inputs.                                                | Define completed product tasks and agent steps; aggregate across their attempts without counting model/Agent/transport receipts twice.                                                                                         |
| Context-window utilization                   | Token totals and generic metadata exist.                                                                | Record measured input context and the model's applicable limit. Budget reservations are not measured context usage.                                                                                                            |

## Accounting boundary

Tracing is best-effort by upstream contract. `recordSpan` logs and swallows its
own persistence failures, so trace rows must not become the billing ledger.

Keep the existing AI Budget instance as the reservation/budget owner. A future
accounting integration must commit budget admission plus an attempt receipt in
one parent-app mutation, and settle the budget plus durable usage in another.
The external request happens between those transactions and cannot be atomic
with them. Unknown outcomes require reconciliation; accounting retries reuse
the attempt identity and must not trigger another provider call.

Project the same identities into diagnostic spans. An evaluation target and
each paid scorer also pass through the budgeted provider boundary. Do not add
an independent live balance or infer spend by summing potentially missing spans.

## Reactive reporting contract

Every new summary needs a bounded window and supported indexed dimensions such
as tenant, use case, provider/model, and behavior version. A trace query alone is
not a time-series metrics API. Return samples, eligible denominator, incomplete
observations, freshness, and disclosed percentile approximation. Paginate long
traces; never treat missing usage or an unreviewed outcome as zero/success.

## Extension order

First verify dependency/adapter compatibility. Next add the missing measurements
and bounded reactive summaries. Add task/attempt accounting with the existing
AI Budget component before promising complete unit economics. Reuse Evalbench's
evaluation engine while adding domain scorers, human calibration, and feedback.
Pilot one BoardSense path, then validate the contracts with EasyGov.

No dependency update, dataset pass rate, or dashboard screenshot by itself
establishes that the entire checklist is delivered.
