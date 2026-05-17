import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { ToolRegistry } from "../../../src/tools/registry.js";
import { EventBus } from "../../../src/events/bus.js";
import { ModeController } from "../../../src/modes/mode-controller.js";
import { registerMetaTools } from "../../../src/tools/handlers/meta.js";
import { PermissionResolver } from "../../../src/tools/permissions.js";
import { FileLocks } from "../../../src/tools/locks.js";

describe("meta tools", () => {
  let registry: ToolRegistry;
  let bus: EventBus;
  let modeController: ModeController;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "decalyst-meta-"));

    const permissions = new PermissionResolver({
      perTool: {},
      globalOverride: "auto",
    });
    const locks = new FileLocks();

    registry = new ToolRegistry({ permissions, locks });
    bus = new EventBus();
    modeController = new ModeController(bus, {
      maxFixRounds: 3,
      swarmConcurrency: 4,
      maxToolCallsPerTurn: 10,
      maxWebFetchesPerRun: 5,
      wallClockMs: 3600000,
    });

    registerMetaTools(registry, {
      modeController,
      bus,
      tracesDir: tempDir,
    });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("ask_user emits event and awaits resolve", async () => {
    const question = "What is your name?";
    const options = ["Alice", "Bob"];

    let emittedEvent: any;
    bus.on("ask_user", (evt) => {
      emittedEvent = evt;
    });

    const invokePromise = registry.invoke(
      "ask_user",
      { question, options },
      {
        workspaceRoot: process.cwd(),
        agent: "orchestrator",
        signal: new AbortController().signal,
        emit: () => {},
      },
    );

    // Give event listener time to receive emit
    await new Promise((r) => setTimeout(r, 10));

    expect(emittedEvent).toBeDefined();
    expect(emittedEvent.question).toBe(question);
    expect(emittedEvent.options).toEqual(options);
    expect(typeof emittedEvent.resolve).toBe("function");

    // Call resolve to unblock the handler
    emittedEvent.resolve("Alice");

    const result = await invokePromise;
    expect(result.ok).toBe(true);
    expect((result as any).data.answer).toBe("Alice");
  });

  it("ask_user times out if resolve never called", async () => {
    const result = await registry.invoke(
      "ask_user",
      { question: "Never answered?" },
      {
        workspaceRoot: process.cwd(),
        agent: "orchestrator",
        signal: new AbortController().signal,
        emit: () => {},
      },
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain("timeout");
  }, 360000);

  it("finalize writes report and transitions to done", async () => {
    const report = "# Final Report\n\nAll tasks completed.";

    let finishedEvent: any;
    bus.on("run_finished", (evt) => {
      finishedEvent = evt;
    });

    // Transition to review mode (finalize requires review mode)
    await modeController.transition("plan");
    await modeController.transition("execute");
    await modeController.transition("review");

    const result = await registry.invoke(
      "finalize",
      { report, passed: true },
      {
        workspaceRoot: process.cwd(),
        agent: "orchestrator",
        signal: new AbortController().signal,
        emit: () => {},
      },
    );

    expect(result.ok).toBe(true);
    expect((result as any).data.terminal).toBe("finalize");

    const reportPath = path.join(tempDir, "final-report.md");
    const written = await fs.readFile(reportPath, "utf8");
    expect(written).toBe(report);

    expect(modeController.current).toBe("done");
    expect(finishedEvent).toBeDefined();
    expect(finishedEvent.passed).toBe(true);
  });

  it("bail writes failure report and transitions to failed", async () => {
    const reason = "Database connection failed";

    let finishedEvent: any;
    bus.on("run_finished", (evt) => {
      finishedEvent = evt;
    });

    // Transition to plan mode (bail can run from plan, execute, or review)
    await modeController.transition("plan");

    const result = await registry.invoke(
      "bail",
      { reason },
      {
        workspaceRoot: process.cwd(),
        agent: "orchestrator",
        signal: new AbortController().signal,
        emit: () => {},
      },
    );

    expect(result.ok).toBe(true);
    expect((result as any).data.terminal).toBe("bail");

    const reportPath = path.join(tempDir, "final-report.md");
    const written = await fs.readFile(reportPath, "utf8");
    expect(written).toContain("# BAIL");
    expect(written).toContain(reason);

    expect(modeController.current).toBe("failed");
    expect(finishedEvent).toBeDefined();
    expect(finishedEvent.passed).toBe(false);
  });

  it("finalize defaults passed to true", async () => {
    const report = "Done.";

    let finishedEvent: any;
    bus.on("run_finished", (evt) => {
      finishedEvent = evt;
    });

    // Transition to review mode
    await modeController.transition("plan");
    await modeController.transition("execute");
    await modeController.transition("review");

    await registry.invoke(
      "finalize",
      { report },
      {
        workspaceRoot: process.cwd(),
        agent: "orchestrator",
        signal: new AbortController().signal,
        emit: () => {},
      },
    );

    expect(finishedEvent).toBeDefined();
    expect(finishedEvent.passed).toBe(true);
  });
});
