import { extractJsonObject } from "../utils/json.js";
import { toMessage } from "../utils/errors.js";
import { z } from "zod";
import { ExecutionLoop } from "./execution-loop.js";
import { NpmRunner, type CheckOutcome } from "../runners/npm-runner.js";
import { TaskQueue } from "./task-queue.js";
import { TraceWriter } from "../traces/trace-writer.js";
import { getDefaultOrchestratorModel } from "../models/orchestrator-client.js";
import {
  MAX_FILES_PER_ROLE,
  MAX_OUTPUT_CHARS_DEFAULT,
} from "../workers/worker-roles.js";
import { workerRoleSchema } from "../patches/schemas.js";
import type { ModelClient } from "../models/model-client.js";
import type { AgentTask, ProjectContext } from "../types/agent.js";

const fixPlanSchema = z
  .object({
    fixes: z
      .array(
        z.object({
          id: z.string().min(1),
          targetFiles: z.array(z.string()).min(1).max(3),
          goal: z.string().min(1),
          role: workerRoleSchema.default("fixer"),
        }),
      )
      .max(8),
  })
  .strict();

const FIXER_SYSTEM_PROMPT = `You are reviewing failing TypeScript / test output for a project the
local TypeScript worker just generated. Group the failures into the SMALLEST
set of fix tasks possible (1–3 files each). Each task targets specific files
that need editing to clear specific errors.

Output ONE JSON object only:

{
  "fixes": [
    {
      "id": "string (e.g. fix-001)",
      "targetFiles": ["src/foo.ts", "src/bar.ts"],
      "goal": "string — what specifically to fix",
      "role": "fixer | refactor-worker"
    }
  ]
}

Rules:
- 1-3 files per fix.
- Maximum 8 fixes total.
- If errors cluster in one file, one fix is enough.
- Do not propose fixes that touch package.json unless a missing dependency is the problem.
- Do not invent files that don't exist.`;

export interface FixerLoopOptions {
  maxRounds: number;
  projectContext: ProjectContext;
}

export interface FixerLoopOutcome {
  passed: boolean;
  rounds: number;
  finalCheck: CheckOutcome | null;
}

export class FixerLoop {
  constructor(
    private readonly orchestrator: ModelClient,
    private readonly executionLoop: ExecutionLoop,
    private readonly queue: TaskQueue,
    private readonly npm: NpmRunner,
    private readonly trace: TraceWriter,
    private readonly opts: FixerLoopOptions,
  ) {}

  async run(): Promise<FixerLoopOutcome> {
    let lastCheck: CheckOutcome | null = null;

    for (let round = 1; round <= this.opts.maxRounds; round++) {
      const check = await this.npm.runChecks();
      lastCheck = check;
      for (const r of check.results) {
        await this.trace.writeCommandResult(
          `r${round}-${sanitizeName(r.command)}`,
          r,
        );
      }

      if (check.passed) {
        return { passed: true, rounds: round, finalCheck: check };
      }

      // Build summary for orchestrator
      const summary = buildErrorSummary(check);
      const fixTasks = await this.requestFixTasks(summary, round);

      if (fixTasks.length === 0) {
        // Orchestrator declined to fix — give up
        return { passed: false, rounds: round, finalCheck: check };
      }

      for (const t of fixTasks) this.queue.add(t);

      await this.executionLoop.runUntilDrained();
    }

    return {
      passed: false,
      rounds: this.opts.maxRounds,
      finalCheck: lastCheck,
    };
  }

  private async requestFixTasks(
    summary: string,
    round: number,
  ): Promise<AgentTask[]> {
    let raw: string;
    try {
      raw = await this.orchestrator.completeText({
        model: getDefaultOrchestratorModel(),
        messages: [
          { role: "system", content: FIXER_SYSTEM_PROMPT },
          { role: "user", content: summary },
        ],
        temperature: 0.2,
        maxTokens: 4000,
      });
    } catch (err) {
      console.error(`[fixer] orchestrator request failed: ${toMessage(err)}`);
      return [];
    }

    let extracted: unknown;
    try {
      extracted = extractJsonObject(raw);
    } catch {
      return [];
    }

    const parsed = fixPlanSchema.safeParse(extracted);
    if (!parsed.success) return [];

    return parsed.data.fixes.map<AgentTask>((f, idx) => ({
      id: `${f.id || `fix-r${round}-${idx + 1}`}`,
      role: f.role,
      title: `Fix: ${f.goal}`,
      goal: f.goal,
      targetFiles: f.targetFiles,
      fileContexts: [],
      constraints: [
        "Make the smallest safe change",
        "Do not introduce new dependencies",
      ],
      projectContext: this.opts.projectContext,
      limits: {
        maxFilesToEdit: MAX_FILES_PER_ROLE[f.role],
        maxOutputChars: MAX_OUTPUT_CHARS_DEFAULT,
      },
      dependencies: [],
      status: "pending",
      attempt: 0,
    }));
  }
}

function buildErrorSummary(check: CheckOutcome): string {
  const lines: string[] = [];

  for (const r of check.results) {
    if (r.passed) continue;
    lines.push(`# ${r.command} (exit ${r.exitCode})`);
    if (r.stderr) lines.push(`stderr:\n${truncate(r.stderr, 2000)}`);
    if (r.stdout) lines.push(`stdout:\n${truncate(r.stdout, 2000)}`);
    lines.push("");
  }

  if (check.compilerErrors.length > 0) {
    lines.push("## Parsed TypeScript errors");
    for (const e of check.compilerErrors.slice(0, 25)) {
      lines.push(
        `  ${e.filePath ?? "?"}:${e.line ?? "?"} ${e.code ?? ""} ${e.message}`,
      );
    }
  }

  return lines.join("\n");
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + "\n...[truncated]";
}

function sanitizeName(name: string): string {
  return name.replace(/[^a-z0-9]+/gi, "_").slice(0, 40);
}
