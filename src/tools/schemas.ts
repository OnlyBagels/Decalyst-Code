import type { ZodSchema } from "zod";
import type { Mode } from "../modes/types.js";

export interface UsageTracker {
  record(args: {
    agent: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
  }): void;
}

export type { Mode };

export type ToolEvent =
  | { t: "tool_call_started"; toolName: string; taskId: string | undefined }
  | {
      t: "tool_call_finished";
      toolName: string;
      taskId: string | undefined;
      ok: boolean;
      durationMs: number;
    }
  | {
      t: "permission_request";
      toolName: string;
      taskId: string | undefined;
      resolve: (decision: PermissionDecision) => void;
    };

export type PermissionDecision = "auto" | "ask" | "ask-once" | "deny";

export interface PermissionSpec {
  default: PermissionDecision;
  evaluate?: (args: unknown, ctx: ToolCtx) => PermissionDecision;
}

export interface PermissionConfig {
  perTool: Record<string, PermissionDecision>;
  globalOverride?: PermissionDecision;
}

export type ToolResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string; code: string };

export interface ToolCtx {
  workspaceRoot: string;
  taskId?: string;
  agent: "orchestrator" | "swarm" | "both";
  signal: AbortSignal;
  emit: (event: ToolEvent) => void;
  tracker?: UsageTracker;
}

export interface ToolDef<A = unknown, R = unknown> {
  name: string;
  description: string;
  agent: "orchestrator" | "swarm" | "both";
  schema: ZodSchema<A>;
  filesAccessed?: (args: A) => string[];
  handler: (args: A, ctx: ToolCtx) => Promise<R>;
}
