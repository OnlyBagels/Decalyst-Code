#!/usr/bin/env node
import { Command } from "commander";
import { loadEnv } from "../utils/load-env.js";
import { runCommand } from "./commands/run.js";
import { inspectCommand } from "./commands/inspect.js";
import { chatCommand } from "./commands/chat.js";

loadEnv();

async function main(): Promise<void> {
  const program = new Command();
  program
    .name("decalyst-swarm")
    .description(
      "Frontier orchestrator (OpenRouter) + local Decalyst-TS worker pair, for one-shot TypeScript projects.",
    )
    .version("0.1.0");

  program
    .command("run")
    .description(
      'Generate a TypeScript project. Example: decalyst-swarm run "Build a Fastify todo API"',
    )
    .argument("<request>", "User request describing the project to build")
    .option(
      "--workspace <path>",
      "Workspace directory to write files into",
      "./workspace",
    )
    .option("--traces <path>", "Where run traces are stored", "./runs")
    .option(
      "--concurrency <n>",
      "Max parallel worker tasks",
      (v) => Number.parseInt(v, 10),
      Number.parseInt(process.env["DECALYST_CONCURRENCY"] ?? "2", 10),
    )
    .option(
      "--max-fix-rounds <n>",
      "Max fixer rounds after initial generation",
      (v) => Number.parseInt(v, 10),
      Number.parseInt(process.env["DECALYST_MAX_FIX_ROUNDS"] ?? "5", 10),
    )
    .action(async (request: string, options) => {
      const code = await runCommand({
        request,
        workspace: options.workspace,
        traces: options.traces,
        concurrency: options.concurrency,
        maxFixRounds: options.maxFixRounds,
      });
      process.exit(code);
    });

  program
    .command("inspect")
    .description("Print the final-report.md for a previous run")
    .argument("<runId>", "Run id (timestamp directory under ./runs)")
    .option("--traces <path>", "Where run traces are stored", "./runs")
    .action(async (runId: string, options) => {
      const code = await inspectCommand(runId, options.traces);
      process.exit(code);
    });

  program
    .command("chat")
    .description("Interactive REPL — talk to the harness")
    .option("--workspace <path>", "Workspace directory", "./workspace")
    .option("--runs <path>", "Where run traces are stored", "./runs")
    .action(async (opts) => {
      const code = await chatCommand({ workspace: opts.workspace, runs: opts.runs });
      process.exit(code);
    });

  program
    .option("--workspace <path>", "Workspace directory", "./workspace")
    .option("--runs <path>", "Where run traces are stored", "./runs")
    .action(async (opts) => {
      const code = await chatCommand({ workspace: opts.workspace, runs: opts.runs });
      process.exit(code);
    });

  await program.parseAsync(process.argv);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
