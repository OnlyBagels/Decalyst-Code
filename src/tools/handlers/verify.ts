import * as path from "node:path";
import * as fs from "node:fs/promises";
import { z } from "zod";
import type { ToolRegistry } from "../registry.js";
import type { MultiLangRunner, VerifyCommand } from "../../runners/multi-lang-runner.js";
import type { SandboxEval } from "../../services/sandbox-eval.js";

interface VerifyToolDeps {
  runner: MultiLangRunner;
  sandbox: SandboxEval;
  tracesRoot: string;
}

export function registerVerifyTools(
  registry: ToolRegistry,
  deps: VerifyToolDeps,
): void {
  const { runner, sandbox, tracesRoot } = deps;

  registry.register({
    name: "run_command",
    description: "Run a verify command (install, typecheck, test, lint, format, build) across any project type.",
    agent: "orchestrator",
    schema: z.object({
      name: z.enum(["install", "typecheck", "test", "lint", "format", "build"]),
    }),
    handler: async ({ name }) => {
      const result = await runner.run(name as VerifyCommand);
      return result;
    },
  });

  registry.register({
    name: "dry_compile",
    description: "Dry-compile a TypeScript or Python snippet to check for syntax/type errors without execution.",
    agent: "orchestrator",
    schema: z.object({
      snippet: z.string().min(1),
      language: z.enum(["ts", "python"]),
    }),
    handler: async ({ snippet, language }) => {
      if (language === "ts") {
        const result = await sandbox.dryCompileTs(snippet);
        return result;
      }

      if (language === "python") {
        const result = await sandbox.evalPython(snippet);
        return {
          ok: result.ok,
          errors: result.errors,
        };
      }

      return { ok: false, errors: ["Unknown language"] };
    },
  });

  registry.register({
    name: "read_command_output",
    description: "Read saved command output from a previous round.",
    agent: "orchestrator",
    schema: z.object({
      roundId: z.string().min(1),
      kind: z.enum(["install", "typecheck", "test", "lint", "format", "build"]).optional(),
    }),
    handler: async ({ roundId, kind }) => {
      const outputDir = path.join(tracesRoot, roundId, "command-results");

      try {
        let files: string[] = [];
        try {
          files = await fs.readdir(outputDir);
        } catch {
          return {
            found: false,
            message: `No command results for round ${roundId}`,
          };
        }

        const results: Record<string, unknown> = {};

        for (const file of files) {
          if (!file.endsWith(".json")) continue;

          const filePath = path.join(outputDir, file);
          const content = await fs.readFile(filePath, "utf8");
          const data = JSON.parse(content);

          if (kind && file !== `${kind}.json`) continue;

          const cmdName = file.replace(/\.json$/, "");
          results[cmdName] = data;
        }

        return {
          found: Object.keys(results).length > 0,
          results,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          found: false,
          error: message,
        };
      }
    },
  });

  registry.register({
    name: "diff_workspace",
    description: "Compare current workspace state to a previous snapshot.",
    agent: "orchestrator",
    schema: z.object({
      sinceRound: z.string().optional(),
    }),
    handler: async ({ sinceRound }) => {
      if (!sinceRound) {
        return {
          compared: false,
          message: "sinceRound is required",
        };
      }

      const snapshotFile = path.join(tracesRoot, sinceRound, "snapshot.json");

      try {
        const content = await fs.readFile(snapshotFile, "utf8");
        const snapshot = JSON.parse(content);

        return {
          compared: true,
          snapshot,
          message: `Loaded snapshot from round ${sinceRound}`,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          compared: false,
          error: message,
        };
      }
    },
  });
}
