import { describe, it, expect } from "vitest";
import { resolveThinkingParams } from "../src/models/swarm-client.js";

describe("resolveThinkingParams", () => {
  it("sends nothing when unset (provider default, safe for non-DeepSeek)", () => {
    expect(resolveThinkingParams({})).toEqual({});
    expect(resolveThinkingParams({ SWARM_THINKING: "" })).toEqual({});
  });

  it("disables thinking for the swarm", () => {
    expect(resolveThinkingParams({ SWARM_THINKING: "disabled" })).toEqual({
      thinking: { type: "disabled" },
    });
    expect(resolveThinkingParams({ SWARM_THINKING: "OFF" })).toEqual({
      thinking: { type: "disabled" },
    });
  });

  it("enables thinking and passes effort only when on", () => {
    expect(resolveThinkingParams({ SWARM_THINKING: "enabled" })).toEqual({
      thinking: { type: "enabled" },
    });
    expect(
      resolveThinkingParams({
        SWARM_THINKING: "enabled",
        SWARM_REASONING_EFFORT: "high",
      }),
    ).toEqual({ thinking: { type: "enabled" }, reasoning_effort: "high" });
  });

  it("ignores effort when thinking is disabled", () => {
    expect(
      resolveThinkingParams({
        SWARM_THINKING: "disabled",
        SWARM_REASONING_EFFORT: "max",
      }),
    ).toEqual({ thinking: { type: "disabled" } });
  });
});
