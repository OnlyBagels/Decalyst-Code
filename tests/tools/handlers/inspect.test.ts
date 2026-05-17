import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { z } from "zod";
import { CodeIndex } from "../../../src/services/code-index/index.js";
import { FileManager } from "../../../src/files/file-manager.js";
import { ToolRegistry } from "../../../src/tools/registry.js";
import { PermissionResolver } from "../../../src/tools/permissions.js";
import { FileLocks } from "../../../src/tools/locks.js";
import { registerInspectTools } from "../../../src/tools/handlers/inspect.js";
import type { ToolCtx } from "../../../src/tools/schemas.js";

const FIXTURE_A = `import { greet } from "./b.js";

export function runAll(): void {
  greet("world");
}`.trim();

const FIXTURE_B = `export function greet(name: string): string {
  return "Hello, " + name;
}

export const VERSION = "1.0.0";`.trim();

const FIXTURE_C = `import { runAll } from "./a.js";
import { VERSION } from "./b.js";

export class App {
  start(): void {
    runAll();
    console.log(VERSION);
  }
}`.trim();

function makeCtx(workspaceRoot: string): ToolCtx {
  return {
    workspaceRoot,
    agent: "orchestrator",
    signal: new AbortController().signal,
    emit: vi.fn(),
  };
}

function makeRegistry(workspaceRoot: string): ToolRegistry {
  const permissions = new PermissionResolver({
    perTool: {},
    globalOverride: "auto",
  });
  const locks = new FileLocks();
  return new ToolRegistry({ permissions, locks });
}

