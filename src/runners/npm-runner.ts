import { CommandRunner, type CommandName } from "./command-runner.js";
import { parseTscErrors } from "./parse-tsc.js";
import { parseVitestFailures } from "./parse-vitest.js";
import { parseEslintErrors } from "./parse-eslint.js";
import type { TestResult, CompilerError } from "../types/agent.js";

export interface CheckOutcome {
  results: TestResult[];
  compilerErrors: CompilerError[];
  passed: boolean;
}

export class NpmRunner {
  private readonly runner: CommandRunner;

  constructor(workspaceRoot: string) {
    this.runner = new CommandRunner({ cwd: workspaceRoot });
  }

  async runOne(name: CommandName): Promise<TestResult> {
    return this.runner.run(name);
  }

  /**
   * Runs the standard MVP check sequence: install → format → typecheck → test.
   * Stops as soon as install fails.
   */
  async runChecks(): Promise<CheckOutcome> {
    const results: TestResult[] = [];

    const install = await this.runner.run("npm_install");
    results.push(install);
    if (!install.passed) {
      return { results, compilerErrors: [], passed: false };
    }

    results.push(await this.runner.run("format"));

    const typecheck = await this.runner.run("typecheck");
    typecheck.failures = []; // tsc errors live in compilerErrors
    results.push(typecheck);

    const compilerErrors = parseTscErrors(typecheck);

    const test = await this.runner.run("test");
    test.failures = parseVitestFailures(test);
    results.push(test);

    const passed = results.every((r) => r.passed);
    return { results, compilerErrors, passed };
  }

  parseTypecheck(result: TestResult): CompilerError[] {
    return parseTscErrors(result);
  }

  parseLint(result: TestResult): CompilerError[] {
    return parseEslintErrors(result);
  }
}
