import { execa } from "execa";
import type { TestResult } from "../types/agent.js";

export type CommandName =
  | "npm_install"
  | "format"
  | "typecheck"
  | "lint"
  | "test"
  | "build";

const COMMANDS: Record<CommandName, { cmd: string; args: string[] }> = {
  npm_install: { cmd: "npm", args: ["install"] },
  format: { cmd: "npm", args: ["run", "format", "--if-present"] },
  typecheck: { cmd: "npm", args: ["run", "typecheck", "--if-present"] },
  lint: { cmd: "npm", args: ["run", "lint", "--if-present"] },
  test: { cmd: "npm", args: ["test", "--if-present"] },
  build: { cmd: "npm", args: ["run", "build", "--if-present"] },
};

export interface CommandRunnerOptions {
  cwd: string;
  timeoutMs?: number;
}

export class CommandRunner {
  constructor(private readonly opts: CommandRunnerOptions) {}

  async run(name: CommandName): Promise<TestResult> {
    const spec = COMMANDS[name];
    const start = Date.now();

    try {
      const result = await execa(spec.cmd, spec.args, {
        cwd: this.opts.cwd,
        reject: false,
        timeout: this.opts.timeoutMs ?? 300_000,
        stdio: "pipe",
        env: { ...process.env, CI: "1", FORCE_COLOR: "0" },
      });

      return {
        command: `${spec.cmd} ${spec.args.join(" ")}`,
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
        command: `${spec.cmd} ${spec.args.join(" ")}`,
        exitCode: -1,
        passed: false,
        durationMs: Date.now() - start,
        stdout: "",
        stderr: message,
        failures: [],
      };
    }
  }
}
