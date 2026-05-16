import type { WorkerRole } from "./agent.js";

export interface PlannedFile {
  path: string;
  role: WorkerRole;
  purpose: string;
  dependsOn?: string[];
}

export interface ProjectPlan {
  projectName: string;
  framework: "fastify" | "express" | "hono";
  packageManager: "npm";
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  files: PlannedFile[];
  constraints: string[];
}
