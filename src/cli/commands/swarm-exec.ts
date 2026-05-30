import * as fs from "node:fs/promises";
import * as path from "node:path";
import { execPlan } from "../../core/exec-plan.js";
import { parseProjectPlan } from "../../core/plan-input.js";
import { toMessage } from "../../utils/errors.js";
import type { ExecPlanResult } from "../../core/exec-plan.js";

export interface SwarmExecCommandOptions {
  plan: string;
  workspace: string;
  traces: string;
  concurrency: number;
  verify: boolean;
  json: boolean;
  out?: string;
  tier?: string;
  maxFixRounds?: number;
}

/**
 * Execute a plan produced by an external orchestrator (e.g. an agent driving
 * this CLI). Reads a ProjectPlan JSON from a file or stdin, runs the swarm, and
 * writes the structured result. Exit code: 0 clean, 2 had failures, 1 bad input.
 */
export async function swarmExecCommand(
  opts: SwarmExecCommandOptions,
): Promise<number> {
  const workspaceRoot = path.resolve(opts.workspace);
  const tracesRoot = path.resolve(opts.traces);

  let plan;
  try {
    const raw = await readPlanInput(opts.plan);
    plan = parseProjectPlan(JSON.parse(raw));
  } catch (err) {
    process.stderr.write(`swarm-exec: invalid plan — ${toMessage(err)}\n`);
    return 1;
  }

  try {
    const result = await execPlan({
      plan,
      workspaceRoot,
      tracesRoot,
      concurrency: opts.concurrency,
      verify: opts.verify,
      ...(opts.tier ? { tier: opts.tier } : {}),
      ...(opts.maxFixRounds !== undefined
        ? { maxFixRounds: opts.maxFixRounds }
        : {}),
    });

    const json = JSON.stringify(result, null, 2);
    if (opts.out) {
      await fs.writeFile(path.resolve(opts.out), `${json}\n`, "utf8");
    }

    if (opts.json) {
      process.stdout.write(`${json}\n`);
    } else {
      printHuman(result);
    }

    const clean =
      result.failed.length === 0 &&
      result.blocked.length === 0 &&
      (result.verify?.passed ?? true);
    return clean ? 0 : 2;
  } catch (err) {
    process.stderr.write(`swarm-exec: ${toMessage(err)}\n`);
    return 1;
  }
}

async function readPlanInput(src: string): Promise<string> {
  if (src === "-") return readStdin();
  return fs.readFile(path.resolve(src), "utf8");
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

function printHuman(result: ExecPlanResult): void {
  const lines = [
    `run id:        ${result.runId}`,
    `trace dir:     ${result.traceDir}`,
    `result json:   ${path.join(result.traceDir, "result.json")}`,
    `backends:      ${result.backends.join(", ")}`,
    `applied files: ${result.applied.length}`,
    `failed tasks:  ${result.failed.length}`,
    `blocked tasks: ${result.blocked.length}`,
    result.verify
      ? `verify:        ${result.verify.passed ? "passed" : "failed"}`
      : "verify:        skipped",
    `fix rounds:    ${result.fixRounds}`,
    `usage:         ${result.usage.calls} calls, ${result.usage.cacheHitTokens}/${result.usage.promptTokens} cached, $${result.usage.costUsd.toFixed(4)}, ${Math.round(result.usage.elapsedMs / 1000)}s`,
  ];
  console.log(lines.join("\n"));
}
