import { describe, it, expect, beforeEach } from "vitest";
import { EventBus } from "../../src/events/bus.js";
import type { SessionEvent, EventByType } from "../../src/events/types.js";

describe("EventBus", () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  it("should fire handler when event is emitted", () => {
    const handler = (event: EventByType<"mode_change">) => {
      expect(event.t).toBe("mode_change");
      expect(event.mode).toBe("plan");
    };

    bus.on("mode_change", handler);

    const event: SessionEvent = { t: "mode_change", mode: "plan" };
    bus.emit(event);
  });

  it("should pass correctly typed event to handler", () => {
    let received: EventByType<"command_finished"> | null = null;

    bus.on("command_finished", (event) => {
      received = event;
    });

    const event: SessionEvent = {
      t: "command_finished",
      name: "test",
      passed: true,
      durationMs: 100,
    };
    bus.emit(event);

    expect(received).not.toBeNull();
    expect(received?.t).toBe("command_finished");
    expect(received?.name).toBe("test");
    expect(received?.passed).toBe(true);
    expect(received?.durationMs).toBe(100);
  });

  it("should return unsubscribe function from on()", () => {
    let callCount = 0;

    const unsubscribe = bus.on("mode_change", () => {
      callCount++;
    });

    bus.emit({ t: "mode_change", mode: "plan" });
    expect(callCount).toBe(1);

    unsubscribe();

    bus.emit({ t: "mode_change", mode: "execute" });
    expect(callCount).toBe(1);
  });

  it("should support multiple subscribers", () => {
    const calls: string[] = [];

    bus.on("mode_change", () => {
      calls.push("handler1");
    });

    bus.on("mode_change", () => {
      calls.push("handler2");
    });

    bus.emit({ t: "mode_change", mode: "plan" });

    expect(calls).toEqual(["handler1", "handler2"]);
  });

  it("should remove handler via off()", () => {
    let callCount = 0;

    const handler = () => {
      callCount++;
    };

    bus.on("mode_change", handler);
    bus.emit({ t: "mode_change", mode: "plan" });
    expect(callCount).toBe(1);

    bus.off("mode_change", handler);
    bus.emit({ t: "mode_change", mode: "execute" });
    expect(callCount).toBe(1);
  });

  it("should handle worker_tool_call events with typed args", () => {
    let received: EventByType<"worker_tool_call"> | null = null;

    bus.on("worker_tool_call", (event) => {
      received = event;
    });

    const event: SessionEvent = {
      t: "worker_tool_call",
      id: "w1",
      tool: "read_file",
      args: { path: "/test.ts" },
    };
    bus.emit(event);

    expect(received?.id).toBe("w1");
    expect(received?.tool).toBe("read_file");
    expect(received?.args).toEqual({ path: "/test.ts" });
  });

  it("should handle permission_request with resolve callback", () => {
    let received: EventByType<"permission_request"> | null = null;

    bus.on("permission_request", (event) => {
      received = event;
      event.resolve("auto");
    });

    const event: SessionEvent = {
      t: "permission_request",
      toolName: "bash",
      args: { command: "ls" },
      resolve: (decision) => {
        expect(decision).toBe("auto");
      },
    };
    bus.emit(event);

    expect(received?.toolName).toBe("bash");
  });

  it("should handle ask_user with resolve callback", () => {
    let received: EventByType<"ask_user"> | null = null;

    bus.on("ask_user", (event) => {
      received = event;
      event.resolve("yes");
    });

    const event: SessionEvent = {
      t: "ask_user",
      question: "Continue?",
      options: ["yes", "no"],
      resolve: (answer) => {
        expect(answer).toBe("yes");
      },
    };
    bus.emit(event);

    expect(received?.question).toBe("Continue?");
    expect(received?.options).toEqual(["yes", "no"]);
  });

  it("should fire multiple different event types", () => {
    const events: string[] = [];

    bus.on("mode_change", () => {
      events.push("mode_change");
    });

    bus.on("worker_started", () => {
      events.push("worker_started");
    });

    bus.on("tokens_updated", () => {
      events.push("tokens_updated");
    });

    bus.emit({ t: "mode_change", mode: "plan" });
    bus.emit({
      t: "worker_started",
      id: "w1",
      file: "test.ts",
      role: "fixer",
    });
    bus.emit({
      t: "tokens_updated",
      agent: "orchestrator",
      promptTokens: 100,
      completionTokens: 50,
    });

    expect(events).toEqual(["mode_change", "worker_started", "tokens_updated"]);
  });

  it("should clear all listeners on removeAllListeners()", () => {
    let count1 = 0;
    let count2 = 0;

    bus.on("mode_change", () => {
      count1++;
    });

    bus.on("command_finished", () => {
      count2++;
    });

    bus.emit({ t: "mode_change", mode: "plan" });
    bus.emit({
      t: "command_finished",
      name: "test",
      passed: true,
      durationMs: 50,
    });

    expect(count1).toBe(1);
    expect(count2).toBe(1);

    bus.removeAllListeners();

    bus.emit({ t: "mode_change", mode: "execute" });
    bus.emit({
      t: "command_finished",
      name: "test2",
      passed: false,
      durationMs: 100,
    });

    expect(count1).toBe(1);
    expect(count2).toBe(1);
  });

  it("should handle run_finished event", () => {
    let received: EventByType<"run_finished"> | null = null;

    bus.on("run_finished", (event) => {
      received = event;
    });

    const event: SessionEvent = { t: "run_finished", passed: true };
    bus.emit(event);

    expect(received?.t).toBe("run_finished");
    expect(received?.passed).toBe(true);
  });
});
