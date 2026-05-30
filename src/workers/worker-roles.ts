import type { WorkerRole } from "../types/agent.js";

export const MAX_FILES_PER_ROLE: Record<WorkerRole, number> = {
  "scaffold-writer": 4,
  "route-writer": 1,
  "schema-writer": 1,
  "service-writer": 1,
  "test-writer": 2,
  fixer: 3,
  "refactor-worker": 2,
  "docs-worker": 1,
};

export const MAX_OUTPUT_CHARS_DEFAULT = Math.max(
  40_000,
  Number.parseInt(process.env["SWARM_MAX_OUTPUT_CHARS"] ?? "", 10) || 120_000,
);

/** Infer a worker role from a target file path. */
export function inferWorkerRole(filePath: string): WorkerRole {
  const lower = filePath.toLowerCase();

  if (lower.includes("test") || lower.includes("spec")) return "test-writer";
  if (
    lower.includes("schema") ||
    lower.includes("types") ||
    lower.includes("dto")
  )
    return "schema-writer";
  if (
    lower.includes("service") ||
    lower.includes("repository") ||
    lower.includes("repo")
  )
    return "service-writer";
  if (
    lower.includes("route") ||
    lower.includes("router") ||
    lower.includes("handler") ||
    lower.includes("controller")
  )
    return "route-writer";
  if (lower === "readme.md") return "docs-worker";
  if (
    lower === "package.json" ||
    lower === "tsconfig.json" ||
    lower.includes("server") ||
    lower.includes("app") ||
    lower.includes("index")
  )
    return "scaffold-writer";

  return "scaffold-writer";
}
