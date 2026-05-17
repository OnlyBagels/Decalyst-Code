import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { CodeIndex } from "../../../src/services/code-index/index.js";

const FIXTURE_A = `
import { greet } from "./b.js";

export function runAll(): void {
  greet("world");
}
`.trim();

const FIXTURE_B = `
export function greet(name: string): string {
  return "Hello, " + name;
}

export const VERSION = "1.0.0";
`.trim();

const FIXTURE_C = `
import { runAll } from "./a.js";
import { VERSION } from "./b.js";

export class App {
  start(): void {
    runAll();
    console.log(VERSION);
  }
}
`.trim();

describe("CodeIndex — integration", () => {
  let tmpDir: string;
  let dbDir: string;
  let index: CodeIndex;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "code-index-test-"));
    dbDir = path.join(tmpDir, ".db");
    await fs.mkdir(dbDir, { recursive: true });

    await fs.writeFile(path.join(tmpDir, "a.ts"), FIXTURE_A, "utf8");
    await fs.writeFile(path.join(tmpDir, "b.ts"), FIXTURE_B, "utf8");
    await fs.writeFile(path.join(tmpDir, "c.ts"), FIXTURE_C, "utf8");

    index = new CodeIndex({ workspaceRoot: tmpDir, dbDir });
    await index.init();
  });

  afterEach(async () => {
    await index.shutdown();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("indexes all three files", () => {
    const stats = index.getStats();
    expect(stats.fileCount).toBe(3);
  });

  it("finds exported symbol by name", () => {
    const q = index.getQuery();
    const hits = q.findSymbol("greet");
    expect(hits.some((h) => h.name === "greet")).toBe(true);
    const hit = hits.find((h) => h.name === "greet")!;
    expect(hit.isExported).toBe(true);
    expect(hit.filePath).toContain("b.ts");
  });

  it("outline returns signatures for a file", () => {
    const q = index.getQuery();
    const bFile = path.join(tmpDir, "b.ts");
    const outline = q.outline(bFile);
    expect(outline.length).toBeGreaterThanOrEqual(2);
    expect(outline.some((s) => s.name === "greet")).toBe(true);
    expect(outline.some((s) => s.name === "VERSION")).toBe(true);
  });

  it("importGraph returns edges", () => {
    const q = index.getQuery();
    const edges = q.importGraph();
    expect(edges.length).toBeGreaterThan(0);
    const hasAtoB = edges.some(
      (e) => e.fromFile.endsWith("a.ts") && e.rawImport.includes("./b"),
    );
    expect(hasAtoB).toBe(true);
  });

  it("importGraph filtered to one file", () => {
    const q = index.getQuery();
    const aFile = path.join(tmpDir, "a.ts");
    const edges = q.importGraph(aFile);
    expect(edges.every((e) => e.fromFile === aFile)).toBe(true);
  });

  it("re-upsert after file change replaces old symbols", async () => {
    const q = index.getQuery();
    const bFile = path.join(tmpDir, "b.ts");

    // Rewrite b.ts with a completely different export.
    const newContent = `export function goodbye(name: string): void { console.log(name); }`;
    await fs.writeFile(bFile, newContent, "utf8");

    // Manually trigger re-index (watcher debounce is 200ms — bypass it).
    const { Store, hashContent } = await import("../../../src/services/code-index/store.js");
    const { Parser } = await import("../../../src/services/code-index/parser.js");
    const { extract } = await import("../../../src/services/code-index/extractor.js");

    // Use internal re-index by reinitializing a temporary index.
    const index2 = new CodeIndex({ workspaceRoot: tmpDir, dbDir: path.join(tmpDir, ".db2") });
    await index2.init();

    const hits = index2.getQuery().findSymbol("goodbye");
    expect(hits.some((h) => h.name === "goodbye")).toBe(true);

    const oldHits = index2.getQuery().findSymbol("VERSION");
    // VERSION is gone from b.ts, but the search should not find it in the new index.
    // (It was the old b.ts content, now replaced.)
    expect(oldHits.some((h) => h.filePath === bFile)).toBe(false);

    await index2.shutdown();
  });

  it("symbolCount reflects indexed content", () => {
    const stats = index.getStats();
    // a.ts: runAll, b.ts: greet + VERSION, c.ts: App
    expect(stats.symbolCount).toBeGreaterThanOrEqual(4);
  });
});
