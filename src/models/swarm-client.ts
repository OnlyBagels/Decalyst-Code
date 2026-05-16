import OpenAI from "openai";
import { WorkerError } from "../utils/errors.js";
import type { ModelClient, ChatMessage } from "./model-client.js";
import type { UsageTracker } from "../tui/usage-tracker.js";

export function createSwarmClient(tracker?: UsageTracker): ModelClient {
  const baseURL =
    process.env["SWARM_BASE_URL"] ??
    process.env["DECALYST_BASE_URL"] ??
    "http://localhost:1234/v1";
  const apiKey =
    process.env["SWARM_API_KEY"] ??
    process.env["DECALYST_API_KEY"] ??
    "EMPTY";
  const defaultModel =
    process.env["SWARM_MODEL"] ??
    process.env["DECALYST_MODEL"] ??
    "default";

  const client = new OpenAI({ apiKey, baseURL });

  async function complete(
    messages: ChatMessage[],
    temperature: number,
    maxTokens: number,
    model: string,
    jsonMode: boolean,
    agent: string | undefined,
  ): Promise<string> {
    const res = await client.chat.completions.create({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
    });

    if (tracker && res.usage) {
      tracker.record({
        agent: agent ?? "swarm",
        model,
        promptTokens: res.usage.prompt_tokens ?? 0,
        completionTokens: res.usage.completion_tokens ?? 0,
      });
    }

    const content = res.choices[0]?.message?.content;
    if (!content) {
      throw new WorkerError("Swarm worker returned empty response");
    }
    return content;
  }

  return {
    async completeJson({ model, messages, temperature, maxTokens, agent }) {
      return complete(
        messages,
        temperature,
        maxTokens,
        model ?? defaultModel,
        true,
        agent,
      );
    },
    async completeText({ model, messages, temperature, maxTokens, agent }) {
      return complete(
        messages,
        temperature,
        maxTokens,
        model ?? defaultModel,
        false,
        agent,
      );
    },
  };
}

export function getDefaultSwarmModel(): string {
  return (
    process.env["SWARM_MODEL"] ?? process.env["DECALYST_MODEL"] ?? "default"
  );
}
