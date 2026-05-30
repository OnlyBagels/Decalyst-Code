import * as path from "node:path";
import * as fs from "node:fs/promises";
import { execa } from "execa";
import type { TestResult } from "../types/agent.js";

export type ProjectKind = "node" | "python" | "rust" | "go" | "ruby" | "generic";

export type VerifyCommand =
  | "install"
  | "typecheck"
  | "test"
  | "lint"
  | "format"
  | "build";

export interface MultiLangRunnerOptions {
  workspaceRoot: string;
  timeoutMs?: number;
}

export class MultiLangRunner {
  private readonly workspaceRoot: string;
  private readonly timeoutMs: number;

  constructor(opts: MultiLangRunnerOptions) {
    this.workspaceRoot = opts.workspaceRoot;
    this.timeoutMs = opts.timeoutMs ?? 300_000;
  }

  async detectKind(): Promise<ProjectKind> {
    const checks: Array<[ProjectKind, string[]]> = [
      ["node", ["package.json"]],
      ["python", ["pyproject.toml", "requirements.txt", "setup.py"]],
      ["rust", ["Cargo.toml"]],
      ["go", ["go.mod"]],
      ["ruby", ["Gemfile"]],
    ];

    for (const [kind, files] of checks) {
      for (const file of files) {
        const fullPath = path.join(this.workspaceRoot, file);
        try {
          await fs.access(fullPath);
          return kind;
        } catch {
          // File doesn't exist, continue
        }
      }
    }

    return "generic";
  }

  async run(cmd: VerifyCommand): Promise<TestResult> {
    const kind = await this.detectKind();

    if (kind === "generic") {
      return {
        command: cmd,
        exitCode: 0,
        passed: true,
        durationMs: 0,
        stdout: "No project kind detected",
        stderr: "",
        failures: [],
      };
    }

    const commands = this.resolveCommand(kind, cmd);
    if (commands === null) {
      return {
        command: `${cmd} (${kind})`,
        exitCode: 0,
        passed: true,
        durationMs: 0,
        stdout: `Skipped: no command for ${cmd} on ${kind}`,
        stderr: "",
        failures: [],
      };
    }

    const start = Date.now();

    try {
      const result = await execa(commands.cmd, commands.args, {
        cwd: this.workspaceRoot,
        reject: false,
        timeout: this.timeoutMs,
        stdio: "pipe",
        env: { ...process.env, CI: "1", FORCE_COLOR: "0" },
      });

      return {
        command: `${commands.cmd} ${commands.args.join(" ")}`,
        exitCode: typeof result.exitCode === "number" ? result.exitCode : -1,
        passed: result.exitCode === 0,
        durationMs: Date.now() - start,
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
        failures: [],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        command: `${commands.cmd} ${commands.args.join(" ")}`,
        exitCode: -1,
        passed: false,
        durationMs: Date.now() - start,
        stdout: "",
        stderr: message,
        failures: [],
      };
    }
  }

  private resolveCommand(
    kind: ProjectKind,
    cmd: VerifyCommand,
  ): { cmd: string; args: string[] } | null {
    switch (kind) {
      case "node":
        return this.nodeCommand(cmd);
      case "python":
        return this.pythonCommand(cmd);
      case "rust":
        return this.rustCommand(cmd);
      case "go":
        return this.goCommand(cmd);
      case "ruby":
        return this.rubyCommand(cmd);
      case "generic":
        return null;
    }
  }

  private nodeCommand(cmd: VerifyCommand): { cmd: string; args: string[] } | null {
    switch (cmd) {
      case "install":
        return { cmd: "npm", args: ["install"] };
      case "typecheck":
        return { cmd: "npm", args: ["run", "typecheck", "--if-present"] };
      case "test":
        return { cmd: "npm", args: ["test", "--if-present"] };
      case "lint":
        return { cmd: "npm", args: ["run", "lint", "--if-present"] };
      case "format":
        return { cmd: "npm", args: ["run", "format", "--if-present"] };
      case "build":
        return { cmd: "npm", args: ["run", "build", "--if-present"] };
    }
  }

  private pythonCommand(cmd: VerifyCommand): { cmd: string; args: string[] } | null {
    switch (cmd) {
      case "install":
        return { cmd: "pip", args: ["install", "-r", "requirements.txt"] };
      case "typecheck":
        return { cmd: "mypy", args: ["."] };
      case "test":
        return { cmd: "pytest", args: [] };
      case "lint":
        return { cmd: "ruff", args: ["check", "."] };
      case "format":
        return { cmd: "ruff", args: ["format", "."] };
      case "build":
        return null;
    }
  }

  private rustCommand(cmd: VerifyCommand): { cmd: string; args: string[] } | null {
    switch (cmd) {
      case "install":
        return { cmd: "cargo", args: ["fetch"] };
      case "typecheck":
        return { cmd: "cargo", args: ["check"] };
      case "test":
        return { cmd: "cargo", args: ["test"] };
      case "lint":
        return { cmd: "cargo", args: ["clippy"] };
      case "format":
        return { cmd: "cargo", args: ["fmt", "--check"] };
      case "build":
        return { cmd: "cargo", args: ["build"] };
    }
  }

  private goCommand(cmd: VerifyCommand): { cmd: string; args: string[] } | null {
    switch (cmd) {
      case "install":
        return { cmd: "go", args: ["mod", "download"] };
      case "typecheck":
        return { cmd: "go", args: ["vet", "./..."] };
      case "test":
        return { cmd: "go", args: ["test", "./..."] };
      case "lint":
        return null;
      case "format":
        return { cmd: "gofmt", args: ["-l", "."] };
      case "build":
        return { cmd: "go", args: ["build", "./..."] };
    }
  }

  private rubyCommand(cmd: VerifyCommand): { cmd: string; args: string[] } | null {
    switch (cmd) {
      case "install":
        return { cmd: "bundle", args: ["install"] };
      case "test":
        return { cmd: "bundle", args: ["exec", "rake", "test"] };
      case "typecheck":
      case "lint":
      case "format":
      case "build":
        return null;
    }
  }
}
