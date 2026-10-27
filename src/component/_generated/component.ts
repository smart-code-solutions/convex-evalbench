/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    compare: {
      compareRuns: FunctionReference<
        "query",
        "internal",
        { baselineRunId: string; candidateRunId: string },
        {
          baseline: {
            _creationTime: number;
            _id: string;
            completedAt?: number;
            completedCount: number;
            config: {
              concurrency?: number;
              maxAttempts?: number;
              passThreshold?: number;
              scorers: Array<
                | { type: "exactMatch" }
                | { schema: any; type: "jsonSchema" }
                | { config?: any; handle: string; name: string; type: "custom" }
                | {
                    embedderHandle: string;
                    threshold?: number;
                    type: "embeddingSimilarity";
                  }
                | {
                    judgeHandles: Array<string>;
                    name?: string;
                    quorum?: number;
                    type: "consensus";
                  }
              >;
            };
            datasetId: string;
            itemCount: number;
            passedCount: number;
            startedAt: number;
            status: "queued" | "running" | "completed" | "failed" | "canceled";
            summaryScore?: number;
            targetEnv?: string;
            targetHandle: string;
            targetVersion?: string;
            triggeredBy?: string;
          };
          candidate: {
            _creationTime: number;
            _id: string;
            completedAt?: number;
            completedCount: number;
            config: {
              concurrency?: number;
              maxAttempts?: number;
              passThreshold?: number;
              scorers: Array<
                | { type: "exactMatch" }
                | { schema: any; type: "jsonSchema" }
                | { config?: any; handle: string; name: string; type: "custom" }
                | {
                    embedderHandle: string;
                    threshold?: number;
                    type: "embeddingSimilarity";
                  }
                | {
                    judgeHandles: Array<string>;
                    name?: string;
                    quorum?: number;
                    type: "consensus";
                  }
              >;
            };
            datasetId: string;
            itemCount: number;
            passedCount: number;
            startedAt: number;
            status: "queued" | "running" | "completed" | "failed" | "canceled";
            summaryScore?: number;
            targetEnv?: string;
            targetHandle: string;
            targetVersion?: string;
            triggeredBy?: string;
          };
          items: Array<{
            baselinePassed?: boolean;
            baselineScore?: number;
            baselineStatus: string;
            candidatePassed?: boolean;
            candidateScore?: number;
            candidateStatus: string;
            classification:
              "regressed" | "improved" | "unchanged" | "incomplete";
            itemId: string;
            scoreDelta?: number;
          }>;
          stats: {
            baselineMeanScore: number;
            baselinePassed: number;
            baselineTerminal: number;
            candidateMeanScore: number;
            candidatePassed: number;
            candidateTerminal: number;
            improved: number;
            incomplete: number;
            regressed: number;
            total: number;
            unchanged: number;
          };
        },
        Name
      >;
      evaluateGate: FunctionReference<
        "query",
        "internal",
        {
          baselineRunId: string;
          candidateRunId: string;
          thresholds?: {
            maxRegressedItems?: number;
            maxScoreDrop?: number;
            minPassRate?: number;
          };
        },
        {
          ok: boolean;
          reasons: Array<string>;
          stats: {
            baselineMeanScore: number;
            baselinePassed: number;
            baselineTerminal: number;
            candidateMeanScore: number;
            candidatePassed: number;
            candidateTerminal: number;
            improved: number;
            incomplete: number;
            regressed: number;
            total: number;
            unchanged: number;
          };
        },
        Name
      >;
      listRuns: FunctionReference<
        "query",
        "internal",
        { datasetId: string; limit?: number },
        Array<{
          _creationTime: number;
          _id: string;
          completedAt?: number;
          completedCount: number;
          config: {
            concurrency?: number;
            maxAttempts?: number;
            passThreshold?: number;
            scorers: Array<
              | { type: "exactMatch" }
              | { schema: any; type: "jsonSchema" }
              | { config?: any; handle: string; name: string; type: "custom" }
              | {
                  embedderHandle: string;
                  threshold?: number;
                  type: "embeddingSimilarity";
                }
              | {
                  judgeHandles: Array<string>;
                  name?: string;
                  quorum?: number;
                  type: "consensus";
                }
            >;
          };
          datasetId: string;
          itemCount: number;
          passedCount: number;
          startedAt: number;
          status: "queued" | "running" | "completed" | "failed" | "canceled";
          summaryScore?: number;
          targetEnv?: string;
          targetHandle: string;
          targetVersion?: string;
          triggeredBy?: string;
        }>,
        Name
      >;
    };
    datasets: {
      addItems: FunctionReference<
        "mutation",
        "internal",
        {
          datasetId: string;
          items: Array<{
            expectedOutput?: any;
            expectedTools?: Array<string>;
            input: any;
            slice?: string;
            tags?: Array<string>;
          }>;
        },
        null,
        Name
      >;
      archiveDataset: FunctionReference<
        "mutation",
        "internal",
        { datasetId: string },
        null,
        Name
      >;
      createDataset: FunctionReference<
        "mutation",
        "internal",
        {
          description?: string;
          items?: Array<{
            expectedOutput?: any;
            expectedTools?: Array<string>;
            input: any;
            slice?: string;
            tags?: Array<string>;
          }>;
          name: string;
        },
        string,
        Name
      >;
      listDatasets: FunctionReference<
        "query",
        "internal",
        { includeArchived?: boolean },
        Array<{
          _creationTime: number;
          _id: string;
          archived: boolean;
          description?: string;
          itemCount: number;
          name: string;
          parentVersionId?: string;
          version: number;
        }>,
        Name
      >;
      listItems: FunctionReference<
        "query",
        "internal",
        { datasetId: string },
        Array<{
          _creationTime: number;
          _id: string;
          datasetId: string;
          expectedOutput?: any;
          expectedTools?: Array<string>;
          input: any;
          slice?: string;
          tags?: Array<string>;
        }>,
        Name
      >;
      versionDataset: FunctionReference<
        "mutation",
        "internal",
        { datasetId: string },
        string,
        Name
      >;
    };
    ingestion: {
      pruneTraces: FunctionReference<
        "mutation",
        "internal",
        { limit?: number; olderThanMs?: number },
        { deleted: number; hasMore: boolean },
        Name
      >;
      recordSpan: FunctionReference<
        "mutation",
        "internal",
        {
          agentName?: string;
          costUsd?: number;
          endedAt?: number;
          errorType?: string;
          inputTokens?: number;
          kind: "llm" | "tool" | "agent_step" | "workflow_step" | "judge";
          latencyMs?: number;
          metadata?: any;
          model?: string;
          operationName: string;
          outputTokens?: number;
          parentSpanId?: string;
          provider?: string;
          runId?: string;
          spanId: string;
          startedAt: number;
          status: "running" | "success" | "error";
          threadId?: string;
          totalTokens?: number;
          traceId: string;
          userId?: string;
        },
        string,
        Name
      >;
      recordSpansBatch: FunctionReference<
        "mutation",
        "internal",
        {
          spans: Array<{
            agentName?: string;
            costUsd?: number;
            endedAt?: number;
            errorType?: string;
            inputTokens?: number;
            kind: "llm" | "tool" | "agent_step" | "workflow_step" | "judge";
            latencyMs?: number;
            metadata?: any;
            model?: string;
            operationName: string;
            outputTokens?: number;
            parentSpanId?: string;
            provider?: string;
            runId?: string;
            spanId: string;
            startedAt: number;
            status: "running" | "success" | "error";
            threadId?: string;
            totalTokens?: number;
            traceId: string;
            userId?: string;
          }>;
        },
        Array<string>,
        Name
      >;
      recordSpanWithContent: FunctionReference<
        "action",
        "internal",
        {
          agentName?: string;
          costUsd?: number;
          endedAt?: number;
          errorType?: string;
          input?: string;
          inputTokens?: number;
          kind: "llm" | "tool" | "agent_step" | "workflow_step" | "judge";
          latencyMs?: number;
          metadata?: any;
          model?: string;
          operationName: string;
          output?: string;
          outputTokens?: number;
          parentSpanId?: string;
          provider?: string;
          runId?: string;
          spanId: string;
          startedAt: number;
          status: "running" | "success" | "error";
          threadId?: string;
          totalTokens?: number;
          traceId: string;
          userId?: string;
        },
        string,
        Name
      >;
    };
    production: {
      finishAttempt: FunctionReference<
        "mutation",
        "internal",
        {
          attemptKey: string;
          receipt: {
            cost:
              | { kind: "unknown" }
              | {
                  kind: "known";
                  nanos: number;
                  source:
                    "authoritative" | "token_estimate" | "reservation_estimate";
                };
            finishedAt: number;
            firstTextAt?: number;
            outcome:
              "success" | "error" | "timeout" | "rate_limit" | "cancelled";
            usage:
              | { kind: "unknown" }
              | {
                  cachedInputTokens?: number;
                  inputTokens: number;
                  kind: "known";
                  outputTokens: number;
                };
          };
          taskKey: string;
          tenantId: string;
          useCase: string;
        },
        null,
        Name
      >;
      finishTask: FunctionReference<
        "mutation",
        "internal",
        {
          attemptsComplete: boolean;
          finishedAt: number;
          outcome: "success" | "failure" | "unknown";
          taskKey: string;
          tenantId: string;
          useCase: string;
        },
        null,
        Name
      >;
      getTask: FunctionReference<
        "query",
        "internal",
        { taskKey: string; tenantId: string; useCase: string },
        {
          _creationTime: number;
          _id: string;
          startedAt: number;
          state:
            | { kind: "running" }
            | {
                attemptsComplete: boolean;
                finishedAt: number;
                kind: "finished";
                outcome: "success" | "failure" | "unknown";
              };
          taskKey: string;
          tenantId: string;
          useCase: string;
          version?: string;
        } | null,
        Name
      >;
      listAttempts: FunctionReference<
        "query",
        "internal",
        {
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
          taskKey: string;
          tenantId: string;
          useCase: string;
        },
        {
          continueCursor: string;
          isDone: boolean;
          page: Array<{
            _creationTime: number;
            _id: string;
            attemptKey: string;
            model: string;
            provider: string;
            startedAt: number;
            state:
              | { kind: "pending" }
              | { kind: "unknown" }
              | {
                  kind: "finished";
                  receipt: {
                    cost:
                      | { kind: "unknown" }
                      | {
                          kind: "known";
                          nanos: number;
                          source:
                            | "authoritative"
                            | "token_estimate"
                            | "reservation_estimate";
                        };
                    finishedAt: number;
                    firstTextAt?: number;
                    outcome:
                      | "success"
                      | "error"
                      | "timeout"
                      | "rate_limit"
                      | "cancelled";
                    usage:
                      | { kind: "unknown" }
                      | {
                          cachedInputTokens?: number;
                          inputTokens: number;
                          kind: "known";
                          outputTokens: number;
                        };
                  };
                };
            taskKey: string;
            tenantId: string;
            useCase: string;
          }>;
        },
        Name
      >;
      listTasks: FunctionReference<
        "query",
        "internal",
        {
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
          tenantId: string;
          useCase: string;
        },
        {
          continueCursor: string;
          isDone: boolean;
          page: Array<{
            _creationTime: number;
            _id: string;
            startedAt: number;
            state:
              | { kind: "running" }
              | {
                  attemptsComplete: boolean;
                  finishedAt: number;
                  kind: "finished";
                  outcome: "success" | "failure" | "unknown";
                };
            taskKey: string;
            tenantId: string;
            useCase: string;
            version?: string;
          }>;
        },
        Name
      >;
      markAttemptUnknown: FunctionReference<
        "mutation",
        "internal",
        {
          attemptKey: string;
          taskKey: string;
          tenantId: string;
          useCase: string;
        },
        null,
        Name
      >;
      startAttempt: FunctionReference<
        "mutation",
        "internal",
        {
          attemptKey: string;
          model: string;
          provider: string;
          startedAt: number;
          taskKey: string;
          tenantId: string;
          useCase: string;
        },
        { created: boolean },
        Name
      >;
      startTask: FunctionReference<
        "mutation",
        "internal",
        {
          startedAt: number;
          taskKey: string;
          tenantId: string;
          useCase: string;
          version?: string;
        },
        { created: boolean },
        Name
      >;
      summarizeTasks: FunctionReference<
        "query",
        "internal",
        { from: number; tenantId: string; to: number; useCase: string },
        {
          attemptCount: number;
          cachedInputTokens: number;
          cachedUsageAttempts: number;
          costPerSuccessfulTaskNanos: number | null;
          coverage: {
            asOf: number;
            attemptsPerTaskLimit: number;
            oldestTaskStartedAt: number | null;
            taskLimit: number;
            tasksTruncated: boolean;
            tasksWithTruncatedAttempts: number;
          };
          failedAttempts: number;
          failedTasks: number;
          finishedTasks: number;
          firstTextAttempts: number;
          inputTokens: number;
          knownCostAttempts: number;
          knownCostNanos: number;
          knownUsageAttempts: number;
          latencyMs: {
            p50: number | null;
            p95: number | null;
            p99: number | null;
            sampleCount: number;
          };
          outputTokens: number;
          successfulTasks: number;
          taskCount: number;
          unknownOutcomeTasks: number;
          unresolvedAttempts: number;
        },
        Name
      >;
    };
    queries: {
      recentTraces: FunctionReference<
        "query",
        "internal",
        { limit?: number },
        Array<{
          _creationTime: number;
          _id: string;
          agentName?: string;
          contentRecorded?: boolean;
          costUsd?: number;
          endedAt?: number;
          errorType?: string;
          inputTokens?: number;
          kind: "llm" | "tool" | "agent_step" | "workflow_step" | "judge";
          latencyMs?: number;
          metadata?: any;
          model?: string;
          operationName: string;
          outputTokens?: number;
          parentSpanId?: string;
          provider?: string;
          runId?: string;
          spanId: string;
          startedAt: number;
          status: "running" | "success" | "error";
          threadId?: string;
          totalTokens?: number;
          traceId: string;
          userId?: string;
        }>,
        Name
      >;
      spanContent: FunctionReference<
        "query",
        "internal",
        { spanId: string },
        {
          input?: string;
          inputUrl?: string | null;
          output?: string;
          outputUrl?: string | null;
        },
        Name
      >;
      spansByTrace: FunctionReference<
        "query",
        "internal",
        { traceId: string },
        Array<{
          _creationTime: number;
          _id: string;
          agentName?: string;
          contentRecorded?: boolean;
          costUsd?: number;
          endedAt?: number;
          errorType?: string;
          inputTokens?: number;
          kind: "llm" | "tool" | "agent_step" | "workflow_step" | "judge";
          latencyMs?: number;
          metadata?: any;
          model?: string;
          operationName: string;
          outputTokens?: number;
          parentSpanId?: string;
          provider?: string;
          runId?: string;
          spanId: string;
          startedAt: number;
          status: "running" | "success" | "error";
          threadId?: string;
          totalTokens?: number;
          traceId: string;
          userId?: string;
        }>,
        Name
      >;
    };
    runner: {
      listResults: FunctionReference<
        "query",
        "internal",
        { runId: string },
        Array<{
          _creationTime: number;
          _id: string;
          attempts: number;
          claimedAt?: number;
          costUsd?: number;
          errorType?: string;
          itemId: string;
          itemScore?: number;
          latencyMs?: number;
          output?: any;
          passed?: boolean;
          runId: string;
          scores?: Array<{
            details?: any;
            passed: boolean;
            score: number;
            scorer: string;
          }>;
          status: "pending" | "running" | "success" | "error";
          traceId?: string;
        }>,
        Name
      >;
      redriveRun: FunctionReference<
        "mutation",
        "internal",
        { olderThanMs?: number; runId: string },
        { erroredOut: number; repended: number },
        Name
      >;
      runSummary: FunctionReference<
        "query",
        "internal",
        { runId: string },
        null | {
          _creationTime: number;
          _id: string;
          completedAt?: number;
          completedCount: number;
          config: {
            concurrency?: number;
            maxAttempts?: number;
            passThreshold?: number;
            scorers: Array<
              | { type: "exactMatch" }
              | { schema: any; type: "jsonSchema" }
              | { config?: any; handle: string; name: string; type: "custom" }
              | {
                  embedderHandle: string;
                  threshold?: number;
                  type: "embeddingSimilarity";
                }
              | {
                  judgeHandles: Array<string>;
                  name?: string;
                  quorum?: number;
                  type: "consensus";
                }
            >;
          };
          datasetId: string;
          itemCount: number;
          passedCount: number;
          startedAt: number;
          status: "queued" | "running" | "completed" | "failed" | "canceled";
          summaryScore?: number;
          targetEnv?: string;
          targetHandle: string;
          targetVersion?: string;
          triggeredBy?: string;
        },
        Name
      >;
      startRun: FunctionReference<
        "mutation",
        "internal",
        {
          config: {
            concurrency?: number;
            maxAttempts?: number;
            passThreshold?: number;
            scorers: Array<
              | { type: "exactMatch" }
              | { schema: any; type: "jsonSchema" }
              | { config?: any; handle: string; name: string; type: "custom" }
              | {
                  embedderHandle: string;
                  threshold?: number;
                  type: "embeddingSimilarity";
                }
              | {
                  judgeHandles: Array<string>;
                  name?: string;
                  quorum?: number;
                  type: "consensus";
                }
            >;
          };
          datasetId: string;
          targetEnv?: string;
          targetHandle: string;
          targetVersion?: string;
          triggeredBy?: string;
        },
        string,
        Name
      >;
    };
  };
