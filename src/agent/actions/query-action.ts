import { getRepoSummary, formatRepoSummaryForPrompt } from "../../context/repo-summary.js";
import { FileManager } from "../../files/file-manager.js";
import type { ModelClient } from "../../models/model-client.js";
import { getDefaultOrchestratorModel } from "../../models/orchestrator-client.js";
import type { Message, SessionState } from "../session-state.js";
import type { EventBus } from "../../events/bus.js";

const QUERY_SYSTEM_PROMPT =
  "You answer questions about a code workspace. Be concise and factual. " +
  "If the question requires reading a specific file, suggest the read but do not fabricate content.";

export async function runQuery(args: {
  state: SessionState;
  question: string;
  client: ModelClient;
  fileManager: FileManager;
  onMessage: (m: Message) => void;
  bus?: EventBus;
}): Promise<void> {
  const now = () => new Date().toISOString();
  const model = args.state.orchestratorModel ?? getDefaultOrchestratorModel();
  const messageId = `query-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  let workspaceSummary = "";
  try {
    const summary = await getRepoSummary(args.fileManager, args.state.workspaceRoot);
    workspaceSummary = formatRepoSummaryForPrompt(summary);
  } catch {
    workspaceSummary = `Workspace root: ${args.state.workspaceRoot}`;
  }

  const HISTORY_LIMIT = 12;
  const priorHistory = args.state.transcript
    .slice(0, -1)
    .slice(-HISTORY_LIMIT)
    .map((m) => {
      if (m.kind === "user") return { role: "user" as const, content: m.text };
      if (m.kind === "agent") return { role: "assistant" as const, content: m.text };
      if (m.kind === "build") return { role: "assistant" as const, content: `[build] ${m.line}` };
      return { role: "assistant" as const, content: `[system] ${m.text}` };
    });

  const currentUserContent = workspaceSummary
    ? `${workspaceSummary}\n\nQuestion: ${args.question}`
    : args.question;

  try {
    const onDelta = (delta: string) => {
      if (args.bus) {
        args.bus.emit({ t: "transcript_chunk", messageId, deltaText: delta });
      }
    };

    const answer = await args.client.completeText({
      model,
      messages: [
        { role: "system", content: QUERY_SYSTEM_PROMPT },
        ...priorHistory,
        { role: "user", content: currentUserContent },
      ],
      temperature: 0.2,
      maxTokens: 1024,
      agent: "query",
      onDelta,
    });

    if (args.bus) {
      args.bus.emit({ t: "transcript_finish", messageId });
    }

    args.onMessage({ kind: "agent", text: answer, ts: now() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    args.onMessage({ kind: "system", text: `Query failed: ${msg}`, ts: now() });
  }
}
