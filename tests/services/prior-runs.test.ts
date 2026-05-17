import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { PriorRunsSearch } from "../../src/services/prior-runs.js";

describe("PriorRunsSearch", () => {
  let runsRoot: string;
  let search: PriorRunsSearch;

  beforeEach(async () => {
    runsRoot = await fs.mkdtemp(path.join(os.tmpdir(), "prior-runs-test-"));
    search = new PriorRunsSearch({ runsRoot });
  });

  afterEach(async () => {
    try {
      await fs.rm(runsRoot, { recursive: true });
    } catch {
      // ignore cleanup
    }
  });

  it("search finds hits across multiple runs", async () => {
    await fs.mkdir(path.join(runsRoot, "run-001"));
    await fs.writeFile(
      path.join(runsRoot, "run-001", "final-report.md"),
      "# Run 001\n\nFound the keyword here.",
      "utf8",
    );

    await fs.mkdir(path.join(runsRoot, "run-002"));
    await fs.writeFile(
      path.join(runsRoot, "run-002", "final-report.md"),
      "# Run 002\n\nKeyword appears again.",
      "utf8",
    );

    const results = await search.search("keyword");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.runId === "run-001")).toBe(true);
    expect(results.some((r) => r.runId === "run-002")).toBe(true);
  });

  it("limit applied correctly", async () => {
    for (let i = 1; i <= 5; i++) {
      await fs.mkdir(path.join(runsRoot, `run-${i.toString().padStart(3, "0")}`));
      await fs.writeFile(
        path.join(runsRoot, `run-${i.toString().padStart(3, "0")}`, "final-report.md"),
        `Content ${i} with search_term here`,
        "utf8",
      );
    }

    const results = await search.search("search_term", 2);
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it("missing runsRoot returns empty array", async () => {
    const search2 = new PriorRunsSearch({ runsRoot: "/nonexistent/path" });
    const results = await search2.search("anything");
    expect(results).toEqual([]);
  });

  it("case-insensitive substring match", async () => {
    await fs.mkdir(path.join(runsRoot, "run-001"));
    await fs.writeFile(
      path.join(runsRoot, "run-001", "final-report.md"),
      "# Report\n\nThis has KEYWORD in uppercase",
      "utf8",
    );

    const results = await search.search("keyword");
    expect(results.length).toBeGreaterThan(0);
  });

  it("returns snippet with context", async () => {
    await fs.mkdir(path.join(runsRoot, "run-001"));
    await fs.writeFile(
      path.join(runsRoot, "run-001", "final-report.md"),
      "Before the target word after",
      "utf8",
    );

    const results = await search.search("target");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.snippet).toContain("target");
  });

  it("searches multiple markdown files in run", async () => {
    await fs.mkdir(path.join(runsRoot, "run-001"));
    await fs.writeFile(
      path.join(runsRoot, "run-001", "final-report.md"),
      "File 1 with needle",
      "utf8",
    );
    await fs.writeFile(
      path.join(runsRoot, "run-001", "logs.md"),
      "File 2 also has needle",
      "utf8",
    );

    const results = await search.search("needle");
    expect(results.length).toBeGreaterThanOrEqual(2);
  });
});
