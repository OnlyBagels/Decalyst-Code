import { describe, it, expect, beforeEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { z } from "zod";
import { ToolRegistry } from "../../../src/tools/registry.js";
import { PermissionResolver } from "../../../src/tools/permissions.js";
import { FileLocks } from "../../../src/tools/locks.js";
import { FileManager } from "../../../src/files/file-manager.js";
import { registerWorkerTools } from "../../../src/tools/handlers/worker-tools.js";
import type { ToolCtx } from "../../../src/tools/schemas.js";
import type { CodeIndex } from "../../../src/services/code-index/index.js";
import type { CodeIndexQuery } from "../../../src/services/code-index/query.js";
import type { SymbolHit } from "../../../src/services/code-index/types.js";
import { PathPolicyError } from "../../../src/utils/errors.js";

function makeCtx(workspaceRoot: string): ToolCtx {
  return {
    workspaceRoot,
    taskId: "test-task",
    agent: "swarm",
    signal: new AbortController().signal,
    emit: () => {},
  };
}

function makeRegistry(workspaceRoot: string): { registry: ToolRegistry; fileManager: FileManager } {
  const registry = new ToolRegistry({
    permissions: new PermissionResolver({ perTool: {}, globalOverride: "auto" }),
    locks: new FileLocks(),
  });
  const fileManager = new FileManager(workspaceRoot);
  return { registry, fileManager };
}

function makeCodeIndex(hits: SymbolHit[]): CodeIndex {
  const query: CodeIndexQuery = {
    outline: () => [],
    findSymbol: (_name: string, _limit?: number) => hits,
    importGraph: () => [],
    searchText: async () => [],
    callers: () => [],
    callees: () => [],
  };
  return {
    getQuery: () => query,
    init: async () => {},
    shutdown: async () => {},
    getStats: () => ({ fileCount: 0, symbolCount: 0 }),
  } as unknown as CodeIndex;
}

describe("worker-tools", () => {
  let workspaceRoot: string;
  let ctx: ToolCtx;

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "worker-tools-test-"));
    ctx = makeCtx(workspaceRoot);
  });

  describe("peek_signature", () => {
    it("returns hits from code index", async () => {
      const hits: SymbolHit[] = [
        {
          name: "MyClass",
          kind: "class",
          signature: "class MyClass {}",
          filePath: "/workspace/src/my-class.ts",
          rangeStart: 1,
          rangeEnd: 10,
          isExported: true,
        },
      ];

      const codeIndex = makeCodeIndex(hits);
      const { registry, fileManager } = makeRegistry(workspaceRoot);
      registerWorkerTools(registry, { codeIndex, fileManager });

      const result = await registry.invoke("peek_signature", { symbol: "MyClass" }, ctx);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(Array.isArray(result.data)).toBe(true);
        const data = result.data as SymbolHit[];
        expect(data[0]?.name).toBe("MyClass");
      }
    });

    it("passes limit to code index", async () => {
      let capturedLimit: number | undefined;
      const query = {
        outline: () => [],
        findSymbol: (_name: string, limit?: number) => {
          capturedLimit = limit;
          return [];
        },
        importGraph: () => [],
        searchText: async () => [],
        callers: () => [],
        callees: () => [],
      };
      const codeIndex = { getQuery: () => query, init: async () => {}, shutdown: async () => {}, getStats: () => ({ fileCount: 0, symbolCount: 0 }) } as unknown as CodeIndex;
      const { registry, fileManager } = makeRegistry(workspaceRoot);
      registerWorkerTools(registry, { codeIndex, fileManager });

      await registry.invoke("peek_signature", { symbol: "foo", limit: 5 }, ctx);
      expect(capturedLimit).toBe(5);
    });
  });

  describe("edit_file", () => {
    it("applies exact match and updates the file", async () => {
      const codeIndex = makeCodeIndex([]);
      const { registry, fileManager } = makeRegistry(workspaceRoot);
      registerWorkerTools(registry, { codeIndex, fileManager });

      await fileManager.write("src/main.ts", "const x = 1;\nconst y = 2;\nconst z = 3;\n");

      const result = await registry.invoke(
        "edit_file",
        { path: "src/main.ts", old_string: "const y = 2;", new_string: "const y = 99;" },
        ctx,
      );

      expect(result.ok).toBe(true);
      const updated = await fileManager.read("src/main.ts");
      expect(updated).toContain("const y = 99;");
      expect(updated).toContain("const x = 1;");
    });

    it("fails when old_string is not found", async () => {
      const codeIndex = makeCodeIndex([]);
      const { registry, fileManager } = makeRegistry(workspaceRoot);
      registerWorkerTools(registry, { codeIndex, fileManager });

      await fileManager.write("src/main.ts", "const x = 1;\n");

      const result = await registry.invoke(
        "edit_file",
        { path: "src/main.ts", old_string: "const missing = true;", new_string: "const missing = false;" },
        ctx,
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/not found/);
      }
    });

    it("fails when old_string matches multiple times and lists positions", async () => {
      const codeIndex = makeCodeIndex([]);
      const { registry, fileManager } = makeRegistry(workspaceRoot);
      registerWorkerTools(registry, { codeIndex, fileManager });

      await fileManager.write("src/main.ts", "foo\nfoo\nfoo\n");

      const result = await registry.invoke(
        "edit_file",
        { path: "src/main.ts", old_string: "foo", new_string: "bar" },
        ctx,
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/not unique/);
        expect(result.error).toMatch(/3 matches/);
      }
    });
  });

  describe("create_file", () => {
    it("creates a new file with the given content", async () => {
      const codeIndex = makeCodeIndex([]);
      const { registry, fileManager } = makeRegistry(workspaceRoot);
      registerWorkerTools(registry, { codeIndex, fileManager });

      const result = await registry.invoke(
        "create_file",
        { path: "src/new.ts", content: "export const created = true;\n" },
        ctx,
      );

      expect(result.ok).toBe(true);
      const content = await fileManager.read("src/new.ts");
      expect(content).toBe("export const created = true;\n");
    });

    it("fails when the file already exists", async () => {
      const codeIndex = makeCodeIndex([]);
      const { registry, fileManager } = makeRegistry(workspaceRoot);
      registerWorkerTools(registry, { codeIndex, fileManager });

      await fileManager.write("src/existing.ts", "already here\n");

      const result = await registry.invoke(
        "create_file",
        { path: "src/existing.ts", content: "new content\n" },
        ctx,
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/already exists/);
      }
    });
  });

  describe("path policy enforcement", () => {
    it("denies .env via edit_file", async () => {
      const codeIndex = makeCodeIndex([]);
      const { registry, fileManager } = makeRegistry(workspaceRoot);
      registerWorkerTools(registry, { codeIndex, fileManager });

      const result = await registry.invoke(
        "edit_file",
        { path: ".env", old_string: "SECRET=x", new_string: "SECRET=y" },
        ctx,
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/[Pp]ath/);
      }
    });

    it("denies node_modules path via create_file", async () => {
      const codeIndex = makeCodeIndex([]);
      const { registry, fileManager } = makeRegistry(workspaceRoot);
      registerWorkerTools(registry, { codeIndex, fileManager });

      const result = await registry.invoke(
        "create_file",
        { path: "node_modules/foo.ts", content: "injected" },
        ctx,
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/[Pp]ath/);
      }
    });

    it("denies .env via create_file", async () => {
      const codeIndex = makeCodeIndex([]);
      const { registry, fileManager } = makeRegistry(workspaceRoot);
      registerWorkerTools(registry, { codeIndex, fileManager });

      const result = await registry.invoke(
        "create_file",
        { path: ".env", content: "SECRET=leaked" },
        ctx,
      );

      expect(result.ok).toBe(false);
    });
  });

  describe("submit and report_blocker", () => {
    it("submit returns terminal:submit", async () => {
      const codeIndex = makeCodeIndex([]);
      const { registry, fileManager } = makeRegistry(workspaceRoot);
      registerWorkerTools(registry, { codeIndex, fileManager });

      const result = await registry.invoke("submit", {}, ctx);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const data = result.data as { terminal: string };
        expect(data.terminal).toBe("submit");
      }
    });

    it("report_blocker returns terminal:blocker with reason", async () => {
      const codeIndex = makeCodeIndex([]);
      const { registry, fileManager } = makeRegistry(workspaceRoot);
      registerWorkerTools(registry, { codeIndex, fileManager });

      const result = await registry.invoke(
        "report_blocker",
        { reason: "Cannot resolve import", suggested_action: "Add the missing package" },
        ctx,
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        const data = result.data as { terminal: string; reason: string; suggested_action: string };
        expect(data.terminal).toBe("blocker");
        expect(data.reason).toBe("Cannot resolve import");
        expect(data.suggested_action).toBe("Add the missing package");
      }
    });
  });
});
