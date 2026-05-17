import { getRepoSummary, formatRepoSummaryForPrompt } from "../../context/repo-summary.js";
import { FileManager } from "../../files/file-manager.js";
import type { ModelClient } from "../../models/model-client.js";
import type { Message, SessionState } from "../session-state.js";

const QUERY_SYSTEM_PROMPT =
  "You answer questions about a code workspace. Be concise and factual. " +
  "If the question requires reading a specific file, suggest the read but do not fabricate content.";

export async function runQuery(args: {
  state: SessionState;
  question: string;
  client: ModelClient;
  fileManager: FileManager;
  onMessage: (m: Message) => void;
}): Promise<void> {
  const now = () => new Date().toISOString();
  const model = args.state.orchestratorModel ?? "anthropic/claude-sonnet-4.6";

  let workspaceSummary = "";
  try {
    const summary = await getRepoSummary(args.fileManager, args.state.workspaceRoot);
    workspaceSummary = formatRepoSummaryForPrompt(summary);
  } catch {
    workspaceSummary = `Workspace root: ${args.state.workspaceRoot}`;
  }

  const userContent = workspaceSummary
    ? `${workspaceSummary}\n\nQuestion: ${args.question}`
    : args.question;

  try {
    const answer = await args.client.completeText({
      model,
      messages: [
        { role: "system", content: QUERY_SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      temperature: 0.2,
      maxTokens: 1024,
      agent: "query",
    });

    args.onMessage({ kind: "agent", text: answer, ts: now() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    args.onMessage({ kind: "system", text: `Query failed: ${msg}`, ts: now() });
  }
}
