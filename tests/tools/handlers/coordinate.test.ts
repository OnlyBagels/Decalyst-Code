import { describe, it, expect, vi, beforeEach } from "vitest";
import { ToolRegistry } from "../../../src/tools/registry.js";
import { registerCoordinateTools } from "../../../src/tools/handlers/coordinate.js";
import { TodoStore } from "../../../src/state/todos.js";
import { PlanStore } from "../../../src/state/plan-store.js";
import { WorkerPool } from "../../../src/state/worker-pool.js";
import { EventBus } from "../../../src/events/bus.js";
import { PermissionResolver } from "../../../src/tools/permissions.js";
import { FileLocks } from "../../../src/tools/locks.js";
import type { AgentTask } from "../../../src/types/agent.js";

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

describe("registerCoordinateTools", () => {
  let registry: ToolRegistry;
  let todos: TodoStore;
  let planStore: PlanStore;
  let workerPool: WorkerPool;
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();

    const mockPermissions = {
      resolve: vi.fn(async () => "auto"),
    } as any;
    const mockLocks = {
      withLock: vi.fn((paths: string[], fn: () => Promise<any>) => fn()),
    } as any;

    registry = new ToolRegistry({
      permissions: mockPermissions,
      locks: mockLocks,
    });

    todos = new TodoStore(bus);
    planStore = new PlanStore(bus);

    const mockAgent = {
      run: vi.fn(async (task: AgentTask) => ({
        taskId: task.id,
        role: task.role,
        status: "success",
        edits: [],
        blockers: [],
      })),
    } as any;

    workerPool = new WorkerPool({
      workerAgent: mockAgent,
      concurrency: 2,
      bus,
    });

    registerCoordinateTools(registry, {
      todos,
      planStore,
      workerPool,
      tracesDir: "/tmp/traces",
    });
  });

  it("write_plan dispatches to PlanStore", async () => {
    const setSpy = vi.spyOn(planStore, "set");
    const plan = { phase: 1, tasks: [] };

    const result = await registry.invoke(
      "write_plan",
      { plan },
      {
        workspaceRoot: "/test",
        agent: "orchestrator",
        signal: new AbortController().signal,
        emit: () => {},
      },
    );

    expect(result.ok).toBe(true);
    expect(setSpy).toHaveBeenCalled();
  });

  it("todo_write dispatches to TodoStore", async () => {
    const replaceSpy = vi.spyOn(todos, "replace");
    const todoList = [
      { id: "1", description: "Task 1" },
      { id: "2", description: "Task 2", status: "in_progress" as const },
    ];

    const result = await registry.invoke(
      "todo_write",
      { todos: todoList },
      {
        workspaceRoot: "/test",
        agent: "orchestrator",
        signal: new AbortController().signal,
        emit: () => {},
      },
    );

    expect(result.ok).toBe(true);
    expect(replaceSpy).toHaveBeenCalledWith(todoList);
  });

  it("todo_update dispatches to TodoStore", async () => {
    todos.replace([{ id: "1", description: "Original" }]);
    const updateSpy = vi.spyOn(todos, "update");

    const result = await registry.invoke(
      "todo_update",
      { id: "1", status: "done" },
      {
        workspaceRoot: "/test",
        agent: "orchestrator",
        signal: new AbortController().signal,
        emit: () => {},
      },
    );

    expect(result.ok).toBe(true);
    expect(updateSpy).toHaveBeenCalled();
  });

  it("dispatch_worker returns taskId", async () => {
    const task = createMockTask("test-1");

    const result = await registry.invoke(
      "dispatch_worker",
      { task },
      {
        workspaceRoot: "/test",
        agent: "orchestrator",
        signal: new AbortController().signal,
        emit: () => {},
      },
    );

    expect(result.ok).toBe(true);
    expect((result as any).data.taskId).toBe("test-1");
  });

  it("wait_workers returns result map", async () => {
    const task1 = createMockTask("1");
    const task2 = createMockTask("2");

    workerPool.dispatch(task1);
    workerPool.dispatch(task2);

    const result = await registry.invoke(
      "wait_workers",
      { ids: ["1", "2"] },
      {
        workspaceRoot: "/test",
        agent: "orchestrator",
        signal: new AbortController().signal,
        emit: () => {},
      },
    );

    expect(result.ok).toBe(true);
    expect((result as any).data.results).toBeDefined();
    expect(Array.isArray((result as any).data.results)).toBe(true);
  });
});
