import { describe, it, expect, vi } from "vitest";
import { ConversationSummarizer } from "../../../src/services/compress/conversation-summarizer.js";
import type { ModelClient, ModelCallArgs, ChatMessage } from "../../../src/models/model-client.js";

function makeMockClient(response: string): { client: ModelClient; calls: ModelCallArgs[] } {
  const calls: ModelCallArgs[] = [];
  const client: ModelClient = {
    async completeText(args: ModelCallArgs): Promise<string> {
      calls.push(args);
      return response;
    },
    async completeJson(args: ModelCallArgs): Promise<string> {
      return args.messages[0]?.content ?? "";
    },
    async completeWithTools() {
      throw new Error("not used");
    },
  };
  return { client, calls };
}

describe("ConversationSummarizer", () => {
  it("passes correct system prompt and user content", async () => {
    const { client, calls } = makeMockClient("Summary text here.");
    const summarizer = new ConversationSummarizer({ client, model: "test-model" });

    const messages: ChatMessage[] = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there" },
    ];

    await summarizer.summarize(messages);

    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.model).toBe("test-model");
    expect(call.temperature).toBe(0.2);
    expect(call.maxTokens).toBe(8192);
    expect(call.agent).toBe("summarizer");

    const systemMsg = call.messages.find((m) => m.role === "system");
    expect(systemMsg?.content).toContain("conversation summarizer");
    expect(systemMsg?.content).toContain("3-6 sentences");

    const userMsg = call.messages.find((m) => m.role === "user");
    expect(userMsg?.content).toContain("user: Hello");
    expect(userMsg?.content).toContain("assistant: Hi there");
  });

  it("returns the model's text response", async () => {
    const expected = "The user asked about X. The agent replied with Y.";
    const { client } = makeMockClient(expected);
    const summarizer = new ConversationSummarizer({ client });

    const messages: ChatMessage[] = [
      { role: "user", content: "What is X?" },
      { role: "assistant", content: "X is Y." },
    ];

    const result = await summarizer.summarize(messages);
    expect(result).toBe(expected);
  });

  it("re-throws client errors", async () => {
    const client: ModelClient = {
      async completeText(): Promise<string> {
        throw new Error("network failure");
      },
      async completeJson(): Promise<string> {
        return "";
      },
      async completeWithTools() {
        throw new Error("not used");
      },
    };

    const summarizer = new ConversationSummarizer({ client });
    const messages: ChatMessage[] = [{ role: "user", content: "Hello" }];

    await expect(summarizer.summarize(messages)).rejects.toThrow("network failure");
  });
});
