export type WorkerRole =
  | "scaffold-writer"
  | "route-writer"
  | "schema-writer"
  | "service-writer"
  | "test-writer"
  | "fixer"
  | "refactor-worker"
  | "docs-worker";

export type TaskStatus =
  | "pending"
  | "ready"
  | "running"
  | "needs_review"
  | "applied"
  | "failed"
  | "blocked";

export type EditMode = "create" | "replace";

export interface FileContext {
  path: string;
  content: string;
  sha256: string;
  exists: boolean;
  language: "typescript" | "javascript" | "json" | "markdown" | "text";
  reason: string;
}

export interface CompilerError {
  source: "tsc" | "eslint";
  filePath?: string;
  line?: number;
  column?: number;
  code?: string;
  message: string;
  raw: string;
}

export interface TestFailure {
  filePath?: string;
  testName?: string;
  message: string;
  expected?: string;
  actual?: string;
  raw: string;
}

export interface TestResult {
  command: string;
  exitCode: number;
  passed: boolean;
  durationMs: number;
  stdout: string;
  stderr: string;
  failures: TestFailure[];
}

export interface FileEdit {
  mode: EditMode;
  path: string;
  fullContent: string;
  expectedSha256?: string;
}

export interface ProjectContext {
  projectKind?: string;
  packageManager?: string;
  framework?: string;
  testFramework?: string;
  validationLibrary?: string;
  moduleSystem?: "esm" | "cjs";
  strictTypeScript?: boolean;
}

export interface TaskLimits {
  maxFilesToEdit: number;
  maxOutputChars: number;
}

export interface AgentTask {
  id: string;
  role: WorkerRole;
  title: string;
  goal: string;
  targetFiles: string[];
  fileContexts: FileContext[];
  constraints: string[];
  /** Shared contract, placed in the stable system-prompt prefix for cache hits. */
  contract?: string;
  projectContext: ProjectContext;
  compilerErrors?: CompilerError[];
  testResults?: TestResult[];
  limits: TaskLimits;
  dependencies: string[];
  /** Concrete file paths this task depends on, for context (the deps' files). */
  dependencyFiles?: string[];
  status: TaskStatus;
  attempt: number;
  failureReason?: string;
}

export interface AgentResult {
  taskId: string;
  role: WorkerRole;
  status: "success" | "cannot_complete";
  edits: FileEdit[];
  blockers: string[];
  requestedDependencies?: {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
}

export interface PatchResult {
  taskId: string;
  accepted: boolean;
  applied: boolean;
  editsApplied: {
    path: string;
    mode: EditMode;
    beforeSha256?: string;
    afterSha256: string;
  }[];
  rejectedEdits: {
    path: string;
    reason: string;
  }[];
  validationErrors: string[];
  formatted: boolean;
  rolledBack: boolean;
}
