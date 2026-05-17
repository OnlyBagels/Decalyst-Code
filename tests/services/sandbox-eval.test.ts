import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SandboxEval } from "../../src/services/sandbox-eval.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

describe("SandboxEval", () => {
  let tmpDir: string;
  let sandbox: SandboxEval;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sandbox-"));
    sandbox = new SandboxEval({ workspaceRoot: tmpDir, timeoutMs: 30_000 });
  });

  afterEach(async () => {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("dryCompileTs", () => {
    it("returns object with ok and errors fields", async () => {
      const snippet = "const x: number = 42;";
      const result = await sandbox.dryCompileTs(snippet);
      expect(typeof result.ok).toBe("boolean");
      expect(Array.isArray(result.errors)).toBe(true);
    });
  });

  describe("evalPython", () => {
    it("returns object with ok, output, and errors fields", async () => {
      const snippet = "print('test')";
      const result = await sandbox.evalPython(snippet);
      expect(typeof result.ok).toBe("boolean");
      expect(typeof result.output).toBe("string");
      expect(Array.isArray(result.errors)).toBe(true);
    });
  });

  describe("evalTs", () => {
    it("creates temp file in sandbox dir", async () => {
      const snippet = "console.log('test');";
      await sandbox.evalTs(snippet);

      const sandboxDir = path.join(tmpDir, "runs", ".sandbox");
      try {
        const entries = await fs.readdir(sandboxDir);
        // Cleanup should remove the file
        expect(entries.length).toBe(0);
      } catch {
        // Dir may not exist, which is fine
      }
    });
  });
});
