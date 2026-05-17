export type SessionMode =
  | "plan"
  | "execute"
  | "review"
  | "idle"
  | "done"
  | "failed";

export type WorkerFinishStatus = "submitted" | "blocked";

export type PermissionDecision = "auto" | "ask" | "ask-once" | "deny";

export type TranscriptMessage =
  | { kind: "user"; text: string; ts: string }
  | { kind: "agent"; text: string; ts: string }
  | { kind: "build"; line: string; ts: string }
  | { kind: "system"; text: string; ts: string };

export type SessionEvent =
  | { t: "transcript_message"; message: TranscriptMessage }
  | { t: "mode_change"; mode: SessionMode }
  | { t: "plan_updated"; plan: unknown }
  | { t: "todo_changed"; todos: unknown[] }
  | { t: "worker_started"; id: string; file: string; role: string }
  | { t: "worker_tool_call"; id: string; tool: string; args: unknown }
  | { t: "worker_tool_result"; id: string; tool: string; ok: boolean }
  | { t: "worker_finished"; id: string; status: WorkerFinishStatus }
  | { t: "command_started"; name: string }
  | { t: "command_finished"; name: string; passed: boolean; durationMs: number }
  | { t: "tokens_updated"; agent: string; promptTokens: number; completionTokens: number }
  | {
      t: "tool_call_started";
      toolName: string;
      agent: string;
      args: unknown;
    }
  | {
      t: "tool_call_finished";
      toolName: string;
      agent: string;
      ok: boolean;
      durationMs: number;
    }
  | {
      t: "permission_request";
      toolName: string;
      args: unknown;
      resolve: (decision: PermissionDecision) => void;
    }
  | {
      t: "ask_user";
      question: string;
      options?: string[];
      resolve: (answer: string) => void;
    }
  | { t: "run_finished"; passed: boolean };

export type EventByType<T extends SessionEvent["t"]> = Extract<
  SessionEvent,
  { t: T }
>;
