import * as fs from "node:fs/promises";
import * as path from "node:path";

export interface Snapshot {
  files: Map<string, string | null>; // absolutePath -> content | null (didn't exist)
}

/**
 * Captures current content of the given absolute paths before a write.
 * If a file doesn't exist, records null so restore can delete it.
 */
export async function captureSnapshot(
  absolutePaths: string[],
): Promise<Snapshot> {
  const files = new Map<string, string | null>();

  for (const p of absolutePaths) {
    try {
      const content = await fs.readFile(p, "utf8");
      files.set(p, content);
    } catch {
      files.set(p, null);
    }
  }

  return { files };
}

/**
 * Restores files to their snapshotted state.
 * Files that did not exist before are deleted.
 */
export async function restoreSnapshot(snapshot: Snapshot): Promise<void> {
  for (const [p, content] of snapshot.files) {
    if (content === null) {
      try {
        await fs.unlink(p);
      } catch {
        // File may already be gone — that's fine.
      }
    } else {
      await fs.mkdir(path.dirname(p), { recursive: true });
      await fs.writeFile(p, content, "utf8");
    }
  }
}
