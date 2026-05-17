import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { ToolRegistry } from "../../../src/tools/registry.js";
import { PermissionResolver } from "../../../src/tools/permissions.js";
import { FileLocks } from "../../../src/tools/locks.js";
import { registerMemoryTools } from "../../../src/tools/handlers/memory.js";
import { Scratchpad } from "../../../src/state/scratchpad.js";
import { PriorRunsSearch } from "../../../src/services/prior-runs.js";
import type { ToolCtx, PermissionConfig } from "../../../src/tools/schemas.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

function makeConfig(overrides: Partial<PermissionConfig> = {}): PermissionConfig {
  return {
    perTool: {
      scratchpad_read: "auto",
      scratchpad_write: "auto",
      scratchpad_append: "auto",
      prior_runs_search: "auto",
    },
    ...overrides,
  };
}

function makeCtx(overrides: Partial<ToolCtx> = {}): ToolCtx {
  return {
    workspaceRoot: "/tmp",
    agent: "orchestrator",
    signal: new AbortController().signal,
    emit: vi.fn(),
    ...overrides,
  };
}

function makeRegistry(opts: Partial<PermissionConfig> = {}) {
  const permissions = new PermissionResolver(makeConfig(opts));
  const locks = new FileLocks();
  return new ToolRegistry({ permissions, locks });
}

describe("registerMemoryTools", () => {
  let tracesDir: string;
  let runsRoot: string;
  let scratchpad: Scratchpad;
  let priorRuns: PriorRunsSearch;

  beforeEach(async () => {
    tracesDir = await fs.mkdtemp(path.join(os.tmpdir(), "memory-test-"));
    runsRoot = await fs.mkdtemp(path.join(os.tmpdir(), "runs-test-"));

    scratchpad = new Scratchpad({ tracesDir });
    priorRuns = new PriorRunsSearch({ runsRoot });
  });

  it("scratchpad_read dispatches correctly", async () => {
    const registry = makeRegistry();
    registerMemoryTools(registry, { scratchpad, priorRuns });

    await scratchpad.write("Test content");
    const result = await registry.invoke("scratchpad_read", {}, makeCtx());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.data as { content: string }).content).toBe("Test content");
    }
  });

  it("scratchpad_write overwrites content", async () => {
    const registry = makeRegistry();
    registerMemoryTools(registry, { scratchpad, priorRuns });

    await scratchpad.write("Original");
    await registry.invoke("scratchpad_write", { content: "Updated" }, makeCtx());

    const content = await scratchpad.read();
    expect(content).toBe("Updated");
  });

  it("scratchpad_append appends line", async () => {
    const registry = makeRegistry();
    registerMemoryTools(registry, { scratchpad, priorRuns });

    await scratchpad.write("Line 1");
    await registry.invoke("scratchpad_append", { line: "Line 2" }, makeCtx());

    const content = await scratchpad.read();
    expect(content).toBe("Line 1\nLine 2");
  });

  it("prior_runs_search dispatches and returns results", async () => {
    await fs.mkdir(path.join(runsRoot, "run-001"));
    await fs.writeFile(
      path.join(runsRoot, "run-001", "final-report.md"),
      "Content with test_keyword here",
      "utf8",
    );

    const registry = makeRegistry();
    registerMemoryTools(registry, { scratchpad, priorRuns });

    const result = await registry.invoke(
      "prior_runs_search",
      { query: "test_keyword", limit: 5 },
      makeCtx(),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as { results: Array<{ runId: string; snippet: string }> };
      expect(data.results.length).toBeGreaterThan(0);
      expect(data.results[0]!.runId).toBe("run-001");
    }
  });

  it("prior_runs_search tool is registered for orchestrator", async () => {
    const registry = makeRegistry();
    registerMemoryTools(registry, { scratchpad, priorRuns });

    const tools = registry.listForAgent("orchestrator");
    const tool = tools.find((t) => t.name === "prior_runs_search");
    expect(tool).toBeDefined();
    expect(tool?.agent).toBe("orchestrator");
  });
});
