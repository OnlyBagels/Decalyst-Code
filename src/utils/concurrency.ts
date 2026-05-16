/**
 * Runs tasks with bounded concurrency. Each item in `items` is processed by
 * `fn`. At most `concurrency` tasks run simultaneously.
 */
export async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  const queue = [...items];
  const workers: Promise<void>[] = [];

  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const item = queue.shift();
      if (item === undefined) break;
      await fn(item);
    }
  }

  for (let i = 0; i < Math.min(concurrency, items.length); i++) {
    workers.push(worker());
  }

  await Promise.all(workers);
}

/** Topological sort of tasks by their dependency ids. */
export function topologicalSort<
  T extends { id: string; dependencies: string[] },
>(tasks: T[]): T[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const visited = new Set<string>();
  const result: T[] = [];

  function visit(id: string): void {
    if (visited.has(id)) return;
    visited.add(id);
    const task = byId.get(id);
    if (!task) return;
    for (const dep of task.dependencies) {
      visit(dep);
    }
    result.push(task);
  }

  for (const task of tasks) {
    visit(task.id);
  }

  return result;
}
