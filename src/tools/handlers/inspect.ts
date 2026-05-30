import * as fs from "node:fs/promises";
import * as nodePath from "node:path";
import { z } from "zod";
import type { ToolRegistry } from "../registry.js";
import type { CodeIndex } from "../../services/code-index/index.js";
import type { FileManager } from "../../files/file-manager.js";
import { assertPathAllowed } from "../../files/path-policy.js";

export interface InspectDeps {
  codeIndex: CodeIndex;
  fileManager: FileManager;
  workspaceRoot: string;
}

export function registerInspectTools(
  registry: ToolRegistry,
  deps: InspectDeps,
): void {
  const { codeIndex, fileManager, workspaceRoot } = deps;

  registry.register({
    name: "glob",
    description: "Find files matching a glob pattern. Excludes node_modules, .git, dist, build, coverage, runs.",
    agent: "orchestrator",
    schema: z.object({ pattern: z.string() }),
    handler: async ({ pattern }) => {
      const results: string[] = [];
      await walkForGlob(workspaceRoot, workspaceRoot, results);
      const regex = globToRegex(pattern);
      return results.filter((r) => regex.test(r));
    },
  });

  registry.register({
    name: "grep",
    description: "Search for a pattern across files. Returns matching lines with path, line number, column, and text.",
    agent: "orchestrator",
    schema: z.object({
      pattern: z.string(),
      glob: z.string().optional(),
      caseInsensitive: z.boolean().optional(),
      maxMatches: z.number().int().positive().optional(),
    }),
    handler: async ({ pattern, glob, caseInsensitive, maxMatches }) => {
      const query = codeIndex.getQuery();
      const flags = caseInsensitive ? "gi" : "g";

      const textHits = await query.searchText(pattern, glob);
      const cap = maxMatches ?? Infinity;
      const hits = textHits.slice(0, cap === Infinity ? undefined : cap);

      return hits.map((h) => ({
        path: h.filePath,
        line: h.line,
        column: h.column,
        text: h.text,
      }));
    },
  });

  registry.register({
    name: "read_file",
    description: "Read a file's content. Optional offset (1-based line) and limit restrict the returned lines.",
    agent: "orchestrator",
    schema: z.object({
      path: z.string(),
      offset: z.number().int().min(1).optional(),
      limit: z.number().int().positive().optional(),
    }),
    filesAccessed: ({ path: p }) => [p],
    handler: async ({ path: rawPath, offset, limit }) => {
      assertPathAllowed(rawPath);
      const content = await fileManager.read(rawPath);
      if (content === null) {
        throw new Error(`File not found: ${rawPath}`);
      }
      if (offset === undefined && limit === undefined) {
        return content;
      }
      const lines = content.split("\n");
      const start = (offset ?? 1) - 1;
      const end = limit !== undefined ? start + limit : undefined;
      return lines.slice(start, end).join("\n");
    },
  });

  registry.register({
    name: "outline",
    description: "Return the symbol outline (exported names, kinds, signatures) for a file.",
    agent: "orchestrator",
    schema: z.object({ path: z.string() }),
    handler: async ({ path: rawPath }) => {
      const absPath = nodePath.resolve(workspaceRoot, rawPath);
      return codeIndex.getQuery().outline(absPath);
    },
  });

  registry.register({
    name: "find_symbol",
    description: "Search the code index for a symbol by name. Returns file path, kind, and signature.",
    agent: "orchestrator",
    schema: z.object({
      name: z.string(),
      limit: z.number().int().positive().optional(),
    }),
    handler: async ({ name, limit }) => {
      return codeIndex.getQuery().findSymbol(name, limit);
    },
  });

  registry.register({
    name: "import_graph",
    description: "Return import edges for a file, or all edges in the workspace if no file is given.",
    agent: "orchestrator",
    schema: z.object({
      file: z.string().optional(),
    }),
    handler: async ({ file }) => {
      const absFile = file !== undefined
        ? nodePath.resolve(workspaceRoot, file)
        : undefined;
      return codeIndex.getQuery().importGraph(absFile);
    },
  });

  registry.register({
    name: "read_dts",
    description: "Read the type declarations for an npm package. If symbol is set, extract just that export's declaration.",
    agent: "orchestrator",
    schema: z.object({
      package: z.string(),
      symbol: z.string().optional(),
    }),
    handler: async ({ package: pkg, symbol }) => {
      const dtsPath = await resolveDtsPath(workspaceRoot, pkg);
      if (dtsPath === null) {
        throw new Error(`No declaration file found for package: ${pkg}`);
      }

      const content = await fs.readFile(dtsPath, "utf8");

      if (symbol === undefined) {
        return content;
      }

      const lines = content.split("\n");
      const matchingLines: string[] = [];
      let capturing = false;
      let braceDepth = 0;

      for (const line of lines) {
        if (!capturing) {
          if (line.includes(`export`) && line.includes(symbol)) {
            capturing = true;
            matchingLines.push(line);
            braceDepth = countBraces(line);
            if (braceDepth === 0) {
              capturing = false;
            }
          }
        } else {
          matchingLines.push(line);
          braceDepth += countBraces(line);
          if (braceDepth <= 0) {
            capturing = false;
          }
        }
      }

      return matchingLines.length > 0
        ? matchingLines.join("\n")
        : `Symbol "${symbol}" not found in ${pkg} declarations`;
    },
  });
}

function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "%%DS%%")
    .replace(/\*/g, "[^/]*")
    .replace(/%%DS%%/g, ".*");
  return new RegExp(`^${escaped}$`);
}

async function walkForGlob(
  root: string,
  dir: string,
  results: string[],
): Promise<void> {
  let entries: Array<{ name: string; isDirectory(): boolean }>;
  try {
    entries = (await fs.readdir(dir, { withFileTypes: true })) as typeof entries;
  } catch {
    return;
  }

  for (const entry of entries) {
    const name = String(entry.name);
    if (
      name === "node_modules" ||
      name === ".git" ||
      name === "dist" ||
      name === "build" ||
      name === "coverage" ||
      name === "runs"
    ) {
      continue;
    }
    const full = nodePath.join(dir, name);
    const rel = nodePath.relative(root, full).replace(/\\/g, "/");
    if (entry.isDirectory()) {
      await walkForGlob(root, full, results);
    } else {
      results.push(rel);
    }
  }
}

async function resolveDtsPath(
  workspaceRoot: string,
  pkg: string,
): Promise<string | null> {
  const pkgDir = nodePath.join(workspaceRoot, "node_modules", pkg);

  const pkgJsonPath = nodePath.join(pkgDir, "package.json");
  try {
    const raw = await fs.readFile(pkgJsonPath, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const typesField = parsed["types"] ?? parsed["typings"];
    if (typeof typesField === "string") {
      const candidate = nodePath.resolve(pkgDir, typesField);
      try {
        await fs.access(candidate);
        return candidate;
      } catch {
      }
    }
  } catch {
  }

  const indexDts = nodePath.join(pkgDir, "index.d.ts");
  try {
    await fs.access(indexDts);
    return indexDts;
  } catch {
  }

  return null;
}

function countBraces(line: string): number {
  let count = 0;
  for (const ch of line) {
    if (ch === "{") count++;
    else if (ch === "}") count--;
  }
  return count;
}
