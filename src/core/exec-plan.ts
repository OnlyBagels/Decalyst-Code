import * as fs from "node:fs/promises";
import * as path from "node:path";
import { FileManager } from "../files/file-manager.js";
import { ContextSelector } from "../context/context-selector.js";
import { WorkerRunner, type TaskWorker } from "../workers/worker-runner.js";
import { WorkerPool } from "../workers/worker-pool.js";
import { backendsForTier } from "../models/swarm-backends.js";
import { PatchManager } from "../patches/patch-manager.js";
import { NpmRunner } from "../runners/npm-runner.js";
import { TraceWriter } from "../traces/trace-writer.js";
import { TaskQueue } from "./task-queue.js";
import { ExecutionLoop } from "./execution-loop.js";
import { topologicalSort } from "../utils/concurrency.js";
import { buildProjectContext, planToTasks } from "./run-session.js";
import { safeStringify } from "../utils/json.js";
import type { ModelClient } from "../models/model-client.js";
import type { ProjectPlan } from "../types/plan.js";
import type { AgentTask, CompilerError } from "../types/agent.js";
import type { UsageTracker } from "../tui/usage-tracker.js";

export interface ExecPlanOptions {
  plan: ProjectPlan;
  workspaceRoot: string;
  tracesRoot: string;
  concurrency: number;
  verify: boolean;
  /** Worker tier to run: "bulk" (default) or "pro". */
  tier?: string;
  /** Inject a worker client (tests). Defaults to the configured swarm client. */
  swarmClient?: ModelClient;
  tracker?: UsageTracker;
}

export interface ExecVerifyResult {
  passed: boolean;
  errors: CompilerError[];
  commands: {
    command: string;
    exitCode: number;
    passed: boolean;
    stdout: string;
    stderr: string;
  }[];
}

export interface ExecTaskFailure {
  id: string;
  targetFiles: string[];
  error: string;
}

export interface ExecPlanResult {
  runId: string;
  traceDir: string;
  projectName: string;
  /** Names of the worker backends that ran (e.g. ["deepseek","mimo"]). */
  backends: string[];
  totalTasks: number;
  applied: string[];
  failed: ExecTaskFailure[];
  blocked: ExecTaskFailure[];
  verify: ExecVerifyResult | null;
}

const MAX_OUTPUT_CHARS = 4000;

/**
 * Runs a swarm against a plan supplied by an external orchestrator. No planner
 * or reviewer model is constructed here: the caller owns planning and fix
 * triage, so only the swarm workers ever touch a model. File locks, snapshots,
 * dependency ordering, and patch validation are inherited from ExecutionLoop,
 * so workers never overlap on a file or apply a half-written change.
 */
export async function execPlan(opts: ExecPlanOptions): Promise<ExecPlanResult> {
  const runId = TraceWriter.buildRunId();
  const traceDir = path.join(opts.tracesRoot, runId);
  const trace = new TraceWriter(traceDir);
  await trace.init();
  await trace.writeRequest(`exec-plan: ${opts.plan.projectName}`);
  await trace.writePlan(opts.plan);

  await fs.mkdir(opts.workspaceRoot, { recursive: true });

  const fm = new FileManager(opts.workspaceRoot);
  const contextSelector = new ContextSelector(fm, opts.workspaceRoot);
  const patchManager = new PatchManager(fm);

  // Build the worker(s). An injected client (tests) runs as a single backend;
  // otherwise the multi-backend pool fans out across every configured provider
  // at once, capped per-backend, with total width = sum of the per-backend caps.
  let worker: TaskWorker;
  let concurrency: number;
  let backendNames: string[];
  if (opts.swarmClient) {
    worker = new WorkerRunner(opts.swarmClient);
    concurrency = Math.max(1, opts.concurrency);
    backendNames = ["injected"];
  } else {
    const tier = opts.tier ?? "bulk";
    const backends = backendsForTier(tier);
    if (backends.length === 0) {
      throw new Error(
        `no worker backends configured for tier "${tier}". Set SWARM_BACKEND_n_* with TIER=${tier} (see .env.example).`,
      );
    }
    const pool = new WorkerPool(
      backends,
      opts.tracker ? { tracker: opts.tracker } : {},
    );
    worker = pool;
    concurrency = pool.totalConcurrency;
    backendNames = pool.backendNames;
  }

  const projectContext = buildProjectContext(opts.plan);
  const tasks = topologicalSort(planToTasks(opts.plan, projectContext));
  await trace.writeTasks(tasks);

  const queue = new TaskQueue(tasks);
  const loop = new ExecutionLoop(
    queue,
    contextSelector,
    worker,
    patchManager,
    trace,
    { concurrency },
  );
  await loop.runUntilDrained();
  queue.cascadeBlocked();

  const all = queue.all();
  const applied = [
    ...new Set(
      all.filter((t) => t.status === "applied").flatMap((t) => t.targetFiles),
    ),
  ];
  const failed = all.filter((t) => t.status === "failed").map(toFailure);
  const blocked = all.filter((t) => t.status === "blocked").map(toFailure);

  let verify: ExecVerifyResult | null = null;
  if (opts.verify) {
    verify = await runVerify(opts.workspaceRoot, trace);
  }

  const result: ExecPlanResult = {
    runId,
    traceDir,
    projectName: opts.plan.projectName,
    backends: backendNames,
    totalTasks: all.length,
    applied,
    failed,
    blocked,
    verify,
  };

  await fs.writeFile(
    path.join(traceDir, "result.json"),
    safeStringify(result),
    "utf8",
  );
  await trace.writeFinalReport(buildReport(result));

  return result;
}

function toFailure(t: AgentTask): ExecTaskFailure {
  return {
    id: t.id,
    targetFiles: t.targetFiles,
    error: t.failureReason ?? "unknown",
  };
}

async function runVerify(
  workspaceRoot: string,
  trace: TraceWriter,
): Promise<ExecVerifyResult> {
  const npm = new NpmRunner(workspaceRoot);
  const check = await npm.runChecks();
  for (const r of check.results) {
    await trace.writeCommandResult(sanitize(r.command), r);
  }
  return {
    passed: check.passed,
    errors: check.compilerErrors,
    commands: check.results.map((r) => ({
      command: r.command,
      exitCode: r.exitCode,
      passed: r.passed,
      stdout: truncate(r.stdout, MAX_OUTPUT_CHARS),
      stderr: truncate(r.stderr, MAX_OUTPUT_CHARS),
    })),
  };
}

function buildReport(result: ExecPlanResult): string {
  const lines = [
    `# exec-plan report — ${result.projectName}`,
    "",
    `Run id:        ${result.runId}`,
    `Backends:      ${result.backends.join(", ")}`,
    `Tasks:         ${result.totalTasks}`,
    `Applied files: ${result.applied.length}`,
    `Failed tasks:  ${result.failed.length}`,
    `Blocked tasks: ${result.blocked.length}`,
  ];
  if (result.verify) {
    lines.push(`Verify:        ${result.verify.passed ? "passed" : "failed"}`);
  }
  return lines.join("\n") + "\n";
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + "\n...[truncated]";
}

function sanitize(name: string): string {
  return name.replace(/[^a-z0-9]+/gi, "_").slice(0, 40);
}
