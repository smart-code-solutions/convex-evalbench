import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// The example host app gains its own tables (a demo agent thread, etc.)
// once the tracing adapter lands. Empty for the foundation.
export default defineSchema({
  pilotDispatches: defineTable({
    tenantId: v.string(),
    taskKey: v.string(),
    dispatchKey: v.string(),
    model: v.string(),
    provider: v.string(),
    ownerId: v.string(),
    admission: v.union(
      v.object({ kind: v.literal("blocked"), reason: v.string() }),
      v.object({
        kind: v.literal("admitted"),
        requestId: v.string(),
        startedAt: v.number(),
      }),
    ),
  }).index("by_dispatch", ["tenantId", "taskKey", "dispatchKey"]),
});
