import { describe, it, expect } from "vitest";
import { createSessionState } from "../../src/agent/session-state.js";

describe("createSessionState", () => {
  it("sets workspaceRoot from opts", () => {
    const state = createSessionState({ workspaceRoot: "/some/path" });
    expect(state.workspaceRoot).toBe("/some/path");
  });

  it("initializes default fields correctly", () => {
    const state = createSessionState({ workspaceRoot: "/tmp/test" });
    expect(state.transcript).toEqual([]);
    expect(state.inputHistory).toEqual([]);
    expect(state.activeRun).toBeNull();
    expect(state.permissionDecisions).toBeInstanceOf(Map);
    expect(state.permissionDecisions.size).toBe(0);
    expect(typeof state.sessionId).toBe("string");
    expect(state.sessionId.length).toBeGreaterThan(0);
    expect(state.orchestratorModel).toBeUndefined();
    expect(state.swarmModel).toBeUndefined();
  });
});
