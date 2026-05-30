import { createOpenAICompatibleClient } from "../models/swarm-client.js";
import { WorkerRunner, type TaskWorker } from "./worker-runner.js";
import type { BackendConfig } from "../models/swarm-backends.js";
import type { UsageTracker } from "../tui/usage-tracker.js";
import type { AgentTask, AgentResult } from "../types/agent.js";

export type RunnerFactory = (cfg: BackendConfig) => TaskWorker;

export interface WorkerPoolOptions {
  tracker?: UsageTracker;
  /** Override worker construction (tests inject stubs here). */
  runnerFactory?: RunnerFactory;
}

interface Backend {
  config: BackendConfig;
  runner: TaskWorker;
  sem: Semaphore;
  inFlight: number;
}

/**
 * Runs swarm workers across several backends at once. Each backend has its own
 * client, model, and concurrency cap; a task is routed to the least-busy backend
 * with capacity, so two providers (e.g. DeepSeek + MiMo) saturate in parallel and
 * the effective width is the sum of their caps. Implements TaskWorker, so it
 * drops straight into ExecutionLoop in place of a single WorkerRunner.
 */
export class WorkerPool implements TaskWorker {
  private readonly backends: Backend[];
  private roundRobin = 0;

  constructor(configs: BackendConfig[], opts: WorkerPoolOptions = {}) {
    if (configs.length === 0) {
      throw new Error(
        "WorkerPool needs at least one backend — set SWARM_BACKEND_1_* (or the legacy SWARM_BASE_URL) in the environment.",
      );
    }

    const factory = opts.runnerFactory ?? defaultRunnerFactory(opts.tracker);
    this.backends = configs.map((config) => ({
      config,
      runner: factory(config),
      sem: new Semaphore(config.concurrency),
      inFlight: 0,
    }));
  }

  /** Sum of the per-backend caps — the real parallel width of the swarm. */
  get totalConcurrency(): number {
    return this.backends.reduce((sum, b) => sum + b.config.concurrency, 0);
  }

  get backendNames(): string[] {
    return this.backends.map((b) => b.config.name);
  }

  describe(): string {
    return this.backends
      .map((b) => `${b.config.name}(${b.config.model} x${b.config.concurrency})`)
      .join(" + ");
  }

  async run(task: AgentTask): Promise<AgentResult> {
    const backend = this.pick();
    backend.inFlight += 1;
    await backend.sem.acquire();
    try {
      return await backend.runner.run(task);
    } finally {
      backend.sem.release();
      backend.inFlight -= 1;
    }
  }

  /** Least in-flight wins; round-robin breaks ties so load spreads evenly. */
  private pick(): Backend {
    let min = Infinity;
    for (const b of this.backends) min = Math.min(min, b.inFlight);
    const candidates = this.backends.filter((b) => b.inFlight === min);
    const chosen = candidates[this.roundRobin % candidates.length]!;
    this.roundRobin += 1;
    return chosen;
  }
}

function defaultRunnerFactory(tracker?: UsageTracker): RunnerFactory {
  return (cfg) =>
    new WorkerRunner(
      createOpenAICompatibleClient({
        baseURL: cfg.baseURL,
        apiKey: cfg.apiKey,
        defaultModel: cfg.model,
        thinkingParams: cfg.thinkingParams,
        agentLabel: `swarm:${cfg.name}`,
        ...(tracker ? { tracker } : {}),
      }),
      cfg.model,
    );
}

/** Counting semaphore: at most `limit` holders at once; the rest queue. */
class Semaphore {
  private readonly waiters: Array<() => void> = [];
  private count: number;

  constructor(limit: number) {
    this.count = Math.max(1, limit);
  }

  acquire(): Promise<void> {
    if (this.count > 0) {
      this.count -= 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => this.waiters.push(resolve));
  }

  release(): void {
    const next = this.waiters.shift();
    if (next !== undefined) {
      next();
    } else {
      this.count += 1;
    }
  }
}
