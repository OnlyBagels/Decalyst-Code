import { describe, it, expect } from "vitest";
import { WorkerPool } from "../src/workers/worker-pool.js";
import type { BackendConfig } from "../src/models/swarm-backends.js";
import type { TaskWorker } from "../src/workers/worker-runner.js";
import type { AgentTask, AgentResult } from "../src/types/agent.js";

function cfg(name: string, concurrency: number): BackendConfig {
  return {
    name,
    baseURL: `https://${name}.example/v1`,
    apiKey: "test",
    model: `${name}-model`,
    concurrency,
    thinkingParams: {},
    tier: "bulk",
  };
}

function task(id: string): AgentTask {
  return {
    id,
    role: "scaffold-writer",
    title: id,
    goal: "g",
    targetFiles: [id],
    fileContexts: [],
    constraints: [],
    projectContext: {},
    limits: { maxFilesToEdit: 1, maxOutputChars: 1000 },
    dependencies: [],
    status: "pending",
    attempt: 0,
  };
}

/** A stub runner that records per-backend concurrency and yields to the loop. */
function recordingRunner(
  name: string,
  log: { active: Record<string, number>; max: Record<string, number>; seen: string[] },
): TaskWorker {
  log.active[name] = 0;
  log.max[name] = 0;
  return {
    async run(t: AgentTask): Promise<AgentResult> {
      log.seen.push(name);
      log.active[name]! += 1;
      log.max[name] = Math.max(log.max[name]!, log.active[name]!);
      await new Promise((r) => setTimeout(r, 5));
      log.active[name]! -= 1;
      return {
        taskId: t.id,
        role: t.role,
        status: "success",
        edits: [],
        blockers: [],
      };
    },
  };
}

describe("WorkerPool", () => {
  it("throws when no backends are configured", () => {
    expect(() => new WorkerPool([])).toThrow(/at least one backend/);
  });

  it("reports total width as the sum of per-backend caps", () => {
    const pool = new WorkerPool([cfg("a", 8), cfg("b", 4)], {
      runnerFactory: () => ({ async run() { throw new Error("unused"); } }),
    });
    expect(pool.totalConcurrency).toBe(12);
    expect(pool.backendNames).toEqual(["a", "b"]);
  });

  it("spreads tasks across BOTH backends and never exceeds a backend's cap", async () => {
    const log = { active: {} as Record<string, number>, max: {} as Record<string, number>, seen: [] as string[] };
    const pool = new WorkerPool([cfg("deepseek", 2), cfg("mimo", 2)], {
      runnerFactory: (c) => recordingRunner(c.name, log),
    });

    const tasks = Array.from({ length: 12 }, (_, i) => task(`t${i}`));
    const results = await Promise.all(tasks.map((t) => pool.run(t)));

    // every task completed
    expect(results).toHaveLength(12);
    expect(results.every((r) => r.status === "success")).toBe(true);

    // both backends actually did work (true parallel use of both models)
    expect(log.seen.filter((n) => n === "deepseek").length).toBeGreaterThan(0);
    expect(log.seen.filter((n) => n === "mimo").length).toBeGreaterThan(0);

    // per-backend concurrency cap respected
    expect(log.max["deepseek"]).toBeLessThanOrEqual(2);
    expect(log.max["mimo"]).toBeLessThanOrEqual(2);
  });
});
