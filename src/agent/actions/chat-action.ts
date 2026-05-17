import type { ModelClient } from "../../models/model-client.js";
import type { Message, SessionState } from "../session-state.js";

const CHAT_SYSTEM_PROMPT =
  "You are a helpful assistant for a TypeScript code generation tool. " +
  "Answer briefly and directly. If the user wants to build or modify code, tell them to describe their goal.";

export async function runChat(args: {
  state: SessionState;
  message: string;
  client: ModelClient;
  onMessage: (m: Message) => void;
}): Promise<void> {
  const now = () => new Date().toISOString();
  const model = args.state.orchestratorModel ?? "anthropic/claude-sonnet-4.6";

  try {
    const reply = await args.client.completeText({
      model,
      messages: [
        { role: "system", content: CHAT_SYSTEM_PROMPT },
        { role: "user", content: args.message },
      ],
      temperature: 0.7,
      maxTokens: 512,
      agent: "chat",
    });

    args.onMessage({ kind: "agent", text: reply, ts: now() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    args.onMessage({ kind: "system", text: `Chat failed: ${msg}`, ts: now() });
  }
}
