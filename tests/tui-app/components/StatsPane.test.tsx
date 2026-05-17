import React from "react";
import { describe, it, expect } from "vitest";
import { render } from "ink-testing-library";
import { StatsPane } from "../../../src/tui-app/components/StatsPane.js";
import { UsageTracker } from "../../../src/tui/usage-tracker.js";

function makeTracker(overrides?: {
  promptTokens?: number;
  completionTokens?: number;
  model?: string;
}): UsageTracker {
  const tracker = new UsageTracker();
  if (overrides?.promptTokens !== undefined || overrides?.completionTokens !== undefined) {
    tracker.record({
      agent: "test-agent",
      model: overrides?.model ?? "deepseek-chat",
      promptTokens: overrides?.promptTokens ?? 0,
      completionTokens: overrides?.completionTokens ?? 0,
    });
  }
  return tracker;
}

describe("StatsPane", () => {
  it("displays tracker token totals", () => {
    const tracker = makeTracker({ promptTokens: 5000, completionTokens: 2000 });
    const { lastFrame, unmount } = render(
      <StatsPane
        tracker={tracker}
        workspace="/tmp/ws"
        models={{}}
        phase="idle"
        workers={[]}
      />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("5.0k");
    expect(frame).toContain("2.0k");
    unmount();
  });

  it("displays cost from tracker", () => {
    const tracker = makeTracker({
      promptTokens: 1_000_000,
      completionTokens: 0,
      model: "deepseek-chat",
    });
    const { lastFrame, unmount } = render(
      <StatsPane
        tracker={tracker}
        workspace="/tmp/ws"
        models={{}}
        phase="idle"
        workers={[]}
      />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("$");
    unmount();
  });

  it("displays current phase", () => {
    const tracker = makeTracker();
    const { lastFrame, unmount } = render(
      <StatsPane
        tracker={tracker}
        workspace="/tmp/ws"
        models={{}}
        phase="execute"
        workers={[]}
      />,
    );
    expect(lastFrame()).toContain("execute");
    unmount();
  });

  it("displays worker ids", () => {
    const tracker = makeTracker();
    const workers = [{ id: "worker-1", phase: "writing" }, { id: "worker-2", phase: "testing" }];
    const { lastFrame, unmount } = render(
      <StatsPane
        tracker={tracker}
        workspace="/tmp/ws"
        models={{}}
        phase="plan"
        workers={workers}
      />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("worker-1");
    expect(frame).toContain("worker-2");
    unmount();
  });
});
