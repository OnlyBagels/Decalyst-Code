import type { ModelClient, ChatMessage } from "../../models/model-client.js";

const SUMMARIZER_SYSTEM_PROMPT =
  "You are a conversation summarizer for a code-generation agent. " +
  "Condense the prior turns into a brief factual summary (3-6 sentences). " +
  "Preserve: file names mentioned, project intent, decisions made, open questions, errors encountered. " +
  "Drop pleasantries and filler. Output plain text only, no markdown.";

export class ConversationSummarizer {
  private readonly client: ModelClient;
  private readonly model: string | undefined;

  constructor(opts: { client: ModelClient; model?: string }) {
    this.client = opts.client;
    this.model = opts.model;
  }

  async summarize(messages: ChatMessage[]): Promise<string> {
    const userContent = messages
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n\n");

    const result = await this.client.completeText({
      model: this.model ?? "anthropic/claude-sonnet-4.6",
      messages: [
        { role: "system", content: SUMMARIZER_SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      temperature: 0.2,
      maxTokens: 2048,
      agent: "summarizer",
    });

    return result;
  }
}
