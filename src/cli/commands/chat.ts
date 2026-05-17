import * as path from "node:path";
import * as fs from "node:fs/promises";
import * as readline from "node:readline/promises";
import { FileManager } from "../../files/file-manager.js";
import { UsageTracker } from "../../tui/usage-tracker.js";
import { createOrchestratorClient } from "../../models/orchestrator-client.js";
import { createSwarmClient } from "../../models/swarm-client.js";
import { createSessionState } from "../../agent/session-state.js";
import { Conversation } from "../../agent/conversation.js";
import { IntentClassifier } from "../../agent/intent.js";
import { AgentRunner } from "../../agent/agent-runner.js";
import { toMessage } from "../../utils/errors.js";
import type { Message } from "../../agent/session-state.js";

export interface ChatCommandOptions {
  workspace: string;
  runs: string;
}

function formatMessage(msg: Message): string {
  if (msg.kind === "user") return `> ${msg.text}`;
  if (msg.kind === "agent") return `  ${msg.text}`;
  if (msg.kind === "build") return `  [build] ${msg.line}`;
  return `  [system] ${msg.text}`;
}

export async function chatCommand(opts: ChatCommandOptions): Promise<number> {
  const workspaceRoot = path.resolve(opts.workspace);
  const runsRoot = path.resolve(opts.runs);

  await fs.mkdir(workspaceRoot, { recursive: true });
  await fs.mkdir(runsRoot, { recursive: true });

  const state = createSessionState({ workspaceRoot });
  const conversation = new Conversation({ sessionId: state.sessionId, runsRoot });
  const tracker = new UsageTracker();

  let orchestratorClient;
  try {
    orchestratorClient = createOrchestratorClient(tracker);
  } catch (err) {
    console.error("Cannot start chat:", toMessage(err));
    return 1;
  }
  const swarmClient = createSwarmClient(tracker);
  const fileManager = new FileManager(workspaceRoot);
  const intentClassifier = new IntentClassifier(orchestratorClient, state.orchestratorModel);

  const runner = new AgentRunner({
    state,
    conversation,
    orchestratorClient,
    swarmClient,
    intent: intentClassifier,
    fileManager,
    runsRoot,
    onMessage: (msg) => console.log(formatMessage(msg)),
    tracker,
  });

  console.log(`decalyst-swarm chat — workspace: ${workspaceRoot}`);
  console.log(`Type /help for commands, /exit to quit.\n`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  let ctrlCCount = 0;

  process.on("SIGINT", () => {
    ctrlCCount++;
    if (state.activeRun) {
      state.activeRun.abortController.abort();
      console.log("\n  [system] Active run aborted. Press Ctrl+C again to exit.");
      ctrlCCount = 0;
    } else if (ctrlCCount >= 2) {
      rl.close();
      process.exit(0);
    } else {
      console.log("\n  [system] Press Ctrl+C again to exit.");
    }
  });

  try {
    while (true) {
      const line = await rl.question("> ");
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const result = await runner.handleInput(trimmed);
        if (result.exit) break;
      } catch (err) {
        console.log(`  [system] Error: ${toMessage(err)}`);
      }
    }
  } finally {
    rl.close();
  }

  return 0;
}
