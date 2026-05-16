import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { createOrchestratorClient } from "../models/orchestrator-client.js";
import { createSwarmClient } from "../models/swarm-client.js";
import { FileManager } from "../files/file-manager.js";
import { ContextSelector } from "../context/context-selector.js";
import { WorkerRunner } from "../workers/worker-runner.js";
import { PatchManager } from "../patches/patch-manager.js";
import { Planner } from "../planner/planner.js";
import { Reviewer } from "../reviewer/reviewer.js";
import {
  getRepoSummary,
  formatRepoSummaryForPrompt,
} from "../context/repo-summary.js";
import { topologicalSort } from "../utils/concurrency.js";
import { toMessage } from "../utils/errors.js";
import {
  MAX_FILES_PER_ROLE,
  MAX_OUTPUT_CHARS_DEFAULT,
} from "../workers/worker-roles.js";
import type { AgentTask, ProjectContext, TaskStatus } from "../types/agent.js";
import type { ProjectPlan } from "../types/plan.js";
import type { RunSummary } from "../types/results.js";
import type { ReviewFix } from "../reviewer/reviewer.js";

export interface RunOptions {
  goal: string;
  workspaceRoot: string;
  model: string;
  concurrency: number;
  maxFixRounds: number;
  runsDir: string;
}

