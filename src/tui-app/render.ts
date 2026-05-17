import React from "react";
import { render } from "ink";
import type { EventBus } from "../events/bus.js";
import type { UsageTracker } from "../tui/usage-tracker.js";
import type { AgentRunner } from "../agent/agent-runner.js";
import type { SessionState } from "../agent/session-state.js";
import { App } from "./App.js";

interface RenderOpts {
  bus: EventBus;
  tracker: UsageTracker;
  runner: AgentRunner;
  state: SessionState;
  initialWorkspace: string;
  orchestratorModel?: string;
  swarmModel?: string;
}

export interface TuiHandle {
  waitUntilExit(): Promise<void>;
  cleanup(): void;
}

export function renderTui(opts: RenderOpts): TuiHandle {
  const instance = render(
    React.createElement(App, {
      bus: opts.bus,
      tracker: opts.tracker,
      runner: opts.runner,
      state: opts.state,
      initialWorkspace: opts.initialWorkspace,
      orchestratorModel: opts.orchestratorModel,
      swarmModel: opts.swarmModel,
    }),
  );

  return {
    waitUntilExit(): Promise<void> {
      return instance.waitUntilExit();
    },
    cleanup(): void {
      instance.unmount();
      instance.cleanup();
    },
  };
}
