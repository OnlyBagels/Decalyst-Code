import OpenAI from "openai";
import { OrchestratorError } from "../utils/errors.js";
import type { ModelClient, ChatMessage } from "./model-client.js";

export function createOrchestratorClient(): ModelClient {
  const apiKey = process.env["ORCHESTRATOR_API_KEY"];
  const baseURL =
    process.env["ORCHESTRATOR_BASE_URL"] ?? "https://openrouter.ai/api/v1";
  const defaultModel =
    process.env["ORCHESTRATOR_MODEL"] ?? "anthropic/claude-sonnet-4.6";

  if (!apiKey) {
    throw new OrchestratorError(
      "ORCHESTRATOR_API_KEY is not set. Copy .env.example to .env and add your OpenRouter key (sk-or-v1-...).",
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
  ): Promise<string> {
    const res = await client.chat.completions.create({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    });

    const content = res.choices[0]?.message?.content;
    if (!content) {
      throw new OrchestratorError("Orchestrator returned empty response");
    }
    return content;
  }

  return {
    async completeJson({ model, messages, temperature, maxTokens }) {
      return complete(messages, temperature, maxTokens, model ?? defaultModel);
    },
    async completeText({ model, messages, temperature, maxTokens }) {
      return complete(messages, temperature, maxTokens, model ?? defaultModel);
    },
  };
}

export function getDefaultOrchestratorModel(): string {
  return process.env["ORCHESTRATOR_MODEL"] ?? "anthropic/claude-sonnet-4.6";
}
