import type { WorkerAgent } from "../agents/worker-agent.js";
import type { AgentTask, AgentResult } from "../types/agent.js";
import type { EventBus } from "../events/bus.js";

interface PoolOptions {
  workerAgent: WorkerAgent;
  concurrency: number;
  bus: EventBus;
}

interface PendingTask {
  taskId: string;
  task: AgentTask;
  promise: Promise<AgentResult>;
  resolve: (result: AgentResult) => void;
}

export class WorkerPool {
  private readonly workerAgent: WorkerAgent;
  private readonly concurrency: number;
  private readonly bus: EventBus;
  private readonly queue: AgentTask[] = [];
  private readonly inFlight: Map<string, PendingTask> = new Map();
  private runningCount = 0;

  constructor(opts: PoolOptions) {
    this.workerAgent = opts.workerAgent;
    this.concurrency = opts.concurrency;
    this.bus = opts.bus;
  }

  dispatch(task: AgentTask): string {
    const taskId = task.id;

    let resolve: (result: AgentResult) => void;
    const promise = new Promise<AgentResult>((r) => {
      resolve = r;
    });

    const pending: PendingTask = {
      taskId,
      task,
      promise,
      resolve: resolve!,
    };

    this.inFlight.set(taskId, pending);

    if (this.runningCount < this.concurrency) {
      this.runningCount++;
      this.bus.emit({ t: "worker_started", id: taskId, file: task.targetFiles[0] ?? "", role: task.role });
      this.workerAgent.run(task).then((result) => {
        resolve(result);
        this.inFlight.delete(taskId);
        this.runningCount--;
        this.bus.emit({ t: "worker_finished", id: taskId, status: "submitted" });
        this.processQueue();
      });
    } else {
      this.queue.push(task);
    }

    return taskId;
  }

  async waitFor(taskIds?: string[]): Promise<Map<string, AgentResult>> {
    const target = taskIds && taskIds.length > 0 ? new Set(taskIds) : null;
    const results = new Map<string, AgentResult>();

    if (target === null) {
      const allTasks = Array.from(this.inFlight.values());
      const allResults = await Promise.all(allTasks.map((t) => t.promise));
      for (const result of allResults) {
        results.set(result.taskId, result);
      }
    } else {
      const toWait: Promise<AgentResult>[] = [];
      for (const id of target) {
        const pending = this.inFlight.get(id);
        if (pending) {
          toWait.push(pending.promise);
        }
      }
      const resolved = await Promise.all(toWait);
      for (const result of resolved) {
        results.set(result.taskId, result);
      }
    }

    return results;
  }

  status(taskId: string): "queued" | "running" | "done" | "failed" | "unknown" {
    const pending = this.inFlight.get(taskId);
    if (!pending) return "unknown";

    if (this.queue.some((t) => t.id === taskId)) {
      return "queued";
    }
    return "running";
  }

  private processQueue(): void {
    if (this.queue.length === 0 || this.runningCount >= this.concurrency) {
      return;
    }

    const task = this.queue.shift();
    if (!task) return;

    const taskId = task.id;
    const pending = this.inFlight.get(taskId);
    if (!pending) return;

    this.runningCount++;
    this.bus.emit({ t: "worker_started", id: taskId, file: task.targetFiles[0] ?? "", role: task.role });
    this.workerAgent.run(task).then((result) => {
      pending.resolve(result);
      this.inFlight.delete(taskId);
      this.runningCount--;
      this.bus.emit({ t: "worker_finished", id: taskId, status: "submitted" });
      this.processQueue();
    });
  }
}
