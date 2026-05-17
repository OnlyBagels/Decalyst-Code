import { RunSession } from "../core/run-session.js";
import { FileManager } from "../files/file-manager.js";
import { UsageTracker } from "../tui/usage-tracker.js";
import type { ModelClient } from "../models/model-client.js";
import type { Message, SessionState } from "./session-state.js";
import { Conversation } from "./conversation.js";
import { IntentClassifier } from "./intent.js";
import { handleCommand } from "./actions/command-action.js";
import { runBuild } from "./actions/build-action.js";
import { runQuery } from "./actions/query-action.js";
import { runChat } from "./actions/chat-action.js";
import type { EventBus } from "../events/bus.js";

export class AgentRunner {
  private readonly state: SessionState;
  private readonly conversation: Conversation;
  private readonly orchestratorClient: ModelClient;
  private readonly swarmClient: ModelClient;
  private readonly intent: IntentClassifier;
  private readonly fileManager: FileManager;
  private readonly runsRoot: string;
  private readonly onMessage: (m: Message) => void;
  private readonly tracker: UsageTracker | undefined;
  private readonly bus: EventBus | undefined;

  constructor(opts: {
    state: SessionState;
    conversation: Conversation;
    orchestratorClient: ModelClient;
    swarmClient: ModelClient;
    intent: IntentClassifier;
    fileManager: FileManager;
    runsRoot: string;
    onMessage: (m: Message) => void;
    tracker?: UsageTracker;
    bus?: EventBus;
  }) {
    this.state = opts.state;
    this.conversation = opts.conversation;
    this.orchestratorClient = opts.orchestratorClient;
    this.swarmClient = opts.swarmClient;
    this.intent = opts.intent;
    this.fileManager = opts.fileManager;
    this.runsRoot = opts.runsRoot;
    this.onMessage = opts.onMessage;
    this.tracker = opts.tracker;
    this.bus = opts.bus;
  }

  async handleInput(text: string): Promise<{ exit?: boolean }> {
    const now = () => new Date().toISOString();

    if (text.startsWith("/")) {
      const result = await handleCommand(text, this.state, {
        fileManager: this.fileManager,
        tracker: this.tracker,
      });

      for (const [key, value] of Object.entries(result.mutations) as Array<[keyof SessionState, unknown]>) {
        if (key === "transcript" && Array.isArray(value)) {
          this.state.transcript.splice(0);
        } else {
          (this.state as unknown as Record<string, unknown>)[key] = value;
        }
      }

      for (const msg of result.messages) {
        this.onMessage(msg);
        await this.conversation.append(msg);
      }

      return { exit: result.exit };
    }

    const userMsg: Message = { kind: "user", text, ts: now() };
    this.state.transcript.push(userMsg);
    this.state.inputHistory.push(text);
    this.onMessage(userMsg);
    await this.conversation.append(userMsg);

    this.bus?.emit({ t: "mode_change", mode: "plan" });

    const classified = await this.intent.classify({
      userMessage: text,
      recentTranscript: this.conversation.history(6),
    });

    if (classified.kind === "build" || classified.kind === "modify") {
      const HISTORY_LIMIT = 8;
      const priorTurns = this.state.transcript
        .slice(0, -1)
        .slice(-HISTORY_LIMIT)
        .map((m) => {
          if (m.kind === "user") return `user: ${m.text}`;
          if (m.kind === "agent") return `agent: ${m.text}`;
          if (m.kind === "build") return `[build] ${m.line}`;
          return `[system] ${m.text}`;
        })
        .join("\n");

      const enrichedGoal = priorTurns
        ? `Recent conversation:\n${priorTurns}\n\nCurrent request: ${classified.goal}`
        : classified.goal;

      const session = new RunSession({
        userRequest: enrichedGoal,
        workspaceRoot: this.state.workspaceRoot,
        tracesRoot: this.runsRoot,
        concurrency: 2,
        maxFixRounds: 5,
        tracker: this.tracker,
      });

      const emitAndAppend = async (m: Message) => {
        this.state.transcript.push(m);
        this.onMessage(m);
        await this.conversation.append(m);
      };

      const ac = new AbortController();
      this.state.activeRun = { startedAt: Date.now(), abortController: ac };

      await runBuild({
        state: this.state,
        goal: classified.goal,
        runSession: session,
        onMessage: (m) => { void emitAndAppend(m); },
        bus: this.bus,
      });

      this.state.activeRun = null;
      return {};
    }

    if (classified.kind === "query") {
      const emitAndAppend = async (m: Message) => {
        this.state.transcript.push(m);
        this.onMessage(m);
        await this.conversation.append(m);
      };

      await runQuery({
        state: this.state,
        question: classified.question,
        client: this.orchestratorClient,
        fileManager: this.fileManager,
        onMessage: (m) => { void emitAndAppend(m); },
        bus: this.bus,
      });

      this.bus?.emit({ t: "mode_change", mode: "idle" });
      return {};
    }

    const emitAndAppend = async (m: Message) => {
      this.state.transcript.push(m);
      this.onMessage(m);
      await this.conversation.append(m);
    };

    const chatMsg = classified.kind === "chat" ? classified.message : text;
    await runChat({
      state: this.state,
      message: chatMsg,
      client: this.orchestratorClient,
      onMessage: (m) => { void emitAndAppend(m); },
      bus: this.bus,
    });

    this.bus?.emit({ t: "mode_change", mode: "idle" });
    return {};
  }
}
