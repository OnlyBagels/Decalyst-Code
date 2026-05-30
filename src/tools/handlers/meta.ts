import * as fs from "node:fs/promises";
import * as path from "node:path";
import { z } from "zod";
import type { ToolRegistry } from "../registry.js";
import type { ToolCtx } from "../schemas.js";
import type { EventBus } from "../../events/bus.js";
import type { ModeController } from "../../modes/mode-controller.js";

const ASK_USER_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export interface MetaDeps {
  modeController: ModeController;
  bus: EventBus;
  tracesDir: string;
}

export function registerMetaTools(registry: ToolRegistry, deps: MetaDeps): void {
  const { modeController, bus, tracesDir } = deps;

  // ask_user: emit event and await response
  registry.register({
    name: "ask_user",
    description: "Ask the user a question and wait for response",
    agent: "orchestrator",
    schema: z.object({
      question: z.string(),
      options: z.array(z.string()).optional(),
    }),
    handler: async (args, ctx) => {
      const { question, options } = args;

      const promise = new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("ask_user timeout"));
        }, ASK_USER_TIMEOUT_MS);

        bus.emit({
          t: "ask_user",
          question,
          options,
          resolve: (answer: string) => {
            clearTimeout(timeout);
            resolve(answer);
          },
        });
      });

      const answer = await promise;
      return { answer };
    },
  });

  // finalize: write report and mark run successful
  registry.register({
    name: "finalize",
    description: "Write final report and mark run as successful",
    agent: "orchestrator",
    schema: z.object({
      report: z.string(),
      passed: z.boolean().optional(),
    }),
    filesAccessed: () => [],
    handler: async (args) => {
      const { report, passed = true } = args;

      await fs.mkdir(tracesDir, { recursive: true });
      const reportPath = path.join(tracesDir, "final-report.md");
      await fs.writeFile(reportPath, report, "utf8");

      await modeController.transition("done");
      bus.emit({ t: "run_finished", passed });

      return { ok: true, terminal: "finalize" };
    },
  });

  // bail: write failure report and mark run failed
  registry.register({
    name: "bail",
    description: "Fail the run with a reason",
    agent: "orchestrator",
    schema: z.object({
      reason: z.string(),
    }),
    filesAccessed: () => [],
    handler: async (args) => {
      const { reason } = args;

      const report = `# BAIL\n\n${reason}`;
      await fs.mkdir(tracesDir, { recursive: true });
      const reportPath = path.join(tracesDir, "final-report.md");
      await fs.writeFile(reportPath, report, "utf8");

      await modeController.transition("failed");
      bus.emit({ t: "run_finished", passed: false });

      return { ok: true, terminal: "bail" };
    },
  });
}
