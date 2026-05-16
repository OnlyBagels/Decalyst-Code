import type { WorkerRole } from "./agent.js";

export interface PlannedFile {
  path: string;
  role: WorkerRole;
  purpose: string;
  dependsOn?: string[];
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
}
