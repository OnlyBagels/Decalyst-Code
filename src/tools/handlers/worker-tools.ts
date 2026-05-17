import { z } from "zod";
import { assertPathAllowed } from "../../files/path-policy.js";
import { PathPolicyError } from "../../utils/errors.js";
import type { ToolRegistry } from "../registry.js";
import type { CodeIndex } from "../../services/code-index/index.js";
import type { FileManager } from "../../files/file-manager.js";

interface WorkerToolDeps {
  codeIndex: CodeIndex;
  fileManager: FileManager;
}

export function registerWorkerTools(
  registry: ToolRegistry,
  deps: WorkerToolDeps,
): void {
  const { codeIndex, fileManager } = deps;

  registry.register({
    name: "peek_signature",
    description: "Fetch type signatures for a symbol from the code index.",
    agent: "swarm",
    schema: z.object({
      symbol: z.string().min(1),
      limit: z.number().int().positive().optional(),
    }),
    handler: async ({ symbol, limit }) => {
      const hits = codeIndex.getQuery().findSymbol(symbol, limit);
      return hits;
    },
  });

  registry.register({
    name: "edit_file",
    description: "Replace an exact string in a file. Fails if old_string is absent or not unique.",
    agent: "swarm",
    schema: z.object({
      path: z.string().min(1),
      old_string: z.string(),
      new_string: z.string(),
    }),
    filesAccessed: ({ path }) => [path],
    handler: async ({ path, old_string, new_string }) => {
      let normalized: string;
      try {
        normalized = assertPathAllowed(path);
      } catch (err) {
        if (err instanceof PathPolicyError) {
          throw new Error(`Path denied: ${err.message}`);
        }
        throw err;
      }

      const content = await fileManager.read(normalized);
      if (content === null) {
        throw new Error(`File not found: ${path}`);
      }

      const count = occurrenceCount(content, old_string);

      if (count === 0) {
        throw new Error(`old_string not found in ${path}`);
      }

      if (count > 1) {
        const positions = findPositions(content, old_string);
        throw new Error(
          `old_string is not unique (${count} matches at positions ${positions.join(", ")}) in ${path}`,
        );
      }

      const updated = content.replace(old_string, new_string);
      await fileManager.write(normalized, updated);
      return { path: normalized, replaced: true };
    },
  });

  registry.register({
    name: "create_file",
    description: "Write a new file. Fails if the file already exists.",
    agent: "swarm",
    schema: z.object({
      path: z.string().min(1),
      content: z.string(),
    }),
    filesAccessed: ({ path }) => [path],
    handler: async ({ path, content }) => {
      let normalized: string;
      try {
        normalized = assertPathAllowed(path);
      } catch (err) {
        if (err instanceof PathPolicyError) {
          throw new Error(`Path denied: ${err.message}`);
        }
        throw err;
      }

      const exists = await fileManager.exists(normalized);
      if (exists) {
        throw new Error(`File already exists: ${path}`);
      }

      await fileManager.write(normalized, content);
      return { path: normalized, created: true };
    },
  });

  registry.register({
    name: "submit",
    description: "Declare the task complete.",
    agent: "swarm",
    schema: z.object({}),
    handler: async () => {
      return { ok: true, terminal: "submit" };
    },
  });

  registry.register({
    name: "report_blocker",
    description: "Escalate when the task cannot be completed.",
    agent: "swarm",
    schema: z.object({
      reason: z.string().min(1),
      suggested_action: z.string().optional(),
    }),
    handler: async ({ reason, suggested_action }) => {
      return { ok: true, terminal: "blocker", reason, suggested_action };
    },
  });
}

function occurrenceCount(haystack: string, needle: string): number {
  if (needle.length === 0) return 0;
  let count = 0;
  let pos = 0;
  while ((pos = haystack.indexOf(needle, pos)) !== -1) {
    count++;
    pos += needle.length;
  }
  return count;
}

function findPositions(haystack: string, needle: string): number[] {
  const positions: number[] = [];
  let pos = 0;
  while ((pos = haystack.indexOf(needle, pos)) !== -1) {
    positions.push(pos);
    pos += needle.length;
  }
  return positions;
}
