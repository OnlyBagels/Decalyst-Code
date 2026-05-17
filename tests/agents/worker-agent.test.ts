import { describe, it, expect, beforeEach, vi } from "vitest";
import { WorkerAgent } from "../../src/agents/worker-agent.js";
import { EventBus } from "../../src/events/bus.js";
import { ToolRegistry } from "../../src/tools/registry.js";
import { PermissionResolver } from "../../src/tools/permissions.js";
import { FileLocks } from "../../src/tools/locks.js";
import type { ModelClient } from "../../src/models/model-client.js";
import type { AgentTask } from "../../src/types/agent.js";

function makeRegistry(): ToolRegistry {
  return new ToolRegistry({
    permissions: new PermissionResolver({ perTool: {}, globalOverride: "auto" }),
    locks: new FileLocks(),
  });
}

function makeBus(): EventBus {
  return new EventBus();
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

function makeClient(responses: string[]): ModelClient {
  let call = 0;
  return {
    async completeJson() {
      const resp = responses[call++];
      if (resp === undefined) throw new Error("No more mock responses");
      return resp;
    },
    async completeText() {
      return "";
    },
  };
}

describe("WorkerAgent", () => {
  let registry: ToolRegistry;
  let bus: EventBus;

  beforeEach(() => {
    registry = makeRegistry();
    bus = makeBus();
  });

  it("happy path: peek_signature -> create_file -> submit", async () => {
    let createFileCalled = false;
    let peekCalled = false;

    registry.register({
      name: "peek_signature",
      description: "peek",
      agent: "swarm",
      schema: (await import("zod")).z.object({ symbol: (await import("zod")).z.string(), limit: (await import("zod")).z.number().optional() }),
      handler: async () => {
        peekCalled = true;
        return [{ name: "SomeClass", kind: "class", signature: "class SomeClass {}", filePath: "src/lib.ts", range: { start: 1, end: 5 } }];
      },
    });

    registry.register({
      name: "create_file",
      description: "create",
      agent: "swarm",
      schema: (await import("zod")).z.object({ path: (await import("zod")).z.string(), content: (await import("zod")).z.string() }),
      handler: async () => {
        createFileCalled = true;
        return { path: "src/output.ts", created: true };
      },
    });

    const client = makeClient([
      JSON.stringify({ action: "peek_signature", args: { symbol: "SomeClass" } }),
      JSON.stringify({ action: "create_file", args: { path: "src/output.ts", content: "export const x = 1;" } }),
      JSON.stringify({ action: "submit", args: {} }),
    ]);

    const agent = new WorkerAgent({ client, registry, bus, workspaceRoot: "/tmp/ws" });
    const result = await agent.run(makeTask());

    expect(result.status).toBe("success");
    expect(result.taskId).toBe("t1");
    expect(peekCalled).toBe(true);
    expect(createFileCalled).toBe(true);
  });

  it("invalid envelope retries and recovers", async () => {
    registry.register({
      name: "submit",
      description: "submit",
      agent: "swarm",
      schema: (await import("zod")).z.object({}),
      handler: async () => ({ ok: true, terminal: "submit" }),
    });

    const client = makeClient([
      "this is not json at all",
      JSON.stringify({ action: "submit", args: {} }),
    ]);

    const agent = new WorkerAgent({ client, registry, bus, workspaceRoot: "/tmp/ws" });
    const result = await agent.run(makeTask());

    expect(result.status).toBe("success");
  });

  it("max turns exceeded returns cannot_complete with blocker", async () => {
    registry.register({
      name: "peek_signature",
      description: "peek",
      agent: "swarm",
      schema: (await import("zod")).z.object({ symbol: (await import("zod")).z.string(), limit: (await import("zod")).z.number().optional() }),
      handler: async () => [],
    });

    const endlessPeek = Array.from({ length: 20 }, () =>
      JSON.stringify({ action: "peek_signature", args: { symbol: "foo" } }),
    );

    const client = makeClient(endlessPeek);
    const agent = new WorkerAgent({ client, registry, bus, workspaceRoot: "/tmp/ws", maxTurns: 3 });
    const result = await agent.run(makeTask());

    expect(result.status).toBe("cannot_complete");
    expect(result.blockers).toContain("max turns reached");
  });

  it("report_blocker terminates loop and returns blockers array", async () => {
    const client = makeClient([
      JSON.stringify({ action: "report_blocker", args: { reason: "Missing dependency: uuid", suggested_action: "add uuid to package.json" } }),
    ]);

    const agent = new WorkerAgent({ client, registry, bus, workspaceRoot: "/tmp/ws" });
    const result = await agent.run(makeTask());

    expect(result.status).toBe("cannot_complete");
    expect(result.blockers.some((b) => b.includes("Missing dependency: uuid"))).toBe(true);
    expect(result.blockers.some((b) => b.includes("add uuid to package.json"))).toBe(true);
  });

  it("edit_file tool error surfaces as user message and model can retry", async () => {
    let editAttempts = 0;

    registry.register({
      name: "edit_file",
      description: "edit",
      agent: "swarm",
      schema: (await import("zod")).z.object({
        path: (await import("zod")).z.string(),
        old_string: (await import("zod")).z.string(),
        new_string: (await import("zod")).z.string(),
      }),
      handler: async () => {
        editAttempts++;
        if (editAttempts === 1) throw new Error("old_string not found");
        return { path: "src/output.ts", replaced: true };
      },
    });

    registry.register({
      name: "submit",
      description: "submit",
      agent: "swarm",
      schema: (await import("zod")).z.object({}),
      handler: async () => ({ ok: true, terminal: "submit" }),
    });

    const client = makeClient([
      JSON.stringify({ action: "edit_file", args: { path: "src/output.ts", old_string: "missing", new_string: "present" } }),
      JSON.stringify({ action: "edit_file", args: { path: "src/output.ts", old_string: "correct", new_string: "replacement" } }),
      JSON.stringify({ action: "submit", args: {} }),
    ]);

    const agent = new WorkerAgent({ client, registry, bus, workspaceRoot: "/tmp/ws" });
    const result = await agent.run(makeTask());

    expect(result.status).toBe("success");
    expect(editAttempts).toBe(2);
  });

  it("emits worker_started, worker_tool_call, worker_tool_result, worker_finished events", async () => {
    registry.register({
      name: "submit",
      description: "submit",
      agent: "swarm",
      schema: (await import("zod")).z.object({}),
      handler: async () => ({ ok: true, terminal: "submit" }),
    });

    const events: string[] = [];
    bus.on("worker_started", () => events.push("worker_started"));
    bus.on("worker_tool_call", () => events.push("worker_tool_call"));
    bus.on("worker_finished", () => events.push("worker_finished"));

    const client = makeClient([
      JSON.stringify({ action: "submit", args: {} }),
    ]);

    const agent = new WorkerAgent({ client, registry, bus, workspaceRoot: "/tmp/ws" });
    await agent.run(makeTask());

    expect(events).toContain("worker_started");
    expect(events).toContain("worker_tool_call");
    expect(events).toContain("worker_finished");
  });
});
