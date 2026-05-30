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
import { UsageTracker } from "../tui/usage-tracker.js";
import { MAX_OUTPUT_CHARS_DEFAULT } from "../workers/worker-roles.js";
import type { ModelClient } from "../models/model-client.js";
import type { ProjectPlan } from "../types/plan.js";
import type {
  AgentTask,
  CompilerError,
  ProjectContext,
} from "../types/agent.js";

export interface ExecPlanOptions {
  plan: ProjectPlan;
  workspaceRoot: string;
  tracesRoot: string;
  concurrency: number;
  verify: boolean;
  /** Worker tier to run: "bulk" (default) or "pro". */
  tier?: string;
  /** Automated fix-loop rounds on verify errors (default 2; 0 to disable). */
  maxFixRounds?: number;
  /** Inject a worker client (tests). Defaults to the configured swarm client. */
  swarmClient?: ModelClient;
  tracker?: UsageTracker;
}

export interface ExecUsage {
  calls: number;
  promptTokens: number;
  completionTokens: number;
  cacheHitTokens: number;
  costUsd: number;
  elapsedMs: number;
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
  /** Automated fix-loop rounds spent clearing verify errors. */
  fixRounds: number;
  usage: ExecUsage;
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

  const startedAt = Date.now();
  const tracker = opts.tracker ?? new UsageTracker();

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
    const pool = new WorkerPool(backends, { tracker });
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

  let verify: ExecVerifyResult | null = opts.verify
    ? await runVerify(opts.workspaceRoot, trace)
    : null;

  // Automated fix-loop: feed tsc errors back to fixer workers, each with every
  // applied file as read-only context, until the project is clean or rounds run
  // out. The workers fix their own files; no orchestrator model is involved.
  let fixRounds = 0;
  const maxFixRounds = opts.maxFixRounds ?? 2;
  while (verify && !verify.passed && fixRounds < maxFixRounds) {
    const fixTasks = buildFixTasks(
      verify,
      appliedFiles(queue),
      opts.plan,
      projectContext,
      fixRounds + 1,
    );
    if (fixTasks.length === 0) break;
    fixRounds += 1;
    for (const t of fixTasks) queue.add(t);
    await loop.runUntilDrained();
    queue.cascadeBlocked();
    verify = await runVerify(opts.workspaceRoot, trace);
  }

  const all = queue.all();
  const applied = appliedFiles(queue);
  const failed = all.filter((t) => t.status === "failed").map(toFailure);
  const blocked = all.filter((t) => t.status === "blocked").map(toFailure);

  const tot = tracker.totals();
  const usage: ExecUsage = {
    calls: tot.calls,
    promptTokens: tot.promptTokens,
    completionTokens: tot.completionTokens,
    cacheHitTokens: tot.cacheHitTokens,
    costUsd: Number(tot.cost.toFixed(4)),
    elapsedMs: Date.now() - startedAt,
  };

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
    fixRounds,
    usage,
  };

  await fs.writeFile(
    path.join(traceDir, "result.json"),
    safeStringify(result),
    "utf8",
  );
  await trace.writeFinalReport(buildReport(result));

  return result;
}

function appliedFiles(queue: TaskQueue): string[] {
  return [
    ...new Set(
      queue
        .all()
        .filter((t) => t.status === "applied")
        .flatMap((t) => t.targetFiles),
    ),
  ];
}

/**
 * Turns verify (tsc) errors into fixer tasks — one per applied file that has
 * errors, with every other applied file as read-only context so the worker
 * reads the real interfaces instead of guessing.
 */
function buildFixTasks(
  verify: ExecVerifyResult,
  applied: string[],
  plan: ProjectPlan,
  projectContext: ProjectContext,
  round: number,
): AgentTask[] {
  const byFile = new Map<string, CompilerError[]>();
  for (const e of verify.errors) {
    if (!e.filePath || !applied.includes(e.filePath)) continue;
    const arr = byFile.get(e.filePath);
    if (arr) arr.push(e);
    else byFile.set(e.filePath, [e]);
  }

  const tasks: AgentTask[] = [];
  for (const [file, errs] of byFile) {
    tasks.push({
      id: `fix-r${round}-${file}`,
      role: "fixer",
      title: `Fix ${file}`,
      goal:
        `Fix these TypeScript errors in ${file}. Do not change its public API ` +
        `or any other file; import the real names from the files in context.\n` +
        errs
          .map((e) => `- line ${e.line ?? "?"}: ${e.code ?? ""} ${e.message}`)
          .join("\n"),
      targetFiles: [file],
      fileContexts: [],
      constraints: plan.constraints,
      ...(plan.contract ? { contract: plan.contract } : {}),
      projectContext,
      dependencyFiles: applied.filter((p) => p !== file),
      limits: { maxFilesToEdit: 1, maxOutputChars: MAX_OUTPUT_CHARS_DEFAULT },
      dependencies: [],
      status: "pending",
      attempt: 0,
    });
  }
  return tasks;
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
  lines.push(`Fix rounds:    ${result.fixRounds}`);
  const u = result.usage;
  const hitRate =
    u.promptTokens > 0
      ? Math.round((u.cacheHitTokens / u.promptTokens) * 100)
      : 0;
  lines.push(
    `Usage:         ${u.calls} calls, ${u.promptTokens} in / ${u.completionTokens} out, ${hitRate}% cache, $${u.costUsd.toFixed(4)}, ${Math.round(u.elapsedMs / 1000)}s`,
  );
  return lines.join("\n") + "\n";
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + "\n...[truncated]";
}

function sanitize(name: string): string {
  return name.replace(/[^a-z0-9]+/gi, "_").slice(0, 40);
}
