import { describe, it, expect, vi, beforeEach } from "vitest";
import { WorkerPool } from "../../src/state/worker-pool.js";
import { EventBus } from "../../src/events/bus.js";
import type { WorkerAgent } from "../../src/agents/worker-agent.js";
import type { AgentTask, AgentResult } from "../../src/types/agent.js";

function createMockTask(id: string): AgentTask {
  return {
    id,
    role: "test-worker",
    title: `Task ${id}`,
    goal: "Test goal",
    targetFiles: [`file${id}.ts`],
    fileContexts: [],
    constraints: [],
    projectContext: {},
    limits: { maxFilesToEdit: 10, maxOutputChars: 10000 },
    dependencies: [],
    status: "ready",
    attempt: 1,
  };
}

function createMockResult(task: AgentTask): AgentResult {
  return {
    taskId: task.id,
    role: task.role,
    status: "success",
    edits: [],
    blockers: [],
  };
}

describe("WorkerPool", () => {
  let bus: EventBus;
  let mockAgent: WorkerAgent;

  beforeEach(() => {
    bus = new EventBus();
    mockAgent = {
      run: vi.fn(async (task: AgentTask) => createMockResult(task)),
    } as any;
  });

  it("dispatch up to concurrency runs in parallel", async () => {
    const pool = new WorkerPool({
      workerAgent: mockAgent,
      concurrency: 2,
      bus,
    });

    const task1 = createMockTask("1");
    const task2 = createMockTask("2");

    pool.dispatch(task1);
    pool.dispatch(task2);

    // Wait briefly for tasks to start
    await new Promise((r) => setTimeout(r, 10));

    expect(mockAgent.run).toHaveBeenCalledTimes(2);
  });

  it("excess goes to queue and runs when slot frees", async () => {
    const pool = new WorkerPool({
      workerAgent: mockAgent,
      concurrency: 1,
      bus,
    });

    const task1 = createMockTask("1");
    const task2 = createMockTask("2");
    const task3 = createMockTask("3");

    pool.dispatch(task1);
    pool.dispatch(task2);
    pool.dispatch(task3);

    // Wait for all to complete
    await new Promise((r) => setTimeout(r, 50));

    expect(mockAgent.run).toHaveBeenCalledTimes(3);
  });

  it("waitFor(undefined) waits for all in-flight", async () => {
    const pool = new WorkerPool({
      workerAgent: mockAgent,
      concurrency: 2,
      bus,
    });

    const task1 = createMockTask("1");
    const task2 = createMockTask("2");

    pool.dispatch(task1);
    pool.dispatch(task2);

    const results = await pool.waitFor();

    expect(results.size).toBe(2);
    expect(results.has("1")).toBe(true);
    expect(results.has("2")).toBe(true);
  });

  it("waitFor(ids) waits for specific tasks", async () => {
    const pool = new WorkerPool({
      workerAgent: mockAgent,
      concurrency: 3,
      bus,
    });

    const task1 = createMockTask("1");
    const task2 = createMockTask("2");
    const task3 = createMockTask("3");

    pool.dispatch(task1);
    pool.dispatch(task2);
    pool.dispatch(task3);

    const results = await pool.waitFor(["1", "3"]);

    expect(results.size).toBe(2);
    expect(results.has("1")).toBe(true);
    expect(results.has("3")).toBe(true);
    expect(results.has("2")).toBe(false);
  });

  it("emits worker_started/finished events", async () => {
    const bus = new EventBus();
    const emitSpy = vi.spyOn(bus, "emit");

    const pool = new WorkerPool({
      workerAgent: mockAgent,
      concurrency: 1,
      bus,
    });

    const task = createMockTask("1");
    pool.dispatch(task);

    await pool.waitFor();

    const startEvents = emitSpy.mock.calls.filter(
      (call) => (call[0] as any)?.t === "worker_started",
    );
    const finishEvents = emitSpy.mock.calls.filter(
      (call) => (call[0] as any)?.t === "worker_finished",
    );

    expect(startEvents.length).toBeGreaterThan(0);
    expect(finishEvents.length).toBeGreaterThan(0);
  });

  it("status returns correct state", async () => {
    const pool = new WorkerPool({
      workerAgent: mockAgent,
      concurrency: 1,
      bus,
    });

    const task1 = createMockTask("1");
    const task2 = createMockTask("2");

    const id1 = pool.dispatch(task1);
    const id2 = pool.dispatch(task2);

    expect(pool.status(id1)).toBe("running");
    expect(pool.status(id2)).toBe("queued");
    expect(pool.status("unknown")).toBe("unknown");
  });
});
