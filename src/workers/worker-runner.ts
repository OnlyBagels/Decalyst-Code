import { extractJsonObject } from "../utils/json.js";
import { WorkerError, toMessage } from "../utils/errors.js";
import { agentResultSchema } from "../patches/schemas.js";
import {
  SHARED_WORKER_SYSTEM_PROMPT,
  getRoleInstruction,
} from "./worker-prompts.js";
import { getDefaultSwarmModel } from "../models/swarm-client.js";
import type { ModelClient } from "../models/model-client.js";
import type { AgentTask, AgentResult } from "../types/agent.js";
import { safeStringify } from "../utils/json.js";

const MAX_WORKER_RETRIES = 2;

export class WorkerRunner {
  constructor(private readonly client: ModelClient) {}

  async run(task: AgentTask): Promise<AgentResult> {
    const systemPrompt = buildSystemPrompt(task);
    const userPayload = buildUserPayload(task);

    let lastError: unknown;

    for (let attempt = 0; attempt <= MAX_WORKER_RETRIES; attempt++) {
      try {
        const raw = await this.client.completeJson({
          model: getDefaultSwarmModel(),
          agent: `swarm:${task.id}`,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPayload },
          ],
          temperature: 0.1,
          maxTokens: 24576,
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
          // Brief wait before retry (no sleep needed per spec — just retry)
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
  return [SHARED_WORKER_SYSTEM_PROMPT, "", getRoleInstruction(task.role)].join(
    "\n",
  );
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
