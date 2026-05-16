import * as fs from "node:fs/promises";
import * as path from "node:path";
import { FileManager } from "../files/file-manager.js";

export interface RepoSummary {
  files: string[];
  packageJson: Record<string, unknown> | null;
  tsconfigJson: Record<string, unknown> | null;
  hasTypeScript: boolean;
  hasTests: boolean;
}

export async function getRepoSummary(
  fm: FileManager,
  workspaceRoot: string,
): Promise<RepoSummary> {
  const files = await fm.glob("**/*");

  let packageJson: Record<string, unknown> | null = null;
  const pkgRaw = await fm.read("package.json");
  if (pkgRaw) {
    try {
      packageJson = JSON.parse(pkgRaw) as Record<string, unknown>;
    } catch {
      // ignore
    }
  }

  let tsconfigJson: Record<string, unknown> | null = null;
  const tscRaw = await fm.read("tsconfig.json");
  if (tscRaw) {
    try {
      tsconfigJson = JSON.parse(tscRaw) as Record<string, unknown>;
    } catch {
      // ignore
    }
  }

  const hasTypeScript = files.some(
    (f) => f.endsWith(".ts") || f.endsWith(".tsx"),
  );
  const hasTests = files.some((f) => f.includes("test") || f.includes("spec"));

  return { files, packageJson, tsconfigJson, hasTypeScript, hasTests };
}

export function formatRepoSummaryForPrompt(summary: RepoSummary): string {
  const lines: string[] = [];

  lines.push("## Workspace files");
  for (const f of summary.files.slice(0, 60)) {
    lines.push(`  ${f}`);
  }
  if (summary.files.length > 60) {
    lines.push(`  ... and ${summary.files.length - 60} more`);
  }

  if (summary.packageJson) {
    const pkg = summary.packageJson;
    lines.push("\n## package.json (summary)");
    lines.push(`  name: ${String(pkg["name"] ?? "")}`);
    lines.push(
      `  dependencies: ${Object.keys((pkg["dependencies"] as Record<string, string> | undefined) ?? {}).join(", ") || "none"}`,
    );
    lines.push(
      `  devDependencies: ${Object.keys((pkg["devDependencies"] as Record<string, string> | undefined) ?? {}).join(", ") || "none"}`,
    );
    const scripts = pkg["scripts"] as Record<string, string> | undefined;
    if (scripts) {
      lines.push(`  scripts: ${Object.keys(scripts).join(", ")}`);
    }
  }

  return lines.join("\n");
}
