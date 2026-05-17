import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MultiLangRunner } from "../../src/runners/multi-lang-runner.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

describe("MultiLangRunner", () => {
  let tmpDir: string;
  let runner: MultiLangRunner;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "multi-lang-"));
    runner = new MultiLangRunner({ workspaceRoot: tmpDir });
  });

  afterEach(async () => {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("detectKind", () => {
    it("returns 'node' for dir with package.json", async () => {
      await fs.writeFile(path.join(tmpDir, "package.json"), "{}", "utf8");
      const kind = await runner.detectKind();
      expect(kind).toBe("node");
    });

    it("returns 'python' for dir with pyproject.toml", async () => {
      await fs.writeFile(path.join(tmpDir, "pyproject.toml"), "", "utf8");
      const kind = await runner.detectKind();
      expect(kind).toBe("python");
    });

    it("returns 'python' for dir with requirements.txt", async () => {
      await fs.writeFile(path.join(tmpDir, "requirements.txt"), "", "utf8");
      const kind = await runner.detectKind();
      expect(kind).toBe("python");
    });

    it("returns 'python' for dir with setup.py", async () => {
      await fs.writeFile(path.join(tmpDir, "setup.py"), "", "utf8");
      const kind = await runner.detectKind();
      expect(kind).toBe("python");
    });

    it("returns 'rust' for dir with Cargo.toml", async () => {
      await fs.writeFile(path.join(tmpDir, "Cargo.toml"), "", "utf8");
      const kind = await runner.detectKind();
      expect(kind).toBe("rust");
    });

    it("returns 'go' for dir with go.mod", async () => {
      await fs.writeFile(path.join(tmpDir, "go.mod"), "", "utf8");
      const kind = await runner.detectKind();
      expect(kind).toBe("go");
    });

    it("returns 'ruby' for dir with Gemfile", async () => {
      await fs.writeFile(path.join(tmpDir, "Gemfile"), "", "utf8");
      const kind = await runner.detectKind();
      expect(kind).toBe("ruby");
    });

    it("returns 'generic' for empty dir", async () => {
      const kind = await runner.detectKind();
      expect(kind).toBe("generic");
    });

    it("prefers node over python when both exist", async () => {
      await fs.writeFile(path.join(tmpDir, "package.json"), "{}", "utf8");
      await fs.writeFile(path.join(tmpDir, "pyproject.toml"), "", "utf8");
      const kind = await runner.detectKind();
      expect(kind).toBe("node");
    });
  });

  describe("run", () => {
    it("returns generic result when no project kind detected", async () => {
      const result = await runner.run("test");
      expect(result.exitCode).toBe(0);
      expect(result.passed).toBe(true);
      expect(result.stdout).toContain("No project kind detected");
    });

    it("returns skip result when command not available for project kind", async () => {
      await fs.writeFile(path.join(tmpDir, "go.mod"), "", "utf8");
      const result = await runner.run("lint");
      expect(result.exitCode).toBe(0);
      expect(result.passed).toBe(true);
      expect(result.stdout).toContain("Skipped");
    });
  });
});
