import type { ModelClient, ChatMessage } from "../../models/model-client.js";
import { getDefaultOrchestratorModel } from "../../models/orchestrator-client.js";
import type { Message, SessionState } from "../session-state.js";
import type { EventBus } from "../../events/bus.js";
import { ConversationSummarizer } from "../../services/compress/conversation-summarizer.js";
import { HistoryCompactor } from "../../services/compress/history-compactor.js";

const CHAT_SYSTEM_PROMPT =
  "You are a helpful assistant inside the decalyst-swarm code-generation harness. " +
  "Answer briefly and directly. " +
  "If a second system message lists the workspace files, treat that list as authoritative — those files exist; do not ask the user to upload, share, or list files. " +
  "STRICT RULES:\n" +
  "- You cannot read file contents in chat mode. If the user asks you to read a file, say you cannot in chat and suggest they rephrase as a build/modify request — the build pipeline reads files when it plans.\n" +
  "- NEVER invent or quote file contents that were not provided in this conversation. If you do not have the content, say so. Hallucinating contents is the worst failure mode.\n" +
  "- NEVER emit lines that start with [build], [system], or similar harness-formatted markers. Those are reserved for the harness and pretending to be them is forbidden.\n" +
  "- NEVER output large code blocks as a chat answer. If the user wants code generated or files written, tell them to use a build/modify phrasing and the harness will do it.\n" +
  "If the user wants to build or modify code, tell them to describe the goal and the harness will generate it.";

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
        content:
          `The user's current workspace at ${args.state.workspaceRoot} contains these files. ` +
          `This list is authoritative — when asked about files, reference it directly.\n\n${args.workspaceSummary}`,
      });
    }

    const reply = await args.client.completeText({
      model,
      messages: [
        ...systemMessages,
        ...compacted,
      ],
      temperature: 0.7,
      maxTokens: 16384,
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
