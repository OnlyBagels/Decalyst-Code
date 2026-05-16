import { runWithConcurrency } from "../utils/concurrency.js";
import { TaskQueue } from "./task-queue.js";
import { ContextSelector } from "../context/context-selector.js";
import { WorkerRunner } from "../workers/worker-runner.js";
import { PatchManager } from "../patches/patch-manager.js";
import { TraceWriter } from "../traces/trace-writer.js";
import { toMessage } from "../utils/errors.js";
import type { AgentTask } from "../types/agent.js";

export interface ExecutionLoopOptions {
  concurrency: number;
}

export class ExecutionLoop {
  constructor(
    private readonly queue: TaskQueue,
    private readonly contextSelector: ContextSelector,
    private readonly workerRunner: WorkerRunner,
    private readonly patchManager: PatchManager,
    private readonly trace: TraceWriter,
    private readonly opts: ExecutionLoopOptions,
  ) {}

  async runUntilDrained(): Promise<void> {
    const lockedFiles = new Set<string>();

    while (!this.queue.done()) {
      const ready = this.queue
        .ready()
        .filter((t) => !this.taskOverlapsLocked(t, lockedFiles));

      if (ready.length === 0) {
        // Either everything is running or stuck.
        this.queue.cascadeBlocked();
        if (this.queue.done()) break;
        // Nothing immediately ready; cascade may have unblocked nothing.
        // Break to avoid spin; caller can rerun if needed.
        break;
      }

      // Lock files before launching the batch.
      for (const t of ready) for (const f of t.targetFiles) lockedFiles.add(f);

      try {
        await runWithConcurrency(ready, this.opts.concurrency, async (task) =>
          this.executeOne(task),
        );
      } finally {
        for (const t of ready)
          for (const f of t.targetFiles) lockedFiles.delete(f);
      }

      this.queue.cascadeBlocked();
    }
  }

  private taskOverlapsLocked(task: AgentTask, locked: Set<string>): boolean {
    return task.targetFiles.some((f) => locked.has(f));
  }

  private async executeOne(task: AgentTask): Promise<void> {
    task.status = "running";
    task.attempt += 1;

    try {
      task.fileContexts = await this.contextSelector.select(task);

      const result = await this.workerRunner.run(task);

      const patchResult = await this.patchManager.validateAndApply(
        task,
        result,
      );

      await this.trace.writePatchResult(task.id, patchResult);

      if (patchResult.applied) {
        this.queue.setStatus(task.id, "applied");
      } else {
        const reason =
          patchResult.validationErrors.join("\n") ||
          "Patch was not applied (no errors recorded)";
        this.queue.setStatus(task.id, "failed", reason);
      }
    } catch (err) {
      this.queue.setStatus(task.id, "failed", toMessage(err));
    }
  }
}
