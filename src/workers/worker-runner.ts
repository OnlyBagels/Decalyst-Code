import { extractJsonObject } from "../utils/json.js";
import { WorkerError, toMessage } from "../utils/errors.js";
import { agentResultSchema } from "../patches/schemas.js";
import {
  SHARED_WORKER_SYSTEM_PROMPT,
  getRoleInstruction,
} from "./worker-prompts.js";
import { getDefaultSwarmModel } from "../models/swarm-client.js";
import type { ModelClient, ChatMessage } from "../models/model-client.js";
import type { AgentTask, AgentResult } from "../types/agent.js";
import { safeStringify } from "../utils/json.js";

const MAX_WORKER_RETRIES = 2;

// DeepSeek V4 / MiMo V2.5 support very large outputs (up to 384K). 64k lets a
// worker write a multi-file unit in one shot without truncating mid-file.
const MAX_OUTPUT_TOKENS =
  Number.parseInt(process.env["SWARM_MAX_OUTPUT_TOKENS"] ?? "", 10) || 64_000;

/** Anything that can turn a task into an applied-edit result. */
export interface TaskWorker {
  run(task: AgentTask): Promise<AgentResult>;
}

export class WorkerRunner implements TaskWorker {
  constructor(
    private readonly client: ModelClient,
    private readonly model?: string,
  ) {}

  async run(task: AgentTask): Promise<AgentResult> {
    // System + contract come first and are identical across the run, so the
    // provider caches that prefix; the per-task payload follows.
    const messages: ChatMessage[] = [
      { role: "system", content: buildSystemPrompt(task) },
      { role: "user", content: buildUserPayload(task) },
    ];

    let lastError: unknown;

    for (let attempt = 0; attempt <= MAX_WORKER_RETRIES; attempt++) {
      let raw = "";
      try {
        raw = await this.client.completeJson({
          model: this.model ?? getDefaultSwarmModel(),
          agent: `swarm:${task.id}`,
          messages,
          temperature: 0.1,
          maxTokens: MAX_OUTPUT_TOKENS,
        });

        const extracted = extractJsonObject(raw);
        const parsed = agentResultSchema.safeParse(extracted);

        if (!parsed.success) {
          const issues = parsed.error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; ");
          throw new WorkerError(`Schema validation failed: ${issues}`, task.id);
        }

        return parsed.data as AgentResult;
      } catch (err) {
        lastError = err;
        if (attempt < MAX_WORKER_RETRIES) {
          // Corrective retry: show the model what it returned and what was wrong
          // so it fixes the JSON, instead of blindly resampling the same prompt.
          if (raw) messages.push({ role: "assistant", content: raw.slice(0, 4000) });
          messages.push({
            role: "user",
            content: `That response was not accepted: ${toMessage(err)}. Reply again with ONLY the corrected JSON object matching the schema — no prose, no code fences, and escape all newlines and quotes inside string values.`,
          });
          continue;
        }
      }
    }

    throw new WorkerError(
      `Worker failed after ${MAX_WORKER_RETRIES + 1} attempts: ${toMessage(lastError)}`,
      task.id,
    );
  }
}

function buildSystemPrompt(task: AgentTask): string {
  const parts = [SHARED_WORKER_SYSTEM_PROMPT, ""];
  if (task.contract) {
    parts.push(
      `SHARED CONTRACT — import these exact names, never redefine them:\n${task.contract}`,
      "",
    );
  }
  parts.push(getRoleInstruction(task.role));
  return parts.join("\n");
}

function buildUserPayload(task: AgentTask): string {
  const payload = {
    taskId: task.id,
    role: task.role,
    title: task.title,
    goal: task.goal,
    targetFiles: task.targetFiles,
    constraints: task.constraints,
    projectContext: task.projectContext,
    limits: task.limits,
    fileContexts: task.fileContexts.map((fc) => ({
      path: fc.path,
      language: fc.language,
      reason: fc.reason,
      content: fc.content,
    })),
    ...(task.compilerErrors && task.compilerErrors.length > 0
      ? { compilerErrors: task.compilerErrors.slice(0, 10) }
      : {}),
    ...(task.testResults && task.testResults.length > 0
      ? {
          testFailures: task.testResults
            .flatMap((r) => r.failures)
            .slice(0, 10),
        }
      : {}),
  };

  return safeStringify(payload, 2);
}
