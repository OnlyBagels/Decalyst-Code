import * as path from "node:path";
import * as fs from "node:fs/promises";
import { Planner } from "./planner.js";
import { TaskQueue } from "./task-queue.js";
import { ExecutionLoop } from "./execution-loop.js";
import { FixerLoop } from "./fixer-loop.js";
import { FinalReview } from "./final-review.js";
import { ContextSelector } from "../context/context-selector.js";
import { WorkerRunner } from "../workers/worker-runner.js";
import { PatchManager } from "../patches/patch-manager.js";
import { FileManager } from "../files/file-manager.js";
import { NpmRunner } from "../runners/npm-runner.js";
import { TraceWriter } from "../traces/trace-writer.js";
import { createOrchestratorClient } from "../models/orchestrator-client.js";
import { createSwarmClient } from "../models/swarm-client.js";
import { topologicalSort } from "../utils/concurrency.js";
import {
  MAX_FILES_PER_ROLE,
  MAX_OUTPUT_CHARS_DEFAULT,
} from "../workers/worker-roles.js";
import type { AgentTask, ProjectContext, WorkerRole } from "../types/agent.js";
import type { ProjectPlan, PlannedFile } from "../types/plan.js";
import type { RunSummary } from "../types/results.js";
import type { UsageTracker } from "../tui/usage-tracker.js";

export interface RunSessionOptions {
  userRequest: string;
  workspaceRoot: string;
  tracesRoot: string;
  concurrency: number;
  maxFixRounds: number;
  tracker?: UsageTracker;
  abortSignal?: AbortSignal;
}

export class RunSession {
  constructor(private readonly opts: RunSessionOptions) {}

  async run(): Promise<RunSummary> {
    const runId = TraceWriter.buildRunId();
    const traceDir = path.join(this.opts.tracesRoot, runId);
    const trace = new TraceWriter(traceDir);
    await trace.init();
    await trace.writeRequest(this.opts.userRequest);

    await fs.mkdir(this.opts.workspaceRoot, { recursive: true });

    const tracker = this.opts.tracker;
    const orchestrator = createOrchestratorClient(tracker);
    const swarm = createSwarmClient(tracker);

    const signal = this.opts.abortSignal;

    const fm = new FileManager(this.opts.workspaceRoot);
    const contextSelector = new ContextSelector(fm, this.opts.workspaceRoot);
    const workerRunner = new WorkerRunner(swarm);
    const patchManager = new PatchManager(fm);
    const npm = new NpmRunner(this.opts.workspaceRoot);

    const startedAt = new Date().toISOString();

    try {
      // 1. Plan
      tracker?.setPhase("planner");
      const planner = new Planner(orchestrator);
      const plan = await planner.createPlan(this.opts.userRequest, signal);
      await trace.writePlan(plan);

      // 2. Convert plan into tasks
      const projectContext = buildProjectContext(plan);
      const initialTasks = planToTasks(plan, projectContext);
      const ordered = topologicalSort(initialTasks);
      await trace.writeTasks(ordered);

      const queue = new TaskQueue(ordered);

      // 3. Execute initial tasks
      tracker?.setPhase("swarm");
      const executionLoop = new ExecutionLoop(
        queue,
        contextSelector,
        workerRunner,
        patchManager,
        trace,
        { concurrency: this.opts.concurrency },
      );
      await executionLoop.runUntilDrained();

      // 4. Fix loop on compiler/test failures
      tracker?.setPhase("fixer");
      const fixerLoop = new FixerLoop(
        orchestrator,
        executionLoop,
        queue,
        npm,
        trace,
        {
          maxRounds: this.opts.maxFixRounds,
          projectContext,
        },
      );
      const outcome = await fixerLoop.run();

      // 5. Final report
      tracker?.setPhase("reviewer");
      const review = new FinalReview(orchestrator);
      const report = await review.write({
        userRequest: this.opts.userRequest,
        finalCheck: outcome.finalCheck,
        passed: outcome.passed,
        fixRoundsUsed: outcome.rounds,
        queue,
      });
      await trace.writeFinalReport(report);

      const finishedAt = new Date().toISOString();
      const stats = queue.stats();
      const applied = queue.all().filter((t) => t.status === "applied");
      const created = applied.flatMap((t) => t.targetFiles);

      return {
        runId,
        userRequest: this.opts.userRequest,
        workspaceRoot: this.opts.workspaceRoot,
        startedAt,
        finishedAt,
        passed: outcome.passed,
        filesCreated: [...new Set(created)],
        filesModified: [],
        totalTasks: queue.all().length,
        appliedTasks: stats.applied,
        failedTasks: stats.failed + stats.blocked,
        fixRoundsUsed: outcome.rounds,
        finalReport: report,
      };
    } catch (err) {
      if (isAbortError(err)) {
        const finishedAt = new Date().toISOString();
        const cancelledReport = "cancelled";
        try {
          await trace.writeFinalReport(cancelledReport);
        } catch {
          // best-effort
        }
        return {
          runId,
          userRequest: this.opts.userRequest,
          workspaceRoot: this.opts.workspaceRoot,
          startedAt,
          finishedAt,
          passed: false,
          filesCreated: [],
          filesModified: [],
          totalTasks: 0,
          appliedTasks: 0,
          failedTasks: 0,
          fixRoundsUsed: 0,
          finalReport: cancelledReport,
        };
      }
      throw err;
    }
  }
}

