import type { FunctionArgs } from "convex/server";
import type { ComponentApi } from "../component/_generated/component.js";
import type { RunMutationCtx, RunQueryCtx } from "./index.js";

type Functions = ComponentApi["production"];

/** Strict accounting calls. Failures propagate so the parent mutation rolls back. */
export class ProductionTasks {
  constructor(private component: ComponentApi) {}

  deleteTask(
    ctx: RunMutationCtx,
    args: FunctionArgs<ComponentApi["productionLifecycle"]["deleteTask"]>,
  ) {
    return ctx.runMutation(this.component.productionLifecycle.deleteTask, args);
  }
  deleteTenant(
    ctx: RunMutationCtx,
    args: FunctionArgs<ComponentApi["productionLifecycle"]["deleteTenant"]>,
  ) {
    return ctx.runMutation(
      this.component.productionLifecycle.deleteTenant,
      args,
    );
  }
  pruneTenant(
    ctx: RunMutationCtx,
    args: FunctionArgs<ComponentApi["productionLifecycle"]["pruneTenant"]>,
  ) {
    return ctx.runMutation(
      this.component.productionLifecycle.pruneTenant,
      args,
    );
  }
  startTask(ctx: RunMutationCtx, args: FunctionArgs<Functions["startTask"]>) {
    return ctx.runMutation(this.component.production.startTask, args);
  }
  finishTask(ctx: RunMutationCtx, args: FunctionArgs<Functions["finishTask"]>) {
    return ctx.runMutation(this.component.production.finishTask, args);
  }
  startAttempt(
    ctx: RunMutationCtx,
    args: FunctionArgs<Functions["startAttempt"]>,
  ) {
    return ctx.runMutation(this.component.production.startAttempt, args);
  }
  markAttemptUnknown(
    ctx: RunMutationCtx,
    args: FunctionArgs<Functions["markAttemptUnknown"]>,
  ) {
    return ctx.runMutation(this.component.production.markAttemptUnknown, args);
  }
  finishAttempt(
    ctx: RunMutationCtx,
    args: FunctionArgs<Functions["finishAttempt"]>,
  ) {
    return ctx.runMutation(this.component.production.finishAttempt, args);
  }
  getTask(ctx: RunQueryCtx, args: FunctionArgs<Functions["getTask"]>) {
    return ctx.runQuery(this.component.production.getTask, args);
  }
  listTasks(ctx: RunQueryCtx, args: FunctionArgs<Functions["listTasks"]>) {
    return ctx.runQuery(this.component.production.listTasks, args);
  }
  listAttempts(
    ctx: RunQueryCtx,
    args: FunctionArgs<Functions["listAttempts"]>,
  ) {
    return ctx.runQuery(this.component.production.listAttempts, args);
  }
  summarizeTasks(
    ctx: RunQueryCtx,
    args: FunctionArgs<Functions["summarizeTasks"]>,
  ) {
    return ctx.runQuery(this.component.production.summarizeTasks, args);
  }
}
