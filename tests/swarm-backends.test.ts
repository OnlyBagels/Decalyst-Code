import { describe, it, expect } from "vitest";
import { loadBackends, backendsForTier } from "../src/models/swarm-backends.js";

describe("loadBackends", () => {
  it("loads numbered backend groups for a multi-provider swarm", () => {
    const backends = loadBackends({
      SWARM_BACKEND_1_NAME: "deepseek",
      SWARM_BACKEND_1_BASE_URL: "https://api.deepseek.com",
      SWARM_BACKEND_1_API_KEY: "ds-key",
      SWARM_BACKEND_1_MODEL: "deepseek-v4-flash",
      SWARM_BACKEND_1_CONCURRENCY: "8",
      SWARM_BACKEND_1_THINKING: "disabled",
      SWARM_BACKEND_2_NAME: "mimo",
      SWARM_BACKEND_2_BASE_URL: "https://token-plan-sgp.xiaomimimo.com/v1",
      SWARM_BACKEND_2_API_KEY: "mimo-key",
      SWARM_BACKEND_2_MODEL: "mimo-v2.5",
      SWARM_BACKEND_2_CONCURRENCY: "6",
    } as NodeJS.ProcessEnv);

    expect(backends).toHaveLength(2);
    expect(backends.map((b) => b.name)).toEqual(["deepseek", "mimo"]);
    expect(backends[0]?.model).toBe("deepseek-v4-flash");
    expect(backends[0]?.concurrency).toBe(8);
    expect(backends[0]?.thinkingParams).toEqual({ thinking: { type: "disabled" } });
    expect(backends[1]?.baseURL).toBe("https://token-plan-sgp.xiaomimimo.com/v1");
    expect(backends[1]?.concurrency).toBe(6);
    // thinking unset -> provider default (no param sent)
    expect(backends[1]?.thinkingParams).toEqual({});
  });

  it("falls back to the legacy single SWARM_* backend", () => {
    const backends = loadBackends({
      SWARM_BASE_URL: "https://api.deepseek.com",
      SWARM_API_KEY: "k",
      SWARM_MODEL: "deepseek-v4-flash",
      SWARM_THINKING: "disabled",
    } as NodeJS.ProcessEnv);

    expect(backends).toHaveLength(1);
    expect(backends[0]?.name).toBe("swarm");
    expect(backends[0]?.model).toBe("deepseek-v4-flash");
  });

  it("returns empty when nothing is configured", () => {
    expect(loadBackends({} as NodeJS.ProcessEnv)).toEqual([]);
  });

  it("defaults concurrency to 8 when unset or invalid", () => {
    const backends = loadBackends({
      SWARM_BACKEND_1_BASE_URL: "https://x/v1",
      SWARM_BACKEND_1_MODEL: "m",
    } as NodeJS.ProcessEnv);
    expect(backends[0]?.concurrency).toBe(8);
    expect(backends[0]?.name).toBe("backend-1");
    expect(backends[0]?.tier).toBe("bulk");
  });

  it("selects backends by tier", () => {
    const env = {
      SWARM_BACKEND_1_NAME: "deepseek",
      SWARM_BACKEND_1_BASE_URL: "https://api.deepseek.com",
      SWARM_BACKEND_1_MODEL: "deepseek-v4-flash",
      SWARM_BACKEND_1_TIER: "bulk",
      SWARM_BACKEND_2_NAME: "deepseek-pro",
      SWARM_BACKEND_2_BASE_URL: "https://api.deepseek.com",
      SWARM_BACKEND_2_MODEL: "deepseek-v4-pro",
      SWARM_BACKEND_2_TIER: "pro",
    } as NodeJS.ProcessEnv;
    expect(backendsForTier("bulk", env).map((b) => b.name)).toEqual(["deepseek"]);
    expect(backendsForTier("pro", env).map((b) => b.name)).toEqual(["deepseek-pro"]);
    expect(backendsForTier("nope", env)).toEqual([]);
  });

  it("skips disabled backends and tolerates numbering gaps", () => {
    const backends = loadBackends({
      SWARM_BACKEND_1_NAME: "a",
      SWARM_BACKEND_1_BASE_URL: "https://a/v1",
      SWARM_BACKEND_1_MODEL: "ma",
      SWARM_BACKEND_2_NAME: "b",
      SWARM_BACKEND_2_BASE_URL: "https://b/v1",
      SWARM_BACKEND_2_MODEL: "mb",
      SWARM_BACKEND_2_ENABLED: "false",
      // no backend 3 — a gap
      SWARM_BACKEND_4_NAME: "d",
      SWARM_BACKEND_4_BASE_URL: "https://d/v1",
      SWARM_BACKEND_4_MODEL: "md",
    } as NodeJS.ProcessEnv);
    // b is disabled, the gap at 3 is tolerated
    expect(backends.map((b) => b.name)).toEqual(["a", "d"]);
  });

  it("a custom OpenAI-compatible endpoint loads like any other backend", () => {
    const backends = loadBackends({
      SWARM_BACKEND_1_NAME: "openrouter",
      SWARM_BACKEND_1_BASE_URL: "https://openrouter.ai/api/v1",
      SWARM_BACKEND_1_API_KEY: "sk-or-test",
      SWARM_BACKEND_1_MODEL: "qwen/qwen-2.5-coder-32b-instruct",
    } as NodeJS.ProcessEnv);
    expect(backends).toHaveLength(1);
    expect(backends[0]?.baseURL).toBe("https://openrouter.ai/api/v1");
    expect(backends[0]?.apiKey).toBe("sk-or-test");
  });
});
