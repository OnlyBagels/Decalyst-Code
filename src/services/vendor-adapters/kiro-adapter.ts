import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { AdapterContent } from "./types.js";

export class KiroAdapter {
  async discover(workspaceRoot: string): Promise<AdapterContent | null> {
    const kiroPath = path.join(workspaceRoot, ".kiro");

    try {
      await fs.access(kiroPath);
    } catch {
      return null;
    }

    const conventions: string[] = [];
    const sourcePaths: string[] = [];

    try {
      const entries = await fs.readdir(kiroPath, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(".md")) continue;

        try {
          const content = await fs.readFile(
            path.join(kiroPath, entry.name),
            "utf8",
          );
          conventions.push(content.trim());
          sourcePaths.push(`.kiro/${entry.name}`);
        } catch {
          console.warn(`Failed to read .kiro/${entry.name}`);
        }
      }
    } catch (err) {
      console.warn(`Failed to read .kiro/ directory: ${err}`);
      return null;
    }

    if (conventions.length === 0) {
      return null;
    }

    return {
      vendor: "kiro",
      skills: [],
      memory: [],
      conventions,
      sourcePaths,
    };
  }
}
