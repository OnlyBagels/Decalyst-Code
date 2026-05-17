import { countTokens } from "gpt-tokenizer";
import type { ChatMessage } from "../../models/model-client.js";
import { TextCompressor } from "./text.js";
import type { ConversationSummarizer } from "./conversation-summarizer.js";

export interface CompactedHistory {
  messages: ChatMessage[];
  wasCompacted: boolean;
  originalTokens: number;
  compactedTokens: number;
  summaryUsed?: string;
}

export interface CompactOptions {
  targetTokens?: number;
  keepRecent?: number;
}

// Compact only after history fills roughly 80% of a 128k context window,
// leaving room for output (up to 64k on deepseek-reasoner) plus system
// prompts and workspace summary. Matches the threshold Claude Code uses
// for its auto-compact behavior. Override via CompactOptions when calling
// against a smaller-context model.
const DEFAULT_TARGET_TOKENS = 80_000;
const DEFAULT_KEEP_RECENT = 12;

function countHistoryTokens(messages: ChatMessage[]): number {
  return messages.reduce((sum, m) => sum + countTokens(m.content), 0);
}

export class HistoryCompactor {
  private readonly summarizer: ConversationSummarizer | undefined;
  private readonly cachedSummary: { upToIndex: number; text: string } | undefined;
  private readonly textCompressor = new TextCompressor();

  constructor(opts: {
    summarizer?: ConversationSummarizer;
    cachedSummary?: { upToIndex: number; text: string };
  }) {
    this.summarizer = opts.summarizer;
    this.cachedSummary = opts.cachedSummary;
  }

  async compact(messages: ChatMessage[], opts?: CompactOptions): Promise<CompactedHistory> {
    const targetTokens = opts?.targetTokens ?? DEFAULT_TARGET_TOKENS;
    const keepRecent = opts?.keepRecent ?? DEFAULT_KEEP_RECENT;

    const originalTokens = countHistoryTokens(messages);

    if (originalTokens <= targetTokens) {
      return {
        messages,
        wasCompacted: false,
        originalTokens,
        compactedTokens: originalTokens,
      };
    }

    const splitIndex = Math.max(0, messages.length - keepRecent);
    const old = messages.slice(0, splitIndex);
    const recent = messages.slice(splitIndex);

    if (old.length === 0) {
      return {
        messages,
        wasCompacted: false,
        originalTokens,
        compactedTokens: originalTokens,
      };
    }

    // If we have a cached summary that covers all the old messages, reuse it
    if (this.cachedSummary && this.cachedSummary.upToIndex >= splitIndex) {
      const summaryMsg: ChatMessage = {
        role: "system",
        content: `Earlier conversation summary:\n${this.cachedSummary.text}`,
      };
      const compacted = [summaryMsg, ...recent];
      return {
        messages: compacted,
        wasCompacted: true,
        originalTokens,
        compactedTokens: countHistoryTokens(compacted),
        summaryUsed: this.cachedSummary.text,
      };
    }

    if (this.summarizer) {
      const summary = await this.summarizer.summarize(old);
      const summaryMsg: ChatMessage = {
        role: "system",
        content: `Earlier conversation summary:\n${summary}`,
      };
      const compacted = [summaryMsg, ...recent];
      return {
        messages: compacted,
        wasCompacted: true,
        originalTokens,
        compactedTokens: countHistoryTokens(compacted),
        summaryUsed: summary,
      };
    }

    // Fallback: deterministic truncation of old messages via TextCompressor
    const oldText = old.map((m) => `${m.role}: ${m.content}`).join("\n\n");
    const truncated = this.textCompressor.compress(oldText, { maxTokens: 300 });
    const summaryMsg: ChatMessage = {
      role: "system",
      content: `Earlier conversation (truncated):\n${truncated.content}`,
    };
    const compacted = [summaryMsg, ...recent];
    return {
      messages: compacted,
      wasCompacted: true,
      originalTokens,
      compactedTokens: countHistoryTokens(compacted),
    };
  }
}
