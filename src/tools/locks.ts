interface LockEntry {
  held: boolean;
  queue: Array<() => void>;
}

export class FileLocks {
  private readonly locks = new Map<string, LockEntry>();

  async withLock<R>(paths: string[], fn: () => Promise<R>): Promise<R> {
    const sorted = [...paths].sort();
    await this.acquireAll(sorted);
    try {
      return await fn();
    } finally {
      this.releaseAll(sorted);
    }
  }

  private acquireAll(sorted: string[]): Promise<void> {
    return sorted.reduce<Promise<void>>(
      (prev, p) => prev.then(() => this.acquireOne(p)),
      Promise.resolve(),
    );
  }

  private acquireOne(p: string): Promise<void> {
    let entry = this.locks.get(p);
    if (entry === undefined) {
      entry = { held: false, queue: [] };
      this.locks.set(p, entry);
    }

    if (!entry.held) {
      entry.held = true;
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      entry!.queue.push(resolve);
    });
  }

  private releaseAll(sorted: string[]): void {
    for (const p of sorted) {
      this.releaseOne(p);
    }
  }

  private releaseOne(p: string): void {
    const entry = this.locks.get(p);
    if (entry === undefined) return;

    const next = entry.queue.shift();
    if (next !== undefined) {
      next();
    } else {
      entry.held = false;
    }
  }
}
