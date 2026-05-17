import { ORCHESTRATOR_SYSTEM_PROMPT } from "./system-prompts.js";
import { toolDefToToolSpec } from "./tool-spec-builder.js";
import { BudgetExceededError } from "../modes/errors.js";
import type { ModelClient, AssistantMessage, ToolResultMessage, ChatMessage } from "../models/model-client.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { ModeController } from "../modes/mode-controller.js";
import type { EventBus } from "../events/bus.js";
import type { ToolCtx } from "../tools/schemas.js";

const DEFAULT_MAX_TURNS = 40;

const NUDGE_MESSAGE =
  "You must call a tool. Respond with a tool call, not prose.";

export interface OrchestratorAgentOpts {
  client: ModelClient;
  registry: ToolRegistry;
  modeController: ModeController;
  bus: EventBus;
  workspaceRoot: string;
  maxTurnsPerMode?: number;
}

export interface OrchestratorResult {
  passed: boolean;
  report: string;
}

export class OrchestratorAgent {
  private readonly client: ModelClient;
  private readonly registry: ToolRegistry;
  private readonly modeController: ModeController;
  private readonly bus: EventBus;
  private readonly workspaceRoot: string;
  private readonly maxTurns: number;

  constructor(opts: OrchestratorAgentOpts) {
    this.client = opts.client;
    this.registry = opts.registry;
    this.modeController = opts.modeController;
    this.bus = opts.bus;
    this.workspaceRoot = opts.workspaceRoot;
    this.maxTurns = opts.maxTurnsPerMode ?? DEFAULT_MAX_TURNS;
  }

  async run(userRequest: string): Promise<OrchestratorResult> {
    await this.modeController.transition("plan");

    const ctrl = new AbortController();
    const ctx: ToolCtx = {
      workspaceRoot: this.workspaceRoot,
      taskId: "orchestrator",
      agent: "orchestrator",
      signal: ctrl.signal,
      emit: () => undefined,
    };

    const systemPrompt = ORCHESTRATOR_SYSTEM_PROMPT.replace(
      "{MODE}",
      this.modeController.current,
    );

    const messages: Array<ChatMessage | AssistantMessage | ToolResultMessage> = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userRequest },
    ];

    for (let turn = 0; turn < this.maxTurns; turn++) {
      const tools = this.registry
        .listForAgent("orchestrator")
        .map(toolDefToToolSpec);

      let result: Awaited<ReturnType<ModelClient["completeWithTools"]>>;
      try {
        result = await this.client.completeWithTools({
          model: "",
          messages,
          tools,
          temperature: 0.2,
          maxTokens: 4096,
          agent: "orchestrator",
          toolChoice: "required",
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { passed: false, report: `Model call failed: ${msg}` };
      }

      const { message, finishReason } = result;

      if (finishReason === "stop" || !message.tool_calls || message.tool_calls.length === 0) {
        messages.push(message);
        messages.push({ role: "user", content: NUDGE_MESSAGE });
        continue;
      }

      messages.push(message);

      let terminalResult: OrchestratorResult | undefined;

      for (const toolCall of message.tool_calls) {
        const { id, name, args } = toolCall;

        this.bus.emit({
          t: "tool_call_started",
          toolName: name,
          agent: "orchestrator",
          args,
        });

        const startedAt = Date.now();

        if (name === "finalize") {
          const report = extractStringField(args, "report") ?? "Run complete.";
          this.bus.emit({
            t: "tool_call_finished",
            toolName: name,
            agent: "orchestrator",
            ok: true,
            durationMs: Date.now() - startedAt,
          });
          terminalResult = { passed: true, report };
          messages.push({
            role: "tool",
            tool_call_id: id,
            content: JSON.stringify({ ok: true }),
          });
          break;
        }

        if (name === "bail") {
          const reason = extractStringField(args, "reason") ?? "Bailed.";
          this.bus.emit({
            t: "tool_call_finished",
            toolName: name,
            agent: "orchestrator",
            ok: false,
            durationMs: Date.now() - startedAt,
          });
          terminalResult = { passed: false, report: reason };
          messages.push({
            role: "tool",
            tool_call_id: id,
            content: JSON.stringify({ ok: false, reason }),
          });
          break;
        }

        if (name === "ask_user") {
          const question = extractStringField(args, "question") ?? "Question?";
          const options = extractStringArray(args, "options");

          const answer = await new Promise<string>((resolve) => {
            this.bus.emit({ t: "ask_user", question, options, resolve });
          });

          this.bus.emit({
            t: "tool_call_finished",
            toolName: name,
            agent: "orchestrator",
            ok: true,
            durationMs: Date.now() - startedAt,
          });

          messages.push({
            role: "tool",
            tool_call_id: id,
            content: answer,
          });
          continue;
        }

        let toolResultContent: string;
        try {
          this.modeController.recordToolCall(name);
          const toolResult = await this.registry.invoke(name, args, ctx);
          toolResultContent = JSON.stringify(toolResult);
          this.bus.emit({
            t: "tool_call_finished",
            toolName: name,
            agent: "orchestrator",
            ok: toolResult.ok,
            durationMs: Date.now() - startedAt,
          });
        } catch (err) {
          const isBudget = err instanceof BudgetExceededError;
          const msg = err instanceof Error ? err.message : String(err);
          this.bus.emit({
            t: "tool_call_finished",
            toolName: name,
            agent: "orchestrator",
            ok: false,
            durationMs: Date.now() - startedAt,
          });
          if (isBudget) {
            return { passed: false, report: `Budget exceeded: ${msg}` };
          }
          toolResultContent = JSON.stringify({ ok: false, error: msg });
        }

        messages.push({
          role: "tool",
          tool_call_id: id,
          content: toolResultContent,
        });
      }

      if (terminalResult !== undefined) {
        return terminalResult;
      }

      if (this.modeController.isWallClockExpired()) {
        return { passed: false, report: "Wall-clock budget exceeded." };
      }
    }

    return { passed: false, report: "Turn limit reached without terminal tool call." };
  }
}

function extractStringField(args: unknown, field: string): string | undefined {
  if (args !== null && typeof args === "object") {
    const val = (args as Record<string, unknown>)[field];
    if (typeof val === "string") return val;
  }
  return undefined;
}

function extractStringArray(args: unknown, field: string): string[] | undefined {
  if (args !== null && typeof args === "object") {
    const val = (args as Record<string, unknown>)[field];
    if (Array.isArray(val)) {
      return val.filter((v): v is string => typeof v === "string");
    }
  }
  return undefined;
}
