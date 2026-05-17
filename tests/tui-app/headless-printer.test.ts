import { describe, it, expect, afterEach } from "vitest";
import { Writable } from "stream";
import { EventBus } from "../../src/events/bus.js";
import { HeadlessPrinter } from "../../src/tui-app/headless-printer.js";

class BufferStream extends Writable {
  chunks: string[] = [];

  _write(
    chunk: Buffer | string,
    _encoding: string,
    callback: (error?: Error | null) => void,
  ): void {
    if (typeof chunk === "string") {
      this.chunks.push(chunk);
    } else {
      this.chunks.push(chunk.toString());
    }
    callback();
  }

  getOutput(): string {
    return this.chunks.join("");
  }

  clear(): void {
    this.chunks = [];
  }
}

describe("HeadlessPrinter", () => {
  let bus: EventBus;
  let stream: BufferStream;
  let printer: HeadlessPrinter;

  const setup = () => {
    bus = new EventBus();
    stream = new BufferStream();
    printer = new HeadlessPrinter({ bus, stream });
  };

  afterEach(() => {
    printer.detach();
    bus.removeAllListeners();
  });

  it("mode_change logs mode transitions", () => {
    setup();
    printer.attach();

    bus.emit({ t: "mode_change", mode: "plan" });
    bus.emit({ t: "mode_change", mode: "execute" });

    const output = stream.getOutput();
    expect(output).toContain("[mode] plan");
    expect(output).toContain("[mode] execute");
  });

  it("plan_updated logs plan with file and todo counts", () => {
    setup();
    printer.attach();

    bus.emit({
      t: "plan_updated",
      plan: {
        files: ["a.ts", "b.ts", "c.ts", "d.ts"],
        todos: ["do x", "do y", "do z", "do w", "do v", "do u"],
      },
    });

    const output = stream.getOutput();
    expect(output).toContain("[plan] plan_updated (4 files, 6 todos)");
  });

  it("todo_changed logs item count", () => {
    setup();
    printer.attach();

    bus.emit({
      t: "todo_changed",
      todos: ["item1", "item2", "item3"],
    });

    const output = stream.getOutput();
    expect(output).toContain("[plan] todo_changed (3 items)");
  });

  it("worker_started logs worker initialization", () => {
    setup();
    printer.attach();

    bus.emit({
      t: "worker_started",
      id: "T1",
      file: "src/server.ts",
      role: "route-writer",
    });

    const output = stream.getOutput();
    expect(output).toContain(
      "[exec] worker T1 src/server.ts (route-writer) started",
    );
  });

  it("worker_tool_call logs tool invocation with args", () => {
    setup();
    printer.attach();

    bus.emit({
      t: "worker_tool_call",
      id: "T1",
      tool: "peek_signature",
      args: { symbol: "Router" },
    });

    const output = stream.getOutput();
    expect(output).toContain("[exec] worker T1 tool peek_signature");
    expect(output).toContain('symbol="Router"');
  });

  it("worker_tool_result logs success or error", () => {
    setup();
    printer.attach();

    bus.emit({
      t: "worker_tool_result",
      id: "T1",
      tool: "edit_file",
      ok: true,
    });

    bus.emit({
      t: "worker_tool_result",
      id: "T2",
      tool: "peek_file",
      ok: false,
    });

    const output = stream.getOutput();
    expect(output).toContain("[exec] worker T1 tool edit_file → ok");
    expect(output).toContain("[exec] worker T2 tool peek_file → error");
  });

  it("worker_finished logs completion status", () => {
    setup();
    printer.attach();

    bus.emit({
      t: "worker_finished",
      id: "T1",
      status: "submitted",
    });

    bus.emit({
      t: "worker_finished",
      id: "T2",
      status: "blocked",
    });

    const output = stream.getOutput();
    expect(output).toContain("[exec] worker T1 → submitted");
    expect(output).toContain("[exec] worker T2 → blocked");
  });

  it("command_started logs command invocation", () => {
    setup();
    printer.attach();

    bus.emit({
      t: "command_started",
      name: "typecheck",
    });

    const output = stream.getOutput();
    expect(output).toContain("[cmd] typecheck started");
  });

  it("command_finished logs result with duration", () => {
    setup();
    printer.attach();

    bus.emit({
      t: "command_finished",
      name: "typecheck",
      passed: true,
      durationMs: 3100,
    });

    bus.emit({
      t: "command_finished",
      name: "test",
      passed: false,
      durationMs: 5000,
    });

    const output = stream.getOutput();
    expect(output).toContain("[cmd] typecheck passed in 3.1s");
    expect(output).toContain("[cmd] test failed in 5.0s");
  });

  it("tokens_updated logs token consumption", () => {
    setup();
    printer.attach();

    bus.emit({
      t: "tokens_updated",
      agent: "orchestrator",
      promptTokens: 1240,
      completionTokens: 220,
    });

    const output = stream.getOutput();
    expect(output).toContain(
      "[tokens] orchestrator +1240 in / +220 out",
    );
  });

  it("tool_call_started logs tool invocation from agent", () => {
    setup();
    printer.attach();

    bus.emit({
      t: "tool_call_started",
      toolName: "read_file",
      agent: "agent-1",
      args: { path: "src/index.ts" },
    });

    const output = stream.getOutput();
    expect(output).toContain("[tool] agent-1 called read_file");
    expect(output).toContain('path="src/index.ts"');
  });

  it("tool_call_finished logs result and duration", () => {
    setup();
    printer.attach();

    bus.emit({
      t: "tool_call_finished",
      toolName: "edit_file",
      agent: "agent-1",
      ok: true,
      durationMs: 150,
    });

    bus.emit({
      t: "tool_call_finished",
      toolName: "bash",
      agent: "agent-2",
      ok: false,
      durationMs: 2500,
    });

    const output = stream.getOutput();
    expect(output).toContain("[tool] edit_file → ok (150ms)");
    expect(output).toContain("[tool] bash → error (2500ms)");
  });

  it("permission_request logs tool with args (no auto-resolve)", () => {
    setup();
    printer.attach();

    let resolveCallback: ((decision: any) => void) | null = null;
    bus.emit({
      t: "permission_request",
      toolName: "create_file",
      args: { path: "src/server.ts" },
      resolve: (decision) => {
        resolveCallback = decision;
      },
    });

    const output = stream.getOutput();
    expect(output).toContain("[perm] create_file");
    expect(output).toContain('path="src/server.ts"');
    expect(resolveCallback).toBeNull();
  });

  it("ask_user logs question and options", () => {
    setup();
    printer.attach();

    bus.emit({
      t: "ask_user",
      question: "What framework?",
      options: ["fastify", "express"],
      resolve: () => {},
    });

    const output = stream.getOutput();
    expect(output).toContain('[ask] "What framework?"');
    expect(output).toContain("options=[fastify, express]");
  });

  it("ask_user logs question without options", () => {
    setup();
    printer.attach();

    bus.emit({
      t: "ask_user",
      question: "Enter name:",
      resolve: () => {},
    });

    const output = stream.getOutput();
    expect(output).toContain('[ask] "Enter name:"');
    expect(output).not.toContain("options=");
  });

  it("run_finished logs final status", () => {
    setup();
    printer.attach();

    bus.emit({
      t: "run_finished",
      passed: true,
    });

    bus.emit({
      t: "run_finished",
      passed: false,
    });

    const output = stream.getOutput();
    expect(output).toContain("[done] run finished — PASSED");
    expect(output).toContain("[done] run finished — FAILED");
  });

  it("logs include timestamps", () => {
    setup();
    printer.attach();

    bus.emit({ t: "mode_change", mode: "plan" });

    const output = stream.getOutput();
    const timestampRegex = /\d{2}:\d{2}:\d{2}/;
    expect(output).toMatch(timestampRegex);
  });

  it("detach stops printing subsequent events", () => {
    setup();
    printer.attach();

    bus.emit({ t: "mode_change", mode: "plan" });
    const outputAfterFirst = stream.getOutput();

    printer.detach();
    stream.clear();

    bus.emit({ t: "mode_change", mode: "execute" });
    const outputAfterSecond = stream.getOutput();

    expect(outputAfterFirst).toContain("[mode] plan");
    expect(outputAfterSecond).toBe("");
  });

  it("handles complex nested args", () => {
    setup();
    printer.attach();

    bus.emit({
      t: "worker_tool_call",
      id: "T1",
      tool: "edit_file",
      args: {
        path: "src/index.ts",
        content: "export const x = 1;",
        metadata: { created: true, lines: 50 },
      },
    });

    const output = stream.getOutput();
    expect(output).toContain("[exec] worker T1 tool edit_file");
    expect(output).toContain('path="src/index.ts"');
    expect(output).toContain('content="export const x = 1;"');
  });

  it("handles undefined/null fields gracefully", () => {
    setup();
    printer.attach();

    bus.emit({
      t: "plan_updated",
      plan: undefined,
    });

    bus.emit({
      t: "todo_changed",
      todos: undefined as any,
    });

    const output = stream.getOutput();
    expect(output).toContain("[plan] plan_updated (0 files, 0 todos)");
    expect(output).toContain("[plan] todo_changed (0 items)");
  });
});
