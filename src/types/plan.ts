import type { WorkerRole } from "./agent.js";

export interface PlannedFile {
  path: string;
  role: WorkerRole;
  purpose: string;
  dependsOn?: string[];
  /** Files sharing a group are written by ONE worker, so coupled seams agree. */
  group?: string;
}

export interface ProjectPlan {
  projectName: string;
  projectKind?: string;
  framework?: string;
  packageManager?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  files: PlannedFile[];
  constraints: string[];
  /**
   * Shared contract broadcast to every worker: the canonical types, the exact
   * module signatures, and the import/export names. Workers import these and
   * never redefine them, so cross-file seams don't drift.
   */
  contract?: string;
}
