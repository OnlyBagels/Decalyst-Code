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
import type { AgentTask, ProjectContext } from "../types/agent.js";
import type { ProjectPlan } from "../types/plan.js";
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
  const idForPath = (p: string) => p; // use path as task id

  return plan.files.map<AgentTask>((file) => ({
    id: idForPath(file.path),
    role: file.role,
    title: `Write ${file.path}`,
    goal: file.purpose,
    targetFiles: [file.path],
    fileContexts: [],
    constraints: plan.constraints,
    projectContext,
    limits: {
      maxFilesToEdit: MAX_FILES_PER_ROLE[file.role],
      maxOutputChars: MAX_OUTPUT_CHARS_DEFAULT,
    },
    dependencies: file.dependsOn ?? [],
    status: "pending",
    attempt: 0,
  }));
}