describe("inspect tool handlers", () => {
  let tmpDir: string;
  let dbDir: string;
  let index: CodeIndex;
  let registry: ToolRegistry;
  let ctx: ToolCtx;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "inspect-test-"));
    dbDir = path.join(tmpDir, ".db");
    await fs.mkdir(dbDir, { recursive: true });

    await fs.mkdir(path.join(tmpDir, "src"), { recursive: true });
    await fs.writeFile(path.join(tmpDir, "src", "a.ts"), FIXTURE_A, "utf8");
    await fs.writeFile(path.join(tmpDir, "src", "b.ts"), FIXTURE_B, "utf8");
    await fs.writeFile(path.join(tmpDir, "src", "c.ts"), FIXTURE_C, "utf8");
    await fs.writeFile(
      path.join(tmpDir, "README.md"),
      "# test fixture",
      "utf8",
    );

    index = new CodeIndex({ workspaceRoot: tmpDir, dbDir });
    await index.init();

    const fileManager = new FileManager(tmpDir);
    registry = makeRegistry(tmpDir);
    ctx = makeCtx(tmpDir);

    registerInspectTools(registry, {
      codeIndex: index,
      fileManager,
      workspaceRoot: tmpDir,
    });
  });

  afterEach(async () => {
    await index.shutdown();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe("glob", () => {
    it("matches .ts files by pattern", async () => {
      const result = await registry.invoke("glob", { pattern: "src/*.ts" }, ctx);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const files = result.data as string[];
      expect(files).toContain("src/a.ts");
      expect(files).toContain("src/b.ts");
      expect(files).toContain("src/c.ts");
    });

    it("matches all files with ** pattern", async () => {
      const result = await registry.invoke("glob", { pattern: "**/*.ts" }, ctx);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const files = result.data as string[];
      expect(files.some((f) => f.endsWith(".ts"))).toBe(true);
    });

    it("does not return node_modules entries", async () => {
      await fs.mkdir(path.join(tmpDir, "node_modules", "fake-pkg"), {
        recursive: true,
      });
      await fs.writeFile(
        path.join(tmpDir, "node_modules", "fake-pkg", "index.ts"),
        "export const x = 1;",
        "utf8",
      );

      const result = await registry.invoke(
        "glob",
        { pattern: "**/*.ts" },
        ctx,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const files = result.data as string[];
      expect(files.every((f) => !f.includes("node_modules"))).toBe(true);
    });

    it("returns empty array when nothing matches", async () => {
      const result = await registry.invoke(
        "glob",
        { pattern: "nonexistent/*.rs" },
        ctx,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data).toEqual([]);
    });
  });

  describe("grep", () => {
    it("finds matches in fixture files", async () => {
      const result = await registry.invoke(
        "grep",
        { pattern: "greet" },
        ctx,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const hits = result.data as Array<{
        path: string;
        line: number;
        column: number;
        text: string;
      }>;
      expect(hits.length).toBeGreaterThan(0);
    });

    it("respects maxMatches", async () => {
      const result = await registry.invoke(
        "grep",
        { pattern: "export", maxMatches: 2 },
        ctx,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const hits = result.data as unknown[];
      expect(hits.length).toBeLessThanOrEqual(2);
    });
  });

  describe("read_file", () => {
    it("reads full file content", async () => {
      const result = await registry.invoke(
        "read_file",
        { path: "src/b.ts" },
        ctx,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data as string).toContain("export function greet");
    });

    it("slices content with offset and limit", async () => {
      const result = await registry.invoke(
        "read_file",
        { path: "src/b.ts", offset: 1, limit: 1 },
        ctx,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const content = result.data as string;
      expect(content).toContain("export function greet");
      expect(content.split("\n").length).toBe(1);
    });

    it("errors on missing file", async () => {
      const result = await registry.invoke(
        "read_file",
        { path: "src/does-not-exist.ts" },
        ctx,
      );
      expect(result.ok).toBe(false);
    });

    it("rejects forbidden paths", async () => {
      const result = await registry.invoke(
        "read_file",
        { path: "node_modules/foo/index.ts" },
        ctx,
      );
      expect(result.ok).toBe(false);
    });
  });

  describe("outline", () => {
    it("returns signatures from a TS fixture file", async () => {
      const result = await registry.invoke(
        "outline",
        { path: "src/b.ts" },
        ctx,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const outline = result.data as Array<{ name: string; kind: string }>;
      expect(outline.some((s) => s.name === "greet")).toBe(true);
      expect(outline.some((s) => s.name === "VERSION")).toBe(true);
    });

    it("returns empty array for an unknown file", async () => {
      const result = await registry.invoke(
        "outline",
        { path: "src/unknown.ts" },
        ctx,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data).toEqual([]);
    });
  });

  describe("find_symbol", () => {
    it("returns hits with file path and signature", async () => {
      const result = await registry.invoke(
        "find_symbol",
        { name: "greet" },
        ctx,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const hits = result.data as Array<{
        name: string;
        filePath: string;
        kind: string;
      }>;
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0]!.name).toBe("greet");
      expect(hits[0]!.filePath).toContain("b.ts");
    });

    it("respects limit", async () => {
      const result = await registry.invoke(
        "find_symbol",
        { name: "greet", limit: 1 },
        ctx,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const hits = result.data as unknown[];
      expect(hits.length).toBeLessThanOrEqual(1);
    });

    it("returns empty for unknown symbol", async () => {
      const result = await registry.invoke(
        "find_symbol",
        { name: "zzz_does_not_exist" },
        ctx,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data).toEqual([]);
    });
  });

  describe("import_graph", () => {
    it("returns edges between fixture files", async () => {
      const result = await registry.invoke("import_graph", {}, ctx);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const edges = result.data as Array<{
        fromFile: string;
        toFile: string;
        rawImport: string;
      }>;
      expect(edges.length).toBeGreaterThan(0);
      const hasAtoB = edges.some(
        (e) => e.fromFile.endsWith("a.ts") && e.rawImport.includes("./b"),
      );
      expect(hasAtoB).toBe(true);
    });

    it("filters to a single file", async () => {
      const result = await registry.invoke(
        "import_graph",
        { file: "src/a.ts" },
        ctx,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const edges = result.data as Array<{ fromFile: string }>;
      const aAbs = path.join(tmpDir, "src", "a.ts");
      expect(edges.every((e) => e.fromFile === aAbs)).toBe(true);
    });
  });

  describe("read_dts", () => {
    beforeEach(async () => {
      const pkgDir = path.join(tmpDir, "node_modules", "fake-lib");
      await fs.mkdir(pkgDir, { recursive: true });
      await fs.writeFile(
        path.join(pkgDir, "index.d.ts"),
        [
          "export declare function fakeHelper(x: string): void;",
          "export declare const fakeVersion: string;",
        ].join("\n"),
        "utf8",
      );
    });

    it("reads the vendored .d.ts file", async () => {
      const result = await registry.invoke(
        "read_dts",
        { package: "fake-lib" },
        ctx,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data as string).toContain("fakeHelper");
    });

    it("extracts a specific symbol when symbol is set", async () => {
      const result = await registry.invoke(
        "read_dts",
        { package: "fake-lib", symbol: "fakeHelper" },
        ctx,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const content = result.data as string;
      expect(content).toContain("fakeHelper");
    });

    it("reads types field from package.json when present", async () => {
      const pkgDir = path.join(tmpDir, "node_modules", "typed-pkg");
      await fs.mkdir(pkgDir, { recursive: true });
      await fs.mkdir(path.join(pkgDir, "types"), { recursive: true });
      await fs.writeFile(
        path.join(pkgDir, "package.json"),
        JSON.stringify({ name: "typed-pkg", types: "./types/index.d.ts" }),
        "utf8",
      );
      await fs.writeFile(
        path.join(pkgDir, "types", "index.d.ts"),
        "export declare function typedFn(): void;",
        "utf8",
      );

      const result = await registry.invoke(
        "read_dts",
        { package: "typed-pkg" },
        ctx,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data as string).toContain("typedFn");
    });

    it("errors when package has no declarations", async () => {
      const result = await registry.invoke(
        "read_dts",
        { package: "no-such-package" },
        ctx,
      );
      expect(result.ok).toBe(false);
    });
  });
});
