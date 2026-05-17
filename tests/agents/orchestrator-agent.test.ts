import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { OrchestratorAgent } from "../../src/agents/orchestrator-agent.js";
import { ToolRegistry } from "../../src/tools/registry.js";
import { ModeController } from "../../src/modes/mode-controller.js";
import { EventBus } from "../../src/events/bus.js";
import { PermissionResolver } from "../../src/tools/permissions.js";
import { FileLocks } from "../../src/tools/locks.js";
import type {
  ModelClient,
  CompleteWithToolsArgs,
  CompleteWithToolsResult,
  AssistantMessage,
} from "../../src/models/model-client.js";
import type { ModeBudgets } from "../../src/modes/types.js";

const DEFAULT_BUDGETS: ModeBudgets = {
  maxFixRounds: 3,
  swarmConcurrency: 4,
  maxToolCallsPerTurn: 50,
  maxWebFetchesPerRun: 10,
  wallClockMs: 60_000,
};

function makeRegistry(): ToolRegistry {
  const permissions = new PermissionResolver({
    perTool: {},
    globalOverride: "auto",
  });
  const locks = new FileLocks();
  return new ToolRegistry({ permissions, locks });
}

function finalizeResponse(report: string): CompleteWithToolsResult {
  const msg: AssistantMessage = {
    role: "assistant",
    content: null,
    tool_calls: [
      { id: "tc-1", name: "finalize", args: { report } },
    ],
  };
  return { message: msg, finishReason: "tool_calls" };
}

function bailResponse(reason: string): CompleteWithToolsResult {
  const msg: AssistantMessage = {
    role: "assistant",
    content: null,
    tool_calls: [
      { id: "tc-1", name: "bail", args: { reason } },
    ],
  };
  return { message: msg, finishReason: "tool_calls" };
}

function toolCallResponse(
  calls: Array<{ id: string; name: string; args: unknown }>,
): CompleteWithToolsResult {
  const msg: AssistantMessage = {
    role: "assistant",
    content: null,
    tool_calls: calls,
  };
  return { message: msg, finishReason: "tool_calls" };
}

function makeClient(
  responses: CompleteWithToolsResult[],
): ModelClient {
  let idx = 0;
  return {
    async completeJson() { return "{}"; },
    async completeText() { return ""; },
    async completeWithTools(_args: CompleteWithToolsArgs) {
      const resp = responses[idx++];
      if (resp === undefined) throw new Error("No more scripted responses");
      return resp;
    },
  };
}

