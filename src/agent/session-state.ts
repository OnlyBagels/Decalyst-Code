export type Message =
  | { kind: "user"; text: string; ts: string }
  | { kind: "agent"; text: string; ts: string }
  | { kind: "build"; line: string; ts: string }
  | { kind: "system"; text: string; ts: string };

export interface SessionState {
  sessionId: string;
  workspaceRoot: string;
  orchestratorModel?: string;
  swarmModel?: string;
  transcript: Message[];
  inputHistory: string[];
  activeRun: { startedAt: number; abortController: AbortController } | null;
  permissionDecisions: Map<string, "auto" | "ask" | "ask-once" | "deny">;
}

export function createSessionState(opts: { workspaceRoot: string }): SessionState {
  return {
    sessionId: new Date().toISOString(),
    workspaceRoot: opts.workspaceRoot,
    transcript: [],
    inputHistory: [],
    activeRun: null,
    permissionDecisions: new Map(),
  };
}
