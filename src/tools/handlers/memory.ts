import { z } from "zod";
import type { ToolRegistry } from "../registry.js";
import type { Scratchpad } from "../../state/scratchpad.js";
import type { PriorRunsSearch } from "../../services/prior-runs.js";

export interface MemoryDeps {
  scratchpad: Scratchpad;
  priorRuns: PriorRunsSearch;
}

export function registerMemoryTools(registry: ToolRegistry, deps: MemoryDeps): void {
  const { scratchpad, priorRuns } = deps;

  registry.register({
    name: "scratchpad_read",
    description: "Read the scratchpad for persistent notes across fixer rounds",
    agent: "orchestrator",
    schema: z.object({}),
    handler: async () => {
      const content = await scratchpad.read();
      return { content };
    },
  });

  registry.register({
    name: "scratchpad_write",
    description: "Overwrite the scratchpad with new content",
    agent: "orchestrator",
    schema: z.object({
      content: z.string(),
    }),
    handler: async (args) => {
      const { content } = args;
      await scratchpad.write(content);
      return { ok: true };
    },
  });

  registry.register({
    name: "scratchpad_append",
    description: "Append a line to the scratchpad",
    agent: "orchestrator",
    schema: z.object({
      line: z.string(),
    }),
    handler: async (args) => {
      const { line } = args;
      await scratchpad.append(line);
      return { ok: true };
    },
  });

  registry.register({
    name: "prior_runs_search",
    description: "Search prior run history for matches",
    agent: "orchestrator",
    schema: z.object({
      query: z.string(),
      limit: z.number().int().positive().optional().default(10),
    }),
    handler: async (args) => {
      const { query, limit } = args;
      const results = await priorRuns.search(query, limit);
      return { results };
    },
  });
}
