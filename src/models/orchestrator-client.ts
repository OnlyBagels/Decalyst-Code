import OpenAI from "openai";
import { OrchestratorError } from "../utils/errors.js";
import type {
  ModelClient,
  ChatMessage,
  CompleteWithToolsArgs,
  CompleteWithToolsResult,
  AssistantMessage,
  ToolCallRequest,
} from "./model-client.js";
import type { UsageTracker } from "../tui/usage-tracker.js";

export function createOrchestratorClient(tracker?: UsageTracker): ModelClient {
  const apiKey = process.env["ORCHESTRATOR_API_KEY"];
  const baseURL =
    process.env["ORCHESTRATOR_BASE_URL"] ?? "https://openrouter.ai/api/v1";
  const defaultModel =
    process.env["ORCHESTRATOR_MODEL"] ?? "anthropic/claude-sonnet-4.6";

  if (!apiKey) {
    throw new OrchestratorError(
      "ORCHESTRATOR_API_KEY is not set. Copy .env.example to .env and add your API key.",
    );
  }

  const client = new OpenAI({
    apiKey,
    baseURL,
    defaultHeaders: {
      "HTTP-Referer": "https://github.com/decalyst-swarm",
      "X-Title": "decalyst-swarm",
    },
  });

  async function complete(
    messages: ChatMessage[],
    temperature: number,
    maxTokens: number,
    model: string,
    agent: string | undefined,
  ): Promise<string> {
    const res = await client.chat.completions.create({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    });

    if (tracker && res.usage) {
      tracker.record({
        agent: agent ?? "orchestrator",
        model,
        promptTokens: res.usage.prompt_tokens ?? 0,
        completionTokens: res.usage.completion_tokens ?? 0,
      });
    }

    const content = res.choices[0]?.message?.content;
    if (!content) {
      throw new OrchestratorError("Orchestrator returned empty response");
    }
    return content;
  }

  async function completeWithTools(
    args: CompleteWithToolsArgs,
  ): Promise<CompleteWithToolsResult> {
    const model = args.model ?? defaultModel;
    const openaiTools = args.tools.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));

    const res = await client.chat.completions.create({
      model,
      messages: args.messages as Parameters<typeof client.chat.completions.create>[0]["messages"],
      tools: openaiTools,
      tool_choice: args.toolChoice ?? "auto",
      temperature: args.temperature,
      max_tokens: args.maxTokens,
    });

    if (tracker && res.usage) {
      tracker.record({
        agent: args.agent ?? "orchestrator",
        model,
        promptTokens: res.usage.prompt_tokens ?? 0,
        completionTokens: res.usage.completion_tokens ?? 0,
      });
    }

    const choice = res.choices[0];
    if (!choice) {
      throw new OrchestratorError("Orchestrator returned no choices");
    }

    const msg = choice.message;
    const toolCalls: ToolCallRequest[] | undefined = msg.tool_calls?.map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      args: (() => {
        try {
          return JSON.parse(tc.function.arguments) as unknown;
        } catch {
          return tc.function.arguments;
        }
      })(),
    }));

    const assistantMessage: AssistantMessage = {
      role: "assistant",
      content: msg.content ?? null,
      ...(toolCalls && toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
    };

    const finishReason = (choice.finish_reason ?? "stop") as CompleteWithToolsResult["finishReason"];

    return { message: assistantMessage, finishReason };
  }

  return {
    async completeJson({ model, messages, temperature, maxTokens, agent }) {
      return complete(messages, temperature, maxTokens, model ?? defaultModel, agent);
    },
    async completeText({ model, messages, temperature, maxTokens, agent }) {
      return complete(messages, temperature, maxTokens, model ?? defaultModel, agent);
    },
    completeWithTools,
  };
}

export function getDefaultOrchestratorModel(): string {
  return process.env["ORCHESTRATOR_MODEL"] ?? "anthropic/claude-sonnet-4.6";
}
