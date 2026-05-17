import React, { act } from "react";
import { describe, it, expect, vi } from "vitest";
import { render } from "ink-testing-library";
import { App } from "../../src/tui-app/App.js";
import { EventBus } from "../../src/events/bus.js";
import { UsageTracker } from "../../src/tui/usage-tracker.js";
import { createSessionState } from "../../src/agent/session-state.js";

function makeFakeRunner() {
  return {
    handleInput: vi.fn().mockResolvedValue({}),
  } as any;
}

async function waitForEffects(): Promise<void> {
  await new Promise((r) => setTimeout(r, 50));
}

describe("App integration", () => {
  it("renders without crashing", async () => {
    const bus = new EventBus();
    const tracker = new UsageTracker();
    const state = createSessionState({ workspaceRoot: "/tmp/ws" });
    const runner = makeFakeRunner();

    let instance: ReturnType<typeof render> | null = null;
    await act(async () => {
      instance = render(
        <App
          bus={bus}
          tracker={tracker}
          runner={runner}
          state={state}
          initialWorkspace="/tmp/ws"
        />,
      );
      await waitForEffects();
    });

    expect(instance!.lastFrame()).toBeDefined();
    instance!.unmount();
    bus.removeAllListeners();
  });

  it("shows worker in stats pane when worker_started event fires", async () => {
    const bus = new EventBus();
    const tracker = new UsageTracker();
    const state = createSessionState({ workspaceRoot: "/tmp/ws" });
    const runner = makeFakeRunner();

    let instance: ReturnType<typeof render> | null = null;
    await act(async () => {
      instance = render(
        <App
          bus={bus}
          tracker={tracker}
          runner={runner}
          state={state}
          initialWorkspace="/tmp/ws"
        />,
      );
      await waitForEffects();
    });

    await act(async () => {
      bus.emit({ t: "worker_started", id: "agent-42", file: "foo.ts", role: "writer" });
      await waitForEffects();
    });

    const allOutput = instance!.frames.join("\n");
    expect(allOutput).toContain("agent-42");
    instance!.unmount();
    bus.removeAllListeners();
  });

  it("updates phase when mode_change fires", async () => {
    const bus = new EventBus();
    const tracker = new UsageTracker();
    const state = createSessionState({ workspaceRoot: "/tmp/ws" });
    const runner = makeFakeRunner();

    let instance: ReturnType<typeof render> | null = null;
    await act(async () => {
      instance = render(
        <App
          bus={bus}
          tracker={tracker}
          runner={runner}
          state={state}
          initialWorkspace="/tmp/ws"
        />,
      );
      await waitForEffects();
    });

    await act(async () => {
      bus.emit({ t: "mode_change", mode: "execute" });
      await waitForEffects();
    });

    const allOutput = instance!.frames.join("\n");
    expect(allOutput).toContain("execute");
    instance!.unmount();
    bus.removeAllListeners();
  });
});