export async function run(opts: RunOptions): Promise<RunSummary> {
  const runId = randomUUID();
  const startedAt = new Date().toISOString();

  const fm = new FileManager(opts.workspaceRoot);
  const contextSelector = new ContextSelector(fm, opts.workspaceRoot);
  const orchestratorClient = createOrchestratorClient();
  const workerClient = createSwarmClient();
  const workerRunner = new WorkerRunner(workerClient);
  const patchManager = new PatchManager(fm);
  const planner = new Planner(orchestratorClient, opts.model);
  const reviewer = new Reviewer(orchestratorClient, opts.model);

  // ── Planner phase ──────────────────────────────────────────────────────────
  console.log("[planner] analyzing goal...");
  const repoSummary = await getRepoSummary(fm, opts.workspaceRoot);
  const workspaceSummary = formatRepoSummaryForPrompt(repoSummary);
  const plan = await planner.plan(opts.goal, workspaceSummary);
  console.log(`[planner] plan ready — ${plan.files.length} file(s) to write`);

  const initialTasks = planToTasks(plan);
  const sorted = topologicalSort(initialTasks);

  // ── Swarm phase ────────────────────────────────────────────────────────────
  const appliedPaths = new Set<string>();
  let appliedTasks = 0;
  let failedTasks = 0;
  let fixRoundsUsed = 0;

  console.log("[swarm] starting workers...");
  await runSwarm(sorted, opts.concurrency, async (task) => {
    console.log(`  [${task.role}] ${task.title}`);
    task.fileContexts = await contextSelector.select(task);
    task.status = "running";

    try {
      const result = await workerRunner.run(task);
      const patch = await patchManager.validateAndApply(task, result);

      if (patch.applied) {
        task.status = "applied";
        appliedTasks++;
        for (const e of patch.editsApplied) appliedPaths.add(e.path);
        console.log(`  [${task.role}] ✓ ${patch.editsApplied.length} edit(s)`);
      } else {
        task.status = "failed";
        failedTasks++;
        console.log(`  [${task.role}] ✗ ${patch.validationErrors.join(", ")}`);
      }
    } catch (err) {
      task.status = "failed";
      failedTasks++;
      console.log(`  [${task.role}] ✗ ${toMessage(err)}`);
    }
  });

  // ── Reviewer phase ─────────────────────────────────────────────────────────
  let finalReport = "";

  for (let round = 0; round < opts.maxFixRounds; round++) {
    console.log("\n[reviewer] reviewing output...");
    const changedFiles = await loadChangedFiles(fm, [...appliedPaths]);

    if (changedFiles.length === 0) {
      finalReport = "No files were written — swarm produced no output.";
      break;
    }

    const reviewResult = await reviewer.review(opts.goal, changedFiles);
    finalReport = reviewResult.summary;

    if (reviewResult.verdict === "approved") {
      console.log(`[reviewer] approved — ${reviewResult.summary}`);
      break;
    }

    console.log(`[reviewer] ${reviewResult.fixes.length} fix(es) requested`);
    fixRoundsUsed++;

    const fixTasks = reviewFixesToTasks(
      reviewResult.fixes,
      plan,
      initialTasks.length + round * 50,
    );

    await runSwarm(fixTasks, opts.concurrency, async (task) => {
      console.log(`  [fixer] ${task.title}`);
      task.fileContexts = await contextSelector.select(task);
      task.status = "running";

      try {
        const result = await workerRunner.run(task);
        const patch = await patchManager.validateAndApply(task, result);

        if (patch.applied) {
          task.status = "applied";
          appliedTasks++;
          for (const e of patch.editsApplied) appliedPaths.add(e.path);
        } else {
          task.status = "failed";
          failedTasks++;
          console.log(`  [fixer] ✗ ${patch.validationErrors.join(", ")}`);
        }
      } catch (err) {
        task.status = "failed";
        failedTasks++;
        console.log(`  [fixer] ✗ ${toMessage(err)}`);
      }
    });
  }

  // ── Write run summary ──────────────────────────────────────────────────────
  const finishedAt = new Date().toISOString();
  const summary: RunSummary = {
    runId,
    userRequest: opts.goal,
    workspaceRoot: opts.workspaceRoot,
    startedAt,
    finishedAt,
    passed: failedTasks === 0,
    filesCreated: [...appliedPaths],
    filesModified: [],
    totalTasks: initialTasks.length,
    appliedTasks,
    failedTasks,
    fixRoundsUsed,
    finalReport,
  };

  await fs.mkdir(opts.runsDir, { recursive: true });
  await fs.writeFile(
    path.join(opts.runsDir, `${runId}.json`),
    JSON.stringify(summary, null, 2),
    "utf8",
  );

  return summary;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function planToTasks(plan: ProjectPlan): AgentTask[] {
  const pathToId = new Map<string, string>();
  plan.files.forEach((file, i) => pathToId.set(file.path, `task-${i}`));

  const projectContext: ProjectContext = {
    packageManager: plan.packageManager,
    framework: plan.framework,
    testFramework: "vitest",
    validationLibrary: "zod",
    moduleSystem: "esm",
    strictTypeScript: true,
  };

  return plan.files.map((file, i) => ({
    id: `task-${i}`,
    role: file.role,
    title: `${file.role}: ${file.path}`,
    goal: file.purpose,
    targetFiles: [file.path],
    fileContexts: [],
    constraints: plan.constraints,
    projectContext,
    limits: {
      maxFilesToEdit: MAX_FILES_PER_ROLE[file.role],
      maxOutputChars: MAX_OUTPUT_CHARS_DEFAULT,
    },
    dependencies: (file.dependsOn ?? [])
      .map((dep) => pathToId.get(dep))
      .filter((id): id is string => id !== undefined),
    status: "pending" as TaskStatus,
    attempt: 0,
  }));
}

function reviewFixesToTasks(
  fixes: ReviewFix[],
  plan: ProjectPlan,
  idOffset: number,
): AgentTask[] {
  const projectContext: ProjectContext = {
    packageManager: plan.packageManager,
    framework: plan.framework,
    testFramework: "vitest",
    validationLibrary: "zod",
    moduleSystem: "esm",
    strictTypeScript: true,
  };

  return fixes.map((fix, i) => ({
    id: `fix-${idOffset + i}`,
    role: "fixer" as const,
    title: `fixer: ${fix.filePath}`,
    goal: `Fix the following issue in ${fix.filePath}: ${fix.issue}. Suggestion: ${fix.suggestion}`,
    targetFiles: [fix.filePath],
    fileContexts: [],
    constraints: plan.constraints,
    projectContext,
    limits: {
      maxFilesToEdit: MAX_FILES_PER_ROLE["fixer"],
      maxOutputChars: MAX_OUTPUT_CHARS_DEFAULT,
    },
    dependencies: [],
    status: "pending" as TaskStatus,
    attempt: 0,
  }));
}

async function loadChangedFiles(
  fm: FileManager,
  paths: string[],
): Promise<{ path: string; content: string }[]> {
  const results: { path: string; content: string }[] = [];
  for (const p of paths) {
    const content = await fm.read(p);
    if (content !== null) results.push({ path: p, content });
  }
  return results;
}

async function runSwarm(
  tasks: AgentTask[],
  concurrency: number,
  fn: (task: AgentTask) => Promise<void>,
): Promise<void> {
  const done = new Map<string, Promise<void>>();
  const slots = new Semaphore(concurrency);

  for (const task of tasks) {
    const p = (async () => {
      const depPromises = task.dependencies.map(
        (d) => done.get(d) ?? Promise.resolve(),
      );
      await Promise.all(depPromises);
      await slots.acquire();
      try {
        await fn(task);
      } finally {
        slots.release();
      }
    })();
    done.set(task.id, p);
  }

  await Promise.all(done.values());
}

class Semaphore {
  private readonly queue: Array<() => void> = [];
  private count: number;

  constructor(limit: number) {
    this.count = limit;
  }

  acquire(): Promise<void> {
    if (this.count > 0) {
      this.count--;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => this.queue.push(resolve));
  }

  release(): void {
    const next = this.queue.shift();
    if (next !== undefined) {
      next();
    } else {
      this.count++;
    }
  }
}
