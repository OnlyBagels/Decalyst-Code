import * as path from "node:path";
import * as fs from "node:fs/promises";
import { execa } from "execa";
import { parseTscErrors } from "../runners/parse-tsc.js";
import type { TestResult } from "../types/agent.js";

export interface SandboxEvalOptions {
  workspaceRoot: string;
  timeoutMs?: number;
}

export class SandboxEval {
  private readonly workspaceRoot: string;
  private readonly timeoutMs: number;
  private readonly sandboxDir: string;

  constructor(opts: SandboxEvalOptions) {
    this.workspaceRoot = opts.workspaceRoot;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.sandboxDir = path.join(this.workspaceRoot, "runs", ".sandbox");
  }

  async evalTs(snippet: string): Promise<{ ok: boolean; output: string; errors: string[] }> {
    const tmpFile = path.join(
      this.sandboxDir,
      `eval-${Date.now()}-${Math.random().toString(36).slice(2)}.ts`,
    );

    try {
      await fs.mkdir(this.sandboxDir, { recursive: true });
      await fs.writeFile(tmpFile, snippet, "utf8");

      const result = await execa("npx", ["tsx", tmpFile], {
        cwd: this.workspaceRoot,
        reject: false,
        timeout: this.timeoutMs,
        stdio: "pipe",
        env: { ...process.env, CI: "1" },
      });

      return {
        ok: result.exitCode === 0,
        output: result.stdout ?? "",
        errors: result.exitCode !== 0 ? [(result.stderr ?? "").trim()] : [],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        output: "",
        errors: [message],
      };
    } finally {
      try {
        await fs.unlink(tmpFile);
      } catch {
        // File may already be gone
      }
    }
  }

  async evalPython(snippet: string): Promise<{ ok: boolean; output: string; errors: string[] }> {
    try {
      const result = await execa("python", ["-c", snippet], {
        cwd: this.workspaceRoot,
        reject: false,
        timeout: this.timeoutMs,
        stdio: "pipe",
        env: { ...process.env, CI: "1" },
      });

      return {
        ok: result.exitCode === 0,
        output: result.stdout ?? "",
        errors: result.exitCode !== 0 ? [(result.stderr ?? "").trim()] : [],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        output: "",
        errors: [message],
      };
    }
  }

  async dryCompileTs(snippet: string): Promise<{ ok: boolean; errors: string[] }> {
    const tmpFile = path.join(
      this.sandboxDir,
      `dryc-${Date.now()}-${Math.random().toString(36).slice(2)}.ts`,
    );

    try {
      await fs.mkdir(this.sandboxDir, { recursive: true });
      await fs.writeFile(tmpFile, snippet, "utf8");

      const result = await execa("npx", ["tsc", "--noEmit", tmpFile], {
        cwd: this.workspaceRoot,
        reject: false,
        timeout: this.timeoutMs,
        stdio: "pipe",
        env: { ...process.env, CI: "1" },
      });

      const testResult: TestResult = {
        command: `tsc --noEmit ${tmpFile}`,
        exitCode: result.exitCode ?? -1,
        passed: result.exitCode === 0,
        durationMs: 0,
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
        failures: [],
      };

      const errors = parseTscErrors(testResult);

      return {
        ok: result.exitCode === 0,
        errors: errors.map((e) => e.message),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        errors: [message],
      };
    } finally {
      try {
        await fs.unlink(tmpFile);
      } catch {
        // File may already be gone
      }
    }
  }
}
