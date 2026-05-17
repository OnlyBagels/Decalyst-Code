import { extractJsonObject, safeStringify } from "../utils/json.js";
import { getDefaultSwarmModel } from "../models/swarm-client.js";
import { SWARM_WORKER_SYSTEM_PROMPT, getRoleInstruction } from "./system-prompts.js";
import type { ModelClient, ChatMessage } from "../models/model-client.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { ToolCtx } from "../tools/schemas.js";
import type { EventBus } from "../events/bus.js";
import type { AgentTask, AgentResult, FileEdit } from "../types/agent.js";

const DEFAULT_MAX_TURNS = 8;
const MAX_ENVELOPE_RETRIES = 2;

export interface WorkerAgentOpts {
  client: ModelClient;
  registry: ToolRegistry;
  bus: EventBus;
  workspaceRoot: string;
  maxTurns?: number;
}

interface Envelope {
  action: string;
  args: Record<string, unknown>;
}

export class WorkerAgent {
  private readonly client: ModelClient;
  private readonly registry: ToolRegistry;
  private readonly bus: EventBus;
  private readonly workspaceRoot: string;
  private readonly maxTurns: number;

  constructor(opts: WorkerAgentOpts) {
    this.client = opts.client;
    this.registry = opts.registry;
    this.bus = opts.bus;
    this.workspaceRoot = opts.workspaceRoot;
    this.maxTurns = opts.maxTurns ?? DEFAULT_MAX_TURNS;
  }

  async run(task: AgentTask, signal?: AbortSignal): Promise<AgentResult> {
    this.bus.emit({
      t: "worker_started",
      id: task.id,
      file: task.targetFiles[0] ?? "",
      role: task.role,
    });

    const appliedEdits: FileEdit[] = [];
    const messages: ChatMessage[] = [
      { role: "system", content: this.buildSystemPrompt(task) },
      { role: "user", content: this.buildUserPayload(task) },
    ];

    const ctrl = new AbortController();
    if (signal !== undefined) {
      if (signal.aborted) {
        ctrl.abort(signal.reason);
      } else {
        signal.addEventListener("abort", () => ctrl.abort(signal.reason), { once: true });
      }
    }
    const ctx: ToolCtx = {
      workspaceRoot: this.workspaceRoot,
      taskId: task.id,
      agent: "swarm",
      signal: ctrl.signal,
      emit: (_event) => {
        // ToolEvent is an internal registry event type; the worker bus
        // emits its own higher-level events directly via this.bus.emit.
      },
    };

    for (let turn = 0; turn < this.maxTurns; turn++) {
      if (ctrl.signal.aborted) {
        this.bus.emit({ t: "worker_finished", id: task.id, status: "blocked" });
        return {
          taskId: task.id,
          role: task.role,
          status: "cannot_complete",
          edits: appliedEdits,
          blockers: ["cancelled"],
        };
      }

      let envelope: Envelope | null;
      try {
        envelope = await this.fetchEnvelope(task.id, messages, ctrl.signal);
      } catch (err) {
        if (isAbortError(err)) {
          this.bus.emit({ t: "worker_finished", id: task.id, status: "blocked" });
          return {
            taskId: task.id,
            role: task.role,
            status: "cannot_complete",
            edits: appliedEdits,
            blockers: ["cancelled"],
          };
        }
        throw err;
      }

      if (envelope === null) {
        break;
      }

      const { action, args } = envelope;

      this.bus.emit({ t: "worker_tool_call", id: task.id, tool: action, args });

      if (action === "submit") {
        this.bus.emit({ t: "worker_finished", id: task.id, status: "submitted" });
        return {
          taskId: task.id,
          role: task.role,
          status: "success",
          edits: appliedEdits,
          blockers: [],
        };
      }

      if (action === "report_blocker") {
        const reason = typeof args["reason"] === "string" ? args["reason"] : "unknown blocker";
        const suggestedAction = typeof args["suggested_action"] === "string"
          ? args["suggested_action"]
          : undefined;
        const blockerMsg = suggestedAction ? `${reason} (suggested: ${suggestedAction})` : reason;

        this.bus.emit({ t: "worker_finished", id: task.id, status: "blocked" });
        return {
          taskId: task.id,
          role: task.role,
          status: "cannot_complete",
          edits: [],
          blockers: [blockerMsg],
        };
      }

      const result = await this.registry.invoke(action, args, ctx);

      this.bus.emit({ t: "worker_tool_result", id: task.id, tool: action, ok: result.ok });

      if (result.ok && (action === "edit_file" || action === "create_file")) {
        const path = typeof args["path"] === "string" ? args["path"] : "";
        if (action === "create_file") {
          const content = typeof args["content"] === "string" ? args["content"] : "";
          appliedEdits.push({ mode: "create", path, fullContent: content });
        } else {
          const newString = typeof args["new_string"] === "string" ? args["new_string"] : "";
          appliedEdits.push({ mode: "replace", path, fullContent: newString });
        }
      }

      const resultMessage = result.ok
        ? safeStringify({ ok: true, data: result.data })
        : safeStringify({ ok: false, error: result.error, code: result.code });

      messages.push({ role: "assistant", content: safeStringify(envelope) });
      messages.push({ role: "user", content: resultMessage });
    }

    this.bus.emit({ t: "worker_finished", id: task.id, status: "blocked" });
    return {
      taskId: task.id,
      role: task.role,
      status: "cannot_complete",
      edits: appliedEdits,
      blockers: ["max turns reached"],
    };
  }

  private async fetchEnvelope(
    taskId: string,
    messages: ChatMessage[],
    signal?: AbortSignal,
  ): Promise<Envelope | null> {
    let lastError = "";

    for (let attempt = 0; attempt <= MAX_ENVELOPE_RETRIES; attempt++) {
      const messagesToSend: ChatMessage[] =
        attempt === 0
          ? messages
          : [
              ...messages,
              {
                role: "user",
                content: `Your previous response was not valid JSON. Error: ${lastError}. Respond with exactly one JSON object: { "action": "<tool>", "args": { ... } }`,
              },
            ];

      let raw: string;
      try {
        raw = await this.client.completeJson({
          model: getDefaultSwarmModel(),
          agent: `swarm:${taskId}`,
          messages: messagesToSend,
          temperature: 0.1,
          maxTokens: 4000,
          signal,
        });
      } catch (err) {
        if (isAbortError(err)) throw err;
        lastError = err instanceof Error ? err.message : String(err);
        continue;
      }

      let parsed: unknown;
      try {
        parsed = extractJsonObject(raw);
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        continue;
      }

      if (!isEnvelope(parsed)) {
        lastError = `Expected { action: string, args: object }, got: ${safeStringify(parsed).slice(0, 100)}`;
        continue;
      }

      return parsed;
    }

    return null;
  }

  private buildSystemPrompt(task: AgentTask): string {
    return [SWARM_WORKER_SYSTEM_PROMPT, "", getRoleInstruction(task.role)].join("\n");
  }

  private buildUserPayload(task: AgentTask): string {
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
        ? { testFailures: task.testResults.flatMap((r) => r.failures).slice(0, 10) }
        : {}),
    };
    return safeStringify(payload, 2);
  }
}

function isEnvelope(val: unknown): val is Envelope {
  if (val === null || typeof val !== "object") return false;
  const obj = val as Record<string, unknown>;
  return typeof obj["action"] === "string" && typeof obj["args"] === "object" && obj["args"] !== null;
}

function isAbortError(err: unknown): boolean {
  if (err instanceof Error) {
    return err.name === "AbortError" || err.message.includes("aborted");
  }
  return false;
}
