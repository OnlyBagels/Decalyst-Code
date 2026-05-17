import { z } from "zod";
import type { ToolRegistry } from "../registry.js";
import type { TodoStore } from "../../state/todos.js";
import type { PlanStore } from "../../state/plan-store.js";
import type { WorkerPool } from "../../state/worker-pool.js";
import type { AgentTask } from "../../types/agent.js";

interface CoordinateDeps {
  todos: TodoStore;
  planStore: PlanStore;
  workerPool: WorkerPool;
  tracesDir: string;
}

export function registerCoordinateTools(
  registry: ToolRegistry,
  deps: CoordinateDeps,
): void {
  const { todos, planStore, workerPool, tracesDir } = deps;

  registry.register({
    name: "write_plan",
    description: "Write a plan object to the run traces.",
    agent: "orchestrator",
    schema: z.object({
      plan: z.unknown(),
    }),
    handler: async ({ plan }) => {
      await planStore.set(plan, tracesDir);
      return { ok: true, plan };
    },
  });

  registry.register({
    name: "todo_write",
    description: "Replace the entire todo list.",
    agent: "orchestrator",
    schema: z.object({
      todos: z.array(
        z.object({
          id: z.string().min(1),
          description: z.string().min(1),
          status: z
            .enum(["pending", "in_progress", "done", "blocked"])
            .optional(),
        }),
      ),
    }),
    handler: async ({ todos: todoList }) => {
      todos.replace(todoList);
      return { ok: true, count: todoList.length };
    },
  });

  registry.register({
    name: "todo_update",
    description: "Update a single todo by id.",
    agent: "orchestrator",
    schema: z.object({
      id: z.string().min(1),
      description: z.string().optional(),
      status: z.enum(["pending", "in_progress", "done", "blocked"]).optional(),
    }),
    handler: async ({ id, description, status }) => {
      const patch = {} as Record<string, unknown>;
      if (description !== undefined) patch["description"] = description;
      if (status !== undefined) patch["status"] = status;

      const found = todos.update(id, patch as Parameters<typeof todos.update>[1]);
      if (!found) {
        throw new Error(`Todo not found: ${id}`);
      }
      return { ok: true, updated: true };
    },
  });

  registry.register({
    name: "dispatch_worker",
    description: "Dispatch a worker task to the pool.",
    agent: "orchestrator",
    schema: z.object({
      task: z.custom<AgentTask>((val) => {
        const obj = val as Record<string, unknown>;
        return (
          typeof obj["id"] === "string" &&
          typeof obj["role"] === "string" &&
          typeof obj["title"] === "string" &&
          typeof obj["goal"] === "string" &&
          Array.isArray(obj["targetFiles"]) &&
          Array.isArray(obj["fileContexts"]) &&
          Array.isArray(obj["constraints"]) &&
          typeof obj["projectContext"] === "object" &&
          typeof obj["limits"] === "object" &&
          Array.isArray(obj["dependencies"])
        );
      }),
    }),
    handler: async ({ task }) => {
      const taskId = workerPool.dispatch(task);
      return { ok: true, taskId };
    },
  });

  registry.register({
    name: "wait_workers",
    description: "Wait for worker tasks to complete.",
    agent: "orchestrator",
    schema: z.object({
      ids: z.array(z.string()).optional(),
    }),
    handler: async ({ ids }) => {
      const results = await workerPool.waitFor(ids);
      const resultArray = Array.from(results.entries()).map(([taskId, result]) => ({
        taskId,
        role: result.role,
        status: result.status,
        blockers: result.blockers,
      }));
      return { ok: true, results: resultArray };
    },
  });
}
