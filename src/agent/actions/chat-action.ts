import type { ModelClient, ChatMessage } from "../../models/model-client.js";
import { getDefaultOrchestratorModel } from "../../models/orchestrator-client.js";
import type { Message, SessionState } from "../session-state.js";
import type { EventBus } from "../../events/bus.js";
import { ConversationSummarizer } from "../../services/compress/conversation-summarizer.js";
import { HistoryCompactor } from "../../services/compress/history-compactor.js";

const CHAT_SYSTEM_PROMPT =
  "You are a helpful assistant for a TypeScript code generation tool. " +
  "Answer briefly and directly. If the user wants to build or modify code, tell them to describe their goal.";

function transcriptToChatMessages(messages: Message[]): ChatMessage[] {
  return messages.map((m) => {
    if (m.kind === "user") return { role: "user" as const, content: m.text };
    if (m.kind === "agent") return { role: "assistant" as const, content: m.text };
    if (m.kind === "build") return { role: "assistant" as const, content: `[build] ${m.line}` };
    return { role: "assistant" as const, content: `[system] ${m.text}` };
  });
}

export async function runChat(args: {
  state: SessionState;
  message: string;
  client: ModelClient;
  onMessage: (m: Message) => void;
  bus?: EventBus;
  workspaceSummary?: string;
}): Promise<void> {
  const now = () => new Date().toISOString();
  const model = args.state.orchestratorModel ?? getDefaultOrchestratorModel();
  const messageId = `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    let accumulated = "";

    const onDelta = (delta: string) => {
      accumulated += delta;
      if (args.bus) {
        args.bus.emit({ t: "transcript_chunk", messageId, deltaText: delta });
      }
    };

    const chatHistory = transcriptToChatMessages(args.state.transcript);

    const summarizer = new ConversationSummarizer({ client: args.client, model });
    const compactor = new HistoryCompactor({
      summarizer,
      cachedSummary: args.state.conversationSummary,
    });

    const { messages: compacted, wasCompacted, summaryUsed } = await compactor.compact(chatHistory);

    if (wasCompacted && summaryUsed !== undefined) {
      const summarizedCount = args.state.transcript.length - 6;
      args.state.conversationSummary = {
        upToIndex: Math.max(0, summarizedCount),
        text: summaryUsed,
      };
    }

    const systemMessages: ChatMessage[] = [
      { role: "system", content: CHAT_SYSTEM_PROMPT },
    ];
    if (args.workspaceSummary && args.workspaceSummary.trim().length > 0) {
      systemMessages.push({
        role: "system",
        content: `Current workspace:\n${args.workspaceSummary}`,
      });
    }

    const reply = await args.client.completeText({
      model,
      messages: [
        ...systemMessages,
        ...compacted,
      ],
      temperature: 0.7,
      maxTokens: 512,
      agent: "chat",
      onDelta,
    });

    if (args.bus) {
      args.bus.emit({ t: "transcript_finish", messageId });
    }

    args.onMessage({ kind: "agent", text: reply, ts: now() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    args.onMessage({ kind: "system", text: `Chat failed: ${msg}`, ts: now() });
  }
}
