import type { AgentTask, TaskStatus } from "../types/agent.js";

export class TaskQueue {
  private readonly byId = new Map<string, AgentTask>();

  constructor(tasks: AgentTask[]) {
    for (const t of tasks) this.byId.set(t.id, t);
  }

  all(): AgentTask[] {
    return [...this.byId.values()];
  }

  get(id: string): AgentTask | undefined {
    return this.byId.get(id);
  }

  add(task: AgentTask): void {
    this.byId.set(task.id, task);
  }

  setStatus(id: string, status: TaskStatus, failureReason?: string): void {
    const t = this.byId.get(id);
    if (!t) return;
    t.status = status;
    if (failureReason !== undefined) t.failureReason = failureReason;
  }

  /** Returns tasks whose dependencies are all `applied` and which are pending. */
  ready(): AgentTask[] {
    return [...this.byId.values()].filter(
      (t) =>
        t.status === "pending" &&
        t.dependencies.every(
          (depId) => this.byId.get(depId)?.status === "applied",
        ),
    );
  }

  /** Returns true once every task is in a terminal state. */
  done(): boolean {
    return [...this.byId.values()].every((t) =>
      ["applied", "failed", "blocked"].includes(t.status),
    );
  }

  /** Mark tasks as blocked when their dependencies failed. */
  cascadeBlocked(): void {
    let changed = true;
    while (changed) {
      changed = false;
      for (const t of this.byId.values()) {
        if (t.status !== "pending") continue;
        const blockedBy = t.dependencies.find((depId) => {
          const dep = this.byId.get(depId);
          return dep?.status === "failed" || dep?.status === "blocked";
        });
        if (blockedBy) {
          t.status = "blocked";
          t.failureReason = `Blocked by failed dependency: ${blockedBy}`;
          changed = true;
        }
      }
    }
  }

  stats() {
    const counts: Record<TaskStatus, number> = {
      pending: 0,
      ready: 0,
      running: 0,
      needs_review: 0,
      applied: 0,
      failed: 0,
      blocked: 0,
    };
    for (const t of this.byId.values()) counts[t.status]++;
    return counts;
  }
}