function isAbortError(err: unknown): boolean {
  if (err instanceof Error) {
    return err.name === "AbortError" || err.message.includes("aborted");
  }
  return false;
}

export function buildProjectContext(plan: ProjectPlan): ProjectContext {
  const ctx: ProjectContext = {};
  if (plan.projectKind !== undefined) ctx.projectKind = plan.projectKind;
  if (plan.framework !== undefined) ctx.framework = plan.framework;
  if (plan.packageManager !== undefined)
    ctx.packageManager = plan.packageManager;
  return ctx;
}

export function planToTasks(
  plan: ProjectPlan,
  projectContext: ProjectContext,
): AgentTask[] {
  // A file's group key is its `group` (coupled unit) or its own path (singleton).
  const groupOf = (f: PlannedFile): string => f.group ?? f.path;
  const pathToGroup = new Map<string, string>();
  for (const f of plan.files) pathToGroup.set(f.path, groupOf(f));

  // Collect files per group in plan order.
  const groups = new Map<string, PlannedFile[]>();
  for (const f of plan.files) {
    const g = groupOf(f);
    const arr = groups.get(g);
    if (arr) arr.push(f);
    else groups.set(g, [f]);
  }

  // The contract is broadcast to every worker as a high-priority constraint.
  const contractConstraint = plan.contract
    ? [`SHARED CONTRACT — import these exact names, never redefine them:\n${plan.contract}`]
    : [];

  const tasks: AgentTask[] = [];
  for (const [groupId, files] of groups) {
    const multi = files.length > 1;
    // A coupled unit is written by one general worker so the seams agree.
    const role: WorkerRole = multi ? "scaffold-writer" : files[0]!.role;
    const targetFiles = files.map((f) => f.path);

    // Remap each file's deps to the GROUP that owns them; drop self-deps.
    const deps = new Set<string>();
    for (const f of files) {
      for (const d of f.dependsOn ?? []) {
        const dg = pathToGroup.get(d) ?? d;
        if (dg !== groupId) deps.add(dg);
      }
    }

    const goal = multi
      ? `Write these files as one coherent unit (consistent types and import/export names across all of them):\n${files
          .map((f) => `- ${f.path}: ${f.purpose}`)
          .join("\n")}`
      : files[0]!.purpose;

    // The concrete files of every dependency group, plus any plan-level
    // contextFiles (existing files to read but not rewrite). The worker reads
    // the real interfaces it imports instead of guessing. Exclude this task's
    // own targets.
    const targetSet = new Set(targetFiles);
    const dependencyFiles = [
      ...new Set([
        ...[...deps].flatMap((dg) => groups.get(dg)?.map((f) => f.path) ?? []),
        ...(plan.contextFiles ?? []),
      ]),
    ].filter((p) => !targetSet.has(p));

    tasks.push({
      id: groupId,
      role,
      title: multi ? `Write ${groupId} (${files.length} files)` : `Write ${targetFiles[0]}`,
      goal,
      targetFiles,
      fileContexts: [],
      constraints: [...contractConstraint, ...plan.constraints],
      projectContext,
      limits: {
        maxFilesToEdit: Math.min(8, Math.max(files.length, MAX_FILES_PER_ROLE[role])),
        maxOutputChars: MAX_OUTPUT_CHARS_DEFAULT,
      },
      dependencies: [...deps],
      dependencyFiles,
      status: "pending",
      attempt: 0,
    });
  }
  return tasks;
}
