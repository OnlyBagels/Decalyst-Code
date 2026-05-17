import { describe, it, expect } from "vitest";
import { HistoryCompactor } from "../../../src/services/compress/history-compactor.js";
import { ConversationSummarizer } from "../../../src/services/compress/conversation-summarizer.js";
import type { ModelClient, ChatMessage, ModelCallArgs } from "../../../src/models/model-client.js";

function makeSummarizerClient(response: string): ModelClient {
  return {
    async completeText(_args: ModelCallArgs): Promise<string> {
      return response;
    },
    async completeJson(_args: ModelCallArgs): Promise<string> {
      return "";
    },
    async completeWithTools() {
      throw new Error("not used");
    },
  };
}

function makeMessages(count: number, wordsEach = 50): ChatMessage[] {
  return Array.from({ length: count }, (_, i) => ({
    role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
    content: Array.from({ length: wordsEach }, (_, j) => `word${j}`).join(" "),
  }));
}

describe("HistoryCompactor", () => {
  it("returns unchanged messages when under token threshold", async () => {
    const compactor = new HistoryCompactor({});
    const messages: ChatMessage[] = [
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hello" },
    ];

    const result = await compactor.compact(messages, { targetTokens: 2000 });

    expect(result.wasCompacted).toBe(false);
    expect(result.messages).toBe(messages);
    expect(result.summaryUsed).toBeUndefined();
  });

  it("compacts with summarizer when over threshold", async () => {
    const client = makeSummarizerClient("The user discussed files A and B.");
    const summarizer = new ConversationSummarizer({ client });
    const compactor = new HistoryCompactor({ summarizer });

    // 20 messages of 50 words each — well above 2000 token default
    const messages = makeMessages(20, 50);

    const result = await compactor.compact(messages, { targetTokens: 100, keepRecent: 4 });

    expect(result.wasCompacted).toBe(true);
    expect(result.summaryUsed).toBe("The user discussed files A and B.");

    // Should have: 1 summary system msg + 4 recent
    expect(result.messages).toHaveLength(5);
    expect(result.messages[0]!.role).toBe("system");
    expect(result.messages[0]!.content).toContain("Earlier conversation summary:");
    expect(result.messages[0]!.content).toContain("The user discussed files A and B.");

    // Recent messages should be the last 4
    const recent = messages.slice(-4);
    expect(result.messages.slice(1)).toEqual(recent);
  });

  it("falls back to deterministic truncation when no summarizer", async () => {
    const compactor = new HistoryCompactor({});
    const messages = makeMessages(20, 50);

    const result = await compactor.compact(messages, { targetTokens: 100, keepRecent: 4 });

    expect(result.wasCompacted).toBe(true);
    expect(result.summaryUsed).toBeUndefined();
    expect(result.messages[0]!.role).toBe("system");
    expect(result.messages[0]!.content).toContain("Earlier conversation");
  });

  it("reuses cachedSummary when upToIndex covers the old messages", async () => {
    const client = makeSummarizerClient("Should NOT be called");
    const summarizer = new ConversationSummarizer({ client });
    const summarizerSpy = { callCount: 0 };

    const countingClient: ModelClient = {
      async completeText(_args: ModelCallArgs): Promise<string> {
        summarizerSpy.callCount++;
        return "Should NOT be called";
      },
      async completeJson(): Promise<string> { return ""; },
      async completeWithTools() { throw new Error("not used"); },
    };
    const countingSummarizer = new ConversationSummarizer({ client: countingClient });

    const messages = makeMessages(20, 50);
    const cachedSummary = { upToIndex: 20, text: "Cached summary text." };

    const compactor = new HistoryCompactor({ summarizer: countingSummarizer, cachedSummary });
    const result = await compactor.compact(messages, { targetTokens: 100, keepRecent: 4 });

    expect(summarizerSpy.callCount).toBe(0);
    expect(result.wasCompacted).toBe(true);
    expect(result.summaryUsed).toBe("Cached summary text.");
  });

  it("keeps exactly keepRecent messages as verbatim recent history", async () => {
    const client = makeSummarizerClient("Summary.");
    const summarizer = new ConversationSummarizer({ client });
    const compactor = new HistoryCompactor({ summarizer });
    const messages = makeMessages(20, 50);

    const result = await compactor.compact(messages, { targetTokens: 100, keepRecent: 6 });

    expect(result.wasCompacted).toBe(true);
    // 1 summary msg + 6 recent
    expect(result.messages).toHaveLength(7);
    const expectedRecent = messages.slice(-6);
    expect(result.messages.slice(1)).toEqual(expectedRecent);
  });
});