describe("OrchestratorAgent", () => {
  let bus: EventBus;
  let registry: ToolRegistry;

  beforeEach(() => {
    bus = new EventBus();
    registry = makeRegistry();

    registry.register({
      name: "noop_tool",
      description: "Does nothing.",
      agent: "orchestrator",
      schema: z.object({ value: z.string() }),
      handler: async () => ({ done: true }),
    });
  });

  it("happy path: finalize returns passed: true with report", async () => {
    const mc = makeClient([finalizeResponse("All good.")]);
    const mc_ = new ModeController(bus, DEFAULT_BUDGETS);
    const agent = new OrchestratorAgent({
      client: mc,
      registry,
      modeController: mc_,
      bus,
      workspaceRoot: "/tmp",
    });

    const result = await agent.run("Do the thing.");
    expect(result.passed).toBe(true);
    expect(result.report).toBe("All good.");
  });

  it("bail returns passed: false with reason", async () => {
    const mc = makeClient([bailResponse("Cannot proceed.")]);
    const mc_ = new ModeController(bus, DEFAULT_BUDGETS);
    const agent = new OrchestratorAgent({
      client: mc,
      registry,
      modeController: mc_,
      bus,
      workspaceRoot: "/tmp",
    });

    const result = await agent.run("Do the thing.");
    expect(result.passed).toBe(false);
    expect(result.report).toBe("Cannot proceed.");
  });

  it("dispatches a registry tool before finalizing", async () => {
    const handler = vi.fn().mockResolvedValue({ dispatched: true });
    registry.register({
      name: "dispatch_worker",
      description: "Dispatch a worker.",
      agent: "orchestrator",
      schema: z.object({ goal: z.string() }),
      handler,
    });

    const mc = makeClient([
      toolCallResponse([
        { id: "tc-1", name: "dispatch_worker", args: { goal: "write file" } },
      ]),
      finalizeResponse("Workers done."),
    ]);
    const mc_ = new ModeController(bus, DEFAULT_BUDGETS);
    const agent = new OrchestratorAgent({
      client: mc,
      registry,
      modeController: mc_,
      bus,
      workspaceRoot: "/tmp",
    });

    const result = await agent.run("Dispatch and finish.");
    expect(handler).toHaveBeenCalledOnce();
    expect(result.passed).toBe(true);
    expect(result.report).toBe("Workers done.");
  });

  it("nudges the model when it returns a stop response without tool_calls", async () => {
    const stopResponse: CompleteWithToolsResult = {
      message: { role: "assistant", content: "Here is my plan..." },
      finishReason: "stop",
    };

    const mc = makeClient([stopResponse, finalizeResponse("Done after nudge.")]);
    const mc_ = new ModeController(bus, DEFAULT_BUDGETS);
    const agent = new OrchestratorAgent({
      client: mc,
      registry,
      modeController: mc_,
      bus,
      workspaceRoot: "/tmp",
    });

    const result = await agent.run("Plan something.");
    expect(result.passed).toBe(true);
    expect(result.report).toBe("Done after nudge.");
  });

  it("turn limit returns passed: false", async () => {
    const stopResponse: CompleteWithToolsResult = {
      message: { role: "assistant", content: "Still thinking..." },
      finishReason: "stop",
    };
    const responses = Array.from({ length: 3 }, () => stopResponse);

    const mc = makeClient(responses);
    const mc_ = new ModeController(bus, DEFAULT_BUDGETS);
    const agent = new OrchestratorAgent({
      client: mc,
      registry,
      modeController: mc_,
      bus,
      workspaceRoot: "/tmp",
      maxTurnsPerMode: 3,
    });

    const result = await agent.run("Loop forever.");
    expect(result.passed).toBe(false);
    expect(result.report).toMatch(/turn limit/i);
  });

  it("budget exhaustion causes bail when recordToolCall throws", async () => {
    const tightBudgets: ModeBudgets = {
      ...DEFAULT_BUDGETS,
      maxToolCallsPerTurn: 0,
    };

    const mc = makeClient([
      toolCallResponse([
        { id: "tc-1", name: "noop_tool", args: { value: "x" } },
      ]),
    ]);
    const mc_ = new ModeController(bus, tightBudgets);
    const agent = new OrchestratorAgent({
      client: mc,
      registry,
      modeController: mc_,
      bus,
      workspaceRoot: "/tmp",
    });

    const result = await agent.run("Run one tool and exceed budget.");
    expect(result.passed).toBe(false);
    expect(result.report).toMatch(/budget exceeded/i);
  });

  it("ask_user pauses and resumes after resolver is called", async () => {
    const mc = makeClient([
      toolCallResponse([
        { id: "tc-1", name: "ask_user", args: { question: "Which path?" } },
      ]),
      finalizeResponse("Used user answer."),
    ]);
    const mc_ = new ModeController(bus, DEFAULT_BUDGETS);

    bus.on("ask_user", (event) => {
      event.resolve("path/to/file.ts");
    });

    const agent = new OrchestratorAgent({
      client: mc,
      registry,
      modeController: mc_,
      bus,
      workspaceRoot: "/tmp",
    });

    const result = await agent.run("Ask user then finish.");
    expect(result.passed).toBe(true);
    expect(result.report).toBe("Used user answer.");
  });

  it("emits tool_call_started and tool_call_finished events", async () => {
    const started: string[] = [];
    const finished: string[] = [];

    bus.on("tool_call_started", (e) => started.push(e.toolName));
    bus.on("tool_call_finished", (e) => finished.push(e.toolName));

    const mc = makeClient([
      toolCallResponse([
        { id: "tc-1", name: "noop_tool", args: { value: "hello" } },
      ]),
      finalizeResponse("OK."),
    ]);
    const mc_ = new ModeController(bus, DEFAULT_BUDGETS);
    const agent = new OrchestratorAgent({
      client: mc,
      registry,
      modeController: mc_,
      bus,
      workspaceRoot: "/tmp",
    });

    await agent.run("Run and emit events.");

    expect(started).toContain("noop_tool");
    expect(started).toContain("finalize");
    expect(finished).toContain("noop_tool");
    expect(finished).toContain("finalize");
  });

  it("mode transitions from idle to plan on run", async () => {
    const modes: string[] = [];
    bus.on("mode_change", (e) => modes.push(e.mode));

    const mc = makeClient([finalizeResponse("Done.")]);
    const mc_ = new ModeController(bus, DEFAULT_BUDGETS);
    const agent = new OrchestratorAgent({
      client: mc,
      registry,
      modeController: mc_,
      bus,
      workspaceRoot: "/tmp",
    });

    await agent.run("Start.");
    expect(modes[0]).toBe("plan");
  });

  it("unknown tool name returns error result but continues", async () => {
    const mc = makeClient([
      toolCallResponse([
        { id: "tc-1", name: "nonexistent_tool", args: {} },
      ]),
      finalizeResponse("Recovered."),
    ]);
    const mc_ = new ModeController(bus, DEFAULT_BUDGETS);
    const agent = new OrchestratorAgent({
      client: mc,
      registry,
      modeController: mc_,
      bus,
      workspaceRoot: "/tmp",
    });

    const result = await agent.run("Try unknown tool.");
    expect(result.passed).toBe(true);
    expect(result.report).toBe("Recovered.");
  });
});
