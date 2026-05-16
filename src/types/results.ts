import type { TestResult } from "./agent.js";

export interface CheckSuite {
  install: TestResult;
  format?: TestResult;
  typecheck?: TestResult;
  lint?: TestResult;
  test?: TestResult;
  build?: TestResult;
}

export interface RunSummary {
  runId: string;
  userRequest: string;
  workspaceRoot: string;
  startedAt: string;
  finishedAt: string;
  passed: boolean;
  filesCreated: string[];
  filesModified: string[];
  totalTasks: number;
  appliedTasks: number;
  failedTasks: number;
  fixRoundsUsed: number;
  finalReport: string;
}
