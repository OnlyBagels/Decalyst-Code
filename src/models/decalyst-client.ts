import OpenAI from "openai";
import { WorkerError } from "../utils/errors.js";
import type { ModelClient, ChatMessage } from "./model-client.js";

export function createDecalystClient(): ModelClient {
  const baseURL =
    process.env["DECALYST_BASE_URL"] ?? "http://localhost:1234/v1";
  const apiKey = process.env["DECALYST_API_KEY"] ?? "EMPTY";
  const defaultModel = process.env["DECALYST_MODEL"] ?? "default";

  const client = new OpenAI({ apiKey, baseURL });

  async function complete(
    messages: ChatMessage[],
    temperature: number,
    maxTokens: number,
    model: string,
    jsonMode: boolean,
  ): Promise<string> {
    const res = await client.chat.completions.create({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
    });

    const content = res.choices[0]?.message?.content;
    if (!content) {
      throw new WorkerError("Decalyst worker returned empty response");
    }
    return content;
  }

  return {
    async completeJson({ model, messages, temperature, maxTokens }) {
      return complete(
        messages,
        temperature,
        maxTokens,
        model ?? defaultModel,
        true,
      );
    },
    async completeText({ model, messages, temperature, maxTokens }) {
      return complete(
        messages,
        temperature,
        maxTokens,
        model ?? defaultModel,
        false,
      );
    },
  };
}

export function getDefaultDecalystModel(): string {
  return process.env["DECALYST_MODEL"] ?? "default";
}
