import * as fs from "node:fs/promises";
import * as path from "node:path";

/**
 * Extremely lightweight static import scanner.
 * Finds ES module import/export-from statements in .ts files.
 * Does NOT resolve node_modules — only workspace-relative paths.
 */
export async function findDirectImports(
  workspaceRoot: string,
  relativePath: string,
): Promise<string[]> {
  const absPath = path.resolve(workspaceRoot, relativePath);
  let content: string;
  try {
    content = await fs.readFile(absPath, "utf8");
  } catch {
    return [];
  }

  const importedPaths: string[] = [];
  const importRegex =
    /(?:import|export)\s+(?:.*?\s+from\s+)?['"](\.[^'"]+)['"]/g;
  let match: RegExpExecArray | null;

  while ((match = importRegex.exec(content)) !== null) {
    const specifier = match[1];
    if (!specifier) continue;
    const resolved = resolveSpecifier(relativePath, specifier);
    if (resolved) importedPaths.push(resolved);
  }

  return [...new Set(importedPaths)];
}

function resolveSpecifier(fromFile: string, specifier: string): string | null {
  const dir = path.dirname(fromFile);
  let resolved = path.join(dir, specifier).replace(/\\/g, "/");

  // Remove .js extension that ESM requires, map back to .ts
  if (resolved.endsWith(".js")) {
    resolved = resolved.slice(0, -3) + ".ts";
  } else if (!resolved.includes(".")) {
    // Bare path without extension — assume .ts
    resolved = resolved + ".ts";
  }

  return resolved;
}
