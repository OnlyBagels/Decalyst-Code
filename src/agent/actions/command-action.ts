import * as path from "node:path";
import * as fs from "node:fs/promises";
import { FileManager } from "../../files/file-manager.js";
import { UsageTracker } from "../../tui/usage-tracker.js";
import type { Message, SessionState } from "../session-state.js";

export interface CommandResult {
  messages: Message[];
  mutations: Partial<SessionState>;
  exit?: boolean;
}

const COMMANDS = `Commands:
  /help                        — show this list
  /exit, /quit                 — exit the shell
  /workspace [path]            — print or change workspace root
  /model [orchestrator|swarm] [name]  — print or set model overrides
  /clear                       — clear the transcript
  /cost                        — show token usage and estimated cost
  /files                       — list workspace files
  /cancel                      — abort the active run
  /permissions                 — show cached permission decisions`;

export async function handleCommand(
  raw: string,
  state: SessionState,
  deps: { fileManager: FileManager; tracker?: UsageTracker },
): Promise<CommandResult> {
  const now = () => new Date().toISOString();
  const sys = (text: string): Message => ({ kind: "system", text, ts: now() });

  const parts = raw.trim().split(/\s+/);
  const cmd = (parts[0] ?? "").toLowerCase();

  if (cmd === "/help") {
    return { messages: [sys(COMMANDS)], mutations: {} };
  }

  if (cmd === "/exit" || cmd === "/quit") {
    return { messages: [sys("Goodbye.")], mutations: {}, exit: true };
  }

  if (cmd === "/workspace") {
    if (parts.length === 1) {
      return {
        messages: [sys(`Workspace: ${state.workspaceRoot}`)],
        mutations: {},
      };
    }
    const newPath = path.resolve(parts.slice(1).join(" "));
    try {
      await fs.mkdir(newPath, { recursive: true });
    } catch {
      // ignore
    }
    return {
      messages: [sys(`Workspace set to: ${newPath}`)],
      mutations: { workspaceRoot: newPath },
    };
  }

  if (cmd === "/clear") {
    return {
      messages: [sys("Transcript cleared.")],
      mutations: { transcript: [] },
    };
  }

  if (cmd === "/model") {
    if (parts.length === 1) {
      const lines = [
        `orchestrator: ${state.orchestratorModel ?? "(default)"}`,
        `swarm: ${state.swarmModel ?? "(default)"}`,
      ];
      return { messages: [sys(lines.join("\n"))], mutations: {} };
    }
    const target = parts[1]?.toLowerCase();
    const name = parts.slice(2).join(" ");
    if (target === "orchestrator" && name) {
      return {
        messages: [sys(`Orchestrator model set to: ${name}`)],
        mutations: { orchestratorModel: name },
      };
    }
    if (target === "swarm" && name) {
      return {
        messages: [sys(`Swarm model set to: ${name}`)],
        mutations: { swarmModel: name },
      };
    }
    return {
      messages: [sys("Usage: /model orchestrator <name> | /model swarm <name>")],
      mutations: {},
    };
  }

  if (cmd === "/cost") {
    if (deps.tracker) {
      const t = deps.tracker.totals();
      const text =
        `Tokens: ${t.promptTokens.toLocaleString()} in / ${t.completionTokens.toLocaleString()} out\n` +
        `Estimated cost: $${t.cost.toFixed(4)} (${t.calls} calls)`;
      return { messages: [sys(text)], mutations: {} };
    }
    return { messages: [sys("No usage data available for this session.")], mutations: {} };
  }

  if (cmd === "/files") {
    try {
      const files = await deps.fileManager.glob("**/*");
      const text =
        files.length === 0
          ? "No files in workspace."
          : files.join("\n");
      return { messages: [sys(text)], mutations: {} };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { messages: [sys(`Could not list files: ${msg}`)], mutations: {} };
    }
  }

  if (cmd === "/cancel") {
    if (state.activeRun) {
      state.activeRun.abortController.abort();
      return { messages: [sys("Active run aborted.")], mutations: {} };
    }
    return { messages: [sys("No active run.")], mutations: {} };
  }

  if (cmd === "/permissions") {
    if (state.permissionDecisions.size === 0) {
      return { messages: [sys("No permission decisions cached.")], mutations: {} };
    }
    const lines: string[] = [];
    for (const [tool, decision] of state.permissionDecisions) {
      lines.push(`  ${tool}: ${decision}`);
    }
    return { messages: [sys(lines.join("\n"))], mutations: {} };
  }

  return {
    messages: [sys(`Unknown command: ${cmd}. Type /help for a list.`)],
    mutations: {},
  };
}
