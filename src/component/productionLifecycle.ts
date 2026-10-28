import { v, type Infer } from "convex/values";
import { internal } from "./_generated/api.js";
import {
  internalMutation,
  mutation,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server.js";
import type { Doc } from "./_generated/dataModel.js";
import { taskIdentity, tenantRetention, nonnegative } from "../production.js";

type Identity = Pick<
  Doc<"production_tasks">,
  "tenantId" | "useCase" | "taskKey"
>;
const batchSize = 100;
const completion = v.object({ complete: v.boolean() });

export async function tenantPolicy(ctx: QueryCtx, tenantId: string) {
  return ctx.db
    .query("production_tenants")
    .withIndex("by_tenant", (q) => q.eq("tenantId", tenantId))
    .unique();
}
export async function taskFence(ctx: QueryCtx, args: Identity) {
  return ctx.db
    .query("production_deleted_tasks")
    .withIndex("by_identity", (q) =>
      q
        .eq("tenantId", args.tenantId)
        .eq("useCase", args.useCase)
        .eq("taskKey", args.taskKey),
    )
    .unique();
}
export async function storedTask(ctx: QueryCtx, args: Identity) {
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
/** Fenced observations are no-ops so sibling billing can still commit. */
export async function taskClosed(
  ctx: QueryCtx,
  args: Identity,
  startedAt?: number,
) {
  const policy = await tenantPolicy(ctx, args.tenantId);
  if (policy?.state.kind === "deleted" || (await taskFence(ctx, args)))
    return true;
  if (policy?.state.kind !== "retained") return false;
  const start = startedAt ?? (await storedTask(ctx, args))?.startedAt;
  return start !== undefined && start < policy.state.before;
}
export async function closeTask(ctx: MutationCtx, args: Identity) {
  const policy = await tenantPolicy(ctx, args.tenantId);
  if (policy?.state.kind === "deleted")
    return { complete: !policy.cleanupPending };
  for (const value of [args.tenantId, args.useCase, args.taskKey])
    if (!value.trim() || value.length > 256)
      throw new Error("Invalid task identity");
  const identity = {
    tenantId: args.tenantId,
    useCase: args.useCase,
    taskKey: args.taskKey,
  };
  const fence = await taskFence(ctx, identity);
  if (fence && !fence.cleanupPending) return { complete: true };
  if (!fence)
    await ctx.db.insert("production_deleted_tasks", {
      ...identity,
      cleanupPending: true,
    });
  const task = await storedTask(ctx, identity);
  if (task) await ctx.db.delete("production_tasks", task._id);
  await ctx.scheduler.runAfter(
    0,
    internal.productionLifecycle.cleanTask,
    identity,
  );
  return { complete: false };
}

export const deleteTask = mutation({
  args: taskIdentity,
  returns: completion,
  handler: closeTask,
});

async function updateTenant(
  ctx: MutationCtx,
  tenantId: string,
  state: Infer<typeof tenantRetention>,
) {
  if (!tenantId.trim() || tenantId.length > 256)
    throw new Error("Invalid tenantId");
  const old = await tenantPolicy(ctx, tenantId);
  if (old?.state.kind === "deleted") {
    if (old.cleanupPending)
      await ctx.scheduler.runAfter(
        0,
        internal.productionLifecycle.cleanTenant,
        { tenantId },
      );
    return { complete: !old.cleanupPending };
  }
  if (
    old?.state.kind === "retained" &&
    state.kind === "retained" &&
    old.state.before >= state.before
  ) {
    if (old.cleanupPending)
      await ctx.scheduler.runAfter(
        0,
        internal.productionLifecycle.cleanTenant,
        { tenantId },
      );
    return { complete: !old.cleanupPending };
  }
  if (old)
    await ctx.db.patch("production_tenants", old._id, {
      state,
      cleanupPending: true,
    });
  else
    await ctx.db.insert("production_tenants", {
      tenantId,
      state,
      cleanupPending: true,
    });
  await ctx.scheduler.runAfter(0, internal.productionLifecycle.cleanTenant, {
    tenantId,
  });
  return { complete: false };
}
export const deleteTenant = mutation({
  args: { tenantId: v.string() },
  returns: completion,
  handler: (ctx, { tenantId }) =>
    updateTenant(ctx, tenantId, { kind: "deleted" }),
});
export const pruneTenant = mutation({
  args: { tenantId: v.string(), before: v.number() },
  returns: completion,
  handler: async (ctx, { tenantId, before }) => {
    nonnegative(before, "before");
    if (before > Date.now())
      throw new Error("Retention cutoff cannot be in the future");
    return updateTenant(ctx, tenantId, { kind: "retained", before });
  },
});

export const cleanTask = internalMutation({
  args: taskIdentity,
  returns: v.null(),
  handler: async (ctx, args) => {
    const fence = await taskFence(ctx, args);
    if (!fence?.cleanupPending) return null;
    const rows = await ctx.db
      .query("production_attempts")
      .withIndex("by_identity", (q) =>
        q
          .eq("tenantId", args.tenantId)
          .eq("useCase", args.useCase)
          .eq("taskKey", args.taskKey),
      )
      .take(batchSize);
    for (const row of rows) await ctx.db.delete("production_attempts", row._id);
    if (rows.length === batchSize)
      await ctx.scheduler.runAfter(
        0,
        internal.productionLifecycle.cleanTask,
        args,
      );
    else
      await ctx.db.patch("production_deleted_tasks", fence._id, {
        cleanupPending: false,
      });
    return null;
  },
});

export const cleanTenant = internalMutation({
  args: { tenantId: v.string() },
  returns: v.null(),
  handler: async (ctx, { tenantId }) => {
    const policy = await tenantPolicy(ctx, tenantId);
    if (!policy?.cleanupPending) return null;
    if (policy.state.kind === "deleted") {
      // The tenant fence replaces task fences before their physical removal.
      for (const table of [
        "production_attempts",
        "production_tasks",
        "production_deleted_tasks",
      ] as const) {
        const rows = await ctx.db
          .query(table)
          .withIndex("by_identity", (q) => q.eq("tenantId", tenantId))
          .take(batchSize);
        if (rows.length) {
          for (const row of rows) await ctx.db.delete(table, row._id);
          await ctx.scheduler.runAfter(
            0,
            internal.productionLifecycle.cleanTenant,
            { tenantId },
          );
          return null;
        }
      }
    } else {
      const before = policy.state.before;
      const tasks = await ctx.db
        .query("production_tasks")
        .withIndex("by_tenant_started", (q) =>
          q.eq("tenantId", tenantId).lt("startedAt", before),
        )
        .take(25);
      for (const task of tasks) await closeTask(ctx, task);
      if (tasks.length) {
        await ctx.scheduler.runAfter(
          0,
          internal.productionLifecycle.cleanTenant,
          { tenantId },
        );
        return null;
      }
      // Child batches may outlive the last removed parent.
      const pending = await ctx.db
        .query("production_deleted_tasks")
        .withIndex("by_tenant_pending", (q) =>
          q.eq("tenantId", tenantId).eq("cleanupPending", true),
        )
        .first();
      if (pending) {
        await ctx.scheduler.runAfter(
          0,
          internal.productionLifecycle.cleanTask,
          { tenantId, useCase: pending.useCase, taskKey: pending.taskKey },
        );
        await ctx.scheduler.runAfter(
          1000,
          internal.productionLifecycle.cleanTenant,
          { tenantId },
        );
        return null;
      }
    }
    await ctx.db.patch("production_tenants", policy._id, {
      cleanupPending: false,
    });
    return null;
  },
});
