import type {
  AgentTask,
  AgentResult,
  PatchResult,
  TestResult,
} from "../types/agent.js";

export interface TraceTaskRecord {
  taskId: string;
  attempt: number;
  promptSystem: string;
  promptUser: string;
  rawResponse: string;
  parsed: AgentResult | null;
  patchResult: PatchResult | null;
  durationMs: number;
}

export interface TraceCommandRecord {
  name: string;
  result: TestResult;
}

export interface TraceManifest {
  runId: string;
  userRequest: string;
  workspaceRoot: string;
  startedAt: string;
  finishedAt?: string;
  tasks: AgentTask[];
}
