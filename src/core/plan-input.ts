import { projectPlanSchema } from "../patches/schemas.js";
import { inferWorkerRole } from "../workers/worker-roles.js";
import type { ProjectPlan, PlannedFile } from "../types/plan.js";

/**
 * Validates a plan supplied by an external orchestrator and fills in any
 * missing worker role from the file path. The caller (the orchestrating agent)
 * produces this plan directly, so the structure must be checked before it
 * reaches the swarm. Throws a ZodError when the plan is structurally invalid.
 */
export function parseProjectPlan(raw: unknown): ProjectPlan {
  const parsed = projectPlanSchema.parse(fillRoles(raw));

  const files: PlannedFile[] = parsed.files.map((f) => {
    const file: PlannedFile = {
      path: f.path,
      role: f.role,
      purpose: f.purpose,
    };
    if (f.dependsOn) file.dependsOn = f.dependsOn;
    if (f.group) file.group = f.group;
    return file;
  });

  const plan: ProjectPlan = {
    projectName: parsed.projectName,
    files,
    constraints: parsed.constraints,
  };
  if (parsed.projectKind) plan.projectKind = parsed.projectKind;
  if (parsed.framework) plan.framework = parsed.framework;
  if (parsed.packageManager) plan.packageManager = parsed.packageManager;
  if (parsed.dependencies) plan.dependencies = parsed.dependencies;
  if (parsed.devDependencies) plan.devDependencies = parsed.devDependencies;
  if (parsed.contract) plan.contract = parsed.contract;
  return plan;
}

/**
 * Pre-fills a missing `role` on each planned file from its path, so an external
 * caller can omit role and let the path heuristic choose. Returns the input
 * untouched when it is not a plan-shaped object; structural errors surface from
 * the schema parse, not here.
 */
function fillRoles(raw: unknown): unknown {
  if (
    raw === null ||
    typeof raw !== "object" ||
    !Array.isArray((raw as { files?: unknown }).files)
  ) {
    return raw;
  }

  const obj = raw as Record<string, unknown>;
  const files = (obj.files as unknown[]).map((f) => {
    if (
      f !== null &&
      typeof f === "object" &&
      (f as { role?: unknown }).role === undefined &&
      typeof (f as { path?: unknown }).path === "string"
    ) {
      return {
        ...(f as object),
        role: inferWorkerRole((f as { path: string }).path),
      };
    }
    return f;
  });

  return { ...obj, files };
}
