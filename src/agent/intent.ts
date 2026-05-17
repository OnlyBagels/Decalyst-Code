import type { ModelClient } from "../models/model-client.js";
import { getDefaultOrchestratorModel } from "../models/orchestrator-client.js";
import type { Message } from "./session-state.js";

export interface BuildIntent {
  kind: "build" | "modify";
  goal: string;
}

export interface QueryIntent {
  kind: "query";
  question: string;
}

export interface ChatIntent {
  kind: "chat";
  message: string;
}

export type Intent = BuildIntent | QueryIntent | ChatIntent;

const INTENT_SYSTEM_PROMPT = `You classify user messages into one of four intents. Output JSON only — no prose, no markdown fences.

Intents:
- "build": user wants to create a new project or generate code from scratch
- "modify": user wants to change, fix, or extend existing code
- "query": user wants to know something about the workspace or codebase (file contents, structure, status)
- "chat": pleasantries, clarifications, out-of-scope questions, or anything that doesn't require code work

Output schema: { "kind": "build" | "modify" | "query" | "chat", "goal": "<brief restatement of what they want>" }

Examples:
- "Build me a REST API with Express" → { "kind": "build", "goal": "REST API with Express" }
- "Add authentication to the existing app" → { "kind": "modify", "goal": "add authentication" }
- "What files are in the workspace?" → { "kind": "query", "goal": "list workspace files" }
- "Thanks!" → { "kind": "chat", "goal": "acknowledgement" }`;

export class IntentClassifier {
  private readonly client: ModelClient;
  private readonly model: string | undefined;

  constructor(client: ModelClient, model?: string) {
    this.client = client;
    this.model = model;
  }

  async classify(args: {
    userMessage: string;
    recentTranscript: Message[];
    workspaceSummary?: string;
  }): Promise<Intent> {
    const contextLines: string[] = [];
    if (args.workspaceSummary) {
      contextLines.push(`Workspace summary:\n${args.workspaceSummary}`);
    }
    if (args.recentTranscript.length > 0) {
      const recent = args.recentTranscript
        .slice(-4)
        .map((m) => {
          if (m.kind === "user") return `user: ${m.text}`;
          if (m.kind === "agent") return `agent: ${m.text}`;
          return null;
        })
        .filter(Boolean)
        .join("\n");
      if (recent) contextLines.push(`Recent conversation:\n${recent}`);
    }

    const userContent = [
      ...contextLines,
      `Classify this message: ${args.userMessage}`,
    ].join("\n\n");

    const model = this.model ?? getDefaultOrchestratorModel();

    try {
      const raw = await this.client.completeJson({
        model,
        messages: [
          { role: "system", content: INTENT_SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        temperature: 0,
        maxTokens: 128,
        agent: "intent-router",
      });

      const parsed = JSON.parse(raw) as { kind: string; goal: string };
      const kind = parsed.kind;

      if (kind === "build" || kind === "modify") {
        return { kind, goal: parsed.goal ?? args.userMessage };
      }
      if (kind === "query") {
        return { kind: "query", question: parsed.goal ?? args.userMessage };
      }
      return { kind: "chat", message: parsed.goal ?? args.userMessage };
    } catch {
      return { kind: "chat", message: args.userMessage };
    }
  }
}
