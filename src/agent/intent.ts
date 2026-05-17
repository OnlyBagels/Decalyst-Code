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

const INTENT_SYSTEM_PROMPT = `You classify user messages into one of four intents for a code-generation harness. Output JSON only — no prose, no markdown fences.

Intents:
- "build": user wants the harness to PRODUCE a new file or project. Any phrasing that names a target file or asks for code/content to be created. Examples: "make me a file called X", "create a Y", "build a Z", "generate", "write me", "I want a", "scaffold", "set up", "add a new file".
- "modify": user wants to change, fix, edit, or extend something that already exists. Examples: "add a flag", "fix the bug", "refactor X", "update Y", "in that file...", "change Z".
- "query": user asks about the workspace or files WITHOUT requesting changes. Examples: "what files are here?", "do you see X?", "show me Y", "what's in Z?".
- "chat": pleasantries, meta-questions about the harness itself, or genuinely off-topic input. Examples: "hello", "thanks", "what can you do?", "are you ok?".

CRITICAL: if the user's message contains a verb like make/create/build/generate/write/produce/scaffold followed by a noun like file/page/script/component/api/project — that is "build" or "modify", NEVER "chat". The chat path cannot produce files; it just talks.

ALSO CRITICAL: if the user asks you to READ a file AND THEN use its content for code work ("read X and use it to ...", "use README to fill in Y", "based on file Z, modify W"), that is "modify". The build pipeline reads files when it plans; chat cannot read files. Only classify as "query" if the user just wants to KNOW something and is not asking for code work to follow.

Output schema: { "kind": "build" | "modify" | "query" | "chat", "goal": "<brief restatement of what they want>" }

Examples:
- "Build me a REST API with Express" → { "kind": "build", "goal": "REST API with Express" }
- "make me a file test.html, full landing page with hero, nav, footer, 3 cards" → { "kind": "build", "goal": "test.html landing page with hero, nav, footer, and 3 content cards" }
- "Add authentication to the existing app" → { "kind": "modify", "goal": "add authentication" }
- "inside that file, add a button" → { "kind": "modify", "goal": "add a button to the previously discussed file" }
- "read README.md and use it to fill the content sections" → { "kind": "modify", "goal": "rewrite content sections using README.md as source" }
- "use the existing tuitest.html as a template, make a darker version" → { "kind": "modify", "goal": "produce a darker version of the existing tuitest.html" }
- "What files are in the workspace?" → { "kind": "query", "goal": "list workspace files" }
- "do you see tuitest.html?" → { "kind": "query", "goal": "check whether tuitest.html exists" }
- "Thanks!" → { "kind": "chat", "goal": "acknowledgement" }
- "hello" → { "kind": "chat", "goal": "greeting" }`;

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
        maxTokens: 256,
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
