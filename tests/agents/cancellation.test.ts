import { describe, it, expect } from "vitest";
import { z } from "zod";
import { WorkerAgent } from "../../src/agents/worker-agent.js";
import { OrchestratorAgent } from "../../src/agents/orchestrator-agent.js";
import { EventBus } from "../../src/events/bus.js";
import { ToolRegistry } from "../../src/tools/registry.js";
import { ModeController } from "../../src/modes/mode-controller.js";
import { PermissionResolver } from "../../src/tools/permissions.js";
import { FileLocks } from "../../src/tools/locks.js";
import type { ModelClient, CompleteWithToolsArgs } from "../../src/models/model-client.js";
import type { AgentTask } from "../../src/types/agent.js";
import type { ModeBudgets } from "../../src/modes/types.js";

const DEFAULT_BUDGETS: ModeBudgets = {
  maxFixRounds: 3,
  swarmConcurrency: 4,
  maxToolCallsPerTurn: 50,
  maxWebFetchesPerRun: 10,
  wallClockMs: 60_000,
};

function makeRegistry(): ToolRegistry {
  return new ToolRegistry({
    permissions: new PermissionResolver({ perTool: {}, globalOverride: "auto" }),
    locks: new FileLocks(),
  });
}

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: "t1",
    role: "scaffold-writer",
    title: "Test task",
    goal: "Create a simple file",
    targetFiles: ["src/output.ts"],
    fileContexts: [],
    constraints: [],
    projectContext: { moduleSystem: "esm", strictTypeScript: true },
    limits: { maxFilesToEdit: 1, maxOutputChars: 10000 },
    dependencies: [],
    status: "pending",
    attempt: 0,
    ...overrides,
  };
}

describe("WorkerAgent cancellation", () => {
  it("pre-aborted signal returns cancelled result immediately", async () => {
    const ac = new AbortController();
    ac.abort();

    let callCount = 0;
    const client: ModelClient = {
      async completeJson() {
        callCount++;
        // If this is ever called and signal is aborted, simulate AbortError
        const err = new Error("Request was aborted.");
        err.name = "AbortError";
        throw err;
      },
      async completeText() { return ""; },
      async completeWithTools(_args: CompleteWithToolsArgs) {
        throw new Error("not used");
      },
    };

    const bus = new EventBus();
    const registry = makeRegistry();

    const agent = new WorkerAgent({ client, registry, bus, workspaceRoot: "/tmp/ws" });
    const result = await agent.run(makeTask(), ac.signal);

    expect(result.status).toBe("cannot_complete");
    expect(result.blockers).toContain("cancelled");
    // completeJson may or may not be called depending on timing;
    // what matters is the result is cancelled.
  });

  it("signal aborted mid-run terminates loop with cancelled blocker", async () => {
    const ac = new AbortController();
    let callCount = 0;

    const client: ModelClient = {
      async completeJson() {
        callCount++;
        if (callCount >= 2) {
          ac.abort();
          const err = new Error("Request was aborted.");
          err.name = "AbortError";
          throw err;
        }
        // First call: return a valid but non-terminal envelope
        return JSON.stringify({ action: "noop_action", args: {} });
      },
      async completeText() { return ""; },
      async completeWithTools(_args: CompleteWithToolsArgs) {
        throw new Error("not used");
      },
    };

    const bus = new EventBus();
    const registry = makeRegistry();

    registry.register({
      name: "noop_action",
      description: "no-op",
      agent: "swarm",
      schema: z.object({}),
      handler: async () => ({ done: false }),
    });

    const agent = new WorkerAgent({ client, registry, bus, workspaceRoot: "/tmp/ws", maxTurns: 10 });
    const result = await agent.run(makeTask(), ac.signal);

    expect(result.status).toBe("cannot_complete");
    expect(result.blockers).toContain("cancelled");
  });
});

describe("OrchestratorAgent cancellation", () => {
  it("pre-aborted signal returns cancelled result", async () => {
    const ac = new AbortController();
    ac.abort();

    const client: ModelClient = {
      async completeJson() { return "{}"; },
      async completeText() { return ""; },
      async completeWithTools(_args: CompleteWithToolsArgs) {
        if (_args.signal?.aborted) {
          const err = new Error("Request was aborted.");
          err.name = "AbortError";
          throw err;
        }
        throw new Error("No more mock responses");
      },
    };

    const bus = new EventBus();
    const registry = makeRegistry();

    registry.register({
      name: "noop_tool",
      description: "no-op",
      agent: "orchestrator",
      schema: z.object({}),
      handler: async () => ({}),
    });

    const modeController = new ModeController(bus, DEFAULT_BUDGETS);
    const agent = new OrchestratorAgent({
      client,
      registry,
      modeController,
      bus,
      workspaceRoot: "/tmp",
    });

    const result = await agent.run("Do the thing.", ac.signal);

    expect(result.passed).toBe(false);
    expect(result.report).toBe("cancelled");
  });

  it("signal fires mid-run and returns cancelled result", async () => {
    const ac = new AbortController();
    let callCount = 0;

    const client: ModelClient = {
      async completeJson() { return "{}"; },
      async completeText() { return ""; },
      async completeWithTools(_args: CompleteWithToolsArgs) {
        callCount++;
        if (callCount >= 2) {
          ac.abort();
          const err = new Error("Request was aborted.");
          err.name = "AbortError";
          throw err;
        }
        // First call: return a registry tool call
        return {
          message: {
            role: "assistant" as const,
            content: null,
            tool_calls: [{ id: "tc-1", name: "noop_tool", args: {} }],
          },
          finishReason: "tool_calls" as const,
        };
      },
    };

    const bus = new EventBus();
    const registry = makeRegistry();

    registry.register({
      name: "noop_tool",
      description: "no-op",
      agent: "orchestrator",
      schema: z.object({}),
      handler: async () => ({}),
    });

    const modeController = new ModeController(bus, DEFAULT_BUDGETS);
    const agent = new OrchestratorAgent({
      client,
      registry,
      modeController,
      bus,
      workspaceRoot: "/tmp",
    });

    const result = await agent.run("Do the thing.", ac.signal);

    expect(result.passed).toBe(false);
    expect(result.report).toBe("cancelled");
  });
});
