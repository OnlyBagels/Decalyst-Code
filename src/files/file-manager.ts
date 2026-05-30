import * as fs from "node:fs/promises";
import * as path from "node:path";
import { sha256 } from "./hashing.js";
import {
  captureSnapshot,
  restoreSnapshot,
  type Snapshot,
} from "./snapshots.js";
import { assertPathAllowed, resolveWorkspacePath } from "./path-policy.js";
import type { FileEdit } from "../types/agent.js";

export class FileManager {
  constructor(private readonly workspaceRoot: string) {}

  resolve(relativePath: string): string {
    return resolveWorkspacePath(this.workspaceRoot, relativePath);
  }

  async read(relativePath: string): Promise<string | null> {
    try {
      return await fs.readFile(this.resolve(relativePath), "utf8");
    } catch {
      return null;
    }
  }

  async exists(relativePath: string): Promise<boolean> {
    try {
      await fs.access(this.resolve(relativePath));
      return true;
    } catch {
      return false;
    }
  }

  async hash(relativePath: string): Promise<string | null> {
    const content = await this.read(relativePath);
    if (content === null) return null;
    return sha256(content);
  }

  async write(relativePath: string, content: string): Promise<void> {
    assertPathAllowed(relativePath);
    const absPath = this.resolve(relativePath);
    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, content, "utf8");
  }

  async snapshot(relativePaths: string[]): Promise<Snapshot> {
    const absPaths = relativePaths.map((p) => this.resolve(p));
    return captureSnapshot(absPaths);
  }

  async restore(snapshot: Snapshot): Promise<void> {
    return restoreSnapshot(snapshot);
  }

  async applyFullFileEdits(edits: FileEdit[]): Promise<void> {
    for (const edit of edits) {
      assertPathAllowed(edit.path);
      await this.write(edit.path, edit.fullContent);
    }
  }

  async glob(pattern: string): Promise<string[]> {
    // Simple recursive listing; for glob support we walk the tree.
    const results: string[] = [];
    await walk(this.workspaceRoot, this.workspaceRoot, results);
    const regex = globToRegex(pattern);
    return results.filter((r) => regex.test(r));
  }
}

interface SimpleDirent {
  name: string;
  isDirectory(): boolean;
}

async function walk(
  root: string,
  dir: string,
  results: string[],
): Promise<void> {
  let entries: SimpleDirent[];
  try {
    entries = (await fs.readdir(dir, {
      withFileTypes: true,
    })) as unknown as SimpleDirent[];
  } catch {
    return;
  }
  for (const entry of entries) {
    const name = String(entry.name);
    const full = path.join(dir, name);
    const rel = path.relative(root, full).replace(/\\/g, "/");
    if (
      name === "node_modules" ||
      name === "dist" ||
      name === ".git" ||
      name === "runs"
    ) {
      continue;
    }
    if (entry.isDirectory()) {
      await walk(root, full, results);
    } else {
      results.push(rel);
    }
  }
}

function globToRegex(pattern: string): RegExp {
  // `**/` matches zero or more path segments (including the empty prefix), so
  // `**/*.ts` matches both `main.ts` and `src/lib/main.ts`. Standalone `**`
  // matches anything across slashes. A single `*` matches non-slash chars.
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*\//g, "%%DOUBLESTAR_SLASH%%")
    .replace(/\*\*/g, "%%DOUBLESTAR%%")
    .replace(/\*/g, "[^/]*")
    .replace(/%%DOUBLESTAR_SLASH%%/g, "(?:.*/)?")
    .replace(/%%DOUBLESTAR%%/g, ".*");
  return new RegExp(`^${escaped}$`);
}
