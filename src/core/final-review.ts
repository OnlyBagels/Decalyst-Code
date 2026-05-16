import { getDefaultOrchestratorModel } from "../models/orchestrator-client.js";
import { toMessage } from "../utils/errors.js";
import type { ModelClient } from "../models/model-client.js";
import type { CheckOutcome } from "../runners/npm-runner.js";
import type { TaskQueue } from "./task-queue.js";

export interface FinalReviewArgs {
  userRequest: string;
  finalCheck: CheckOutcome | null;
  passed: boolean;
  fixRoundsUsed: number;
  queue: TaskQueue;
}

export class FinalReview {
  constructor(private readonly orchestrator: ModelClient) {}

  async write(args: FinalReviewArgs): Promise<string> {
    const stats = args.queue.stats();
    const applied = args.queue
      .all()
      .filter((t) => t.status === "applied")
      .flatMap((t) => t.targetFiles);
    const failed = args.queue.all().filter((t) => t.status === "failed");

    const factual = [
      `# Run report`,
      ``,
      `**User request:** ${args.userRequest}`,
      ``,
      `## Result`,
      `- Status: ${args.passed ? "PASSED" : "INCOMPLETE"}`,
      `- Fix rounds used: ${args.fixRoundsUsed}`,
      `- Tasks applied: ${stats.applied}`,
      `- Tasks failed: ${stats.failed}`,
      `- Tasks blocked: ${stats.blocked}`,
      ``,
      `## Files written`,
      ...applied.map((f) => `- ${f}`),
    ];

    if (failed.length > 0) {
      factual.push(``, `## Failed tasks`);
      for (const t of failed) {
        factual.push(
          `- **${t.id}** (${t.role}, attempt ${t.attempt}): ${t.failureReason ?? "unknown"}`,
        );
      }
    }

    if (args.finalCheck) {
      factual.push(``, `## Final check output`);
      for (const r of args.finalCheck.results) {
        factual.push(
          `- \`${r.command}\` exit=${r.exitCode} duration=${r.durationMs}ms`,
        );
      }
    }

    const factualReport = factual.join("\n");

    // Ask orchestrator for a brief human-readable summary on top.
    let intro = "";
    try {
      intro = await this.orchestrator.completeText({
        model: getDefaultOrchestratorModel(),
        agent: "reviewer",
        messages: [
          {
            role: "system",
            content:
              "You are summarizing the result of a code-generation run. Output 3-6 short bullet points. No headers. No markdown fence.",
          },
          {
            role: "user",
            content: `User request: ${args.userRequest}\n\nFactual report:\n${factualReport}`,
          },
        ],
        temperature: 0.3,
        maxTokens: 600,
      });
    } catch (err) {
      intro = `(orchestrator summary unavailable: ${toMessage(err)})`;
    }

    return `${factualReport}\n\n## Orchestrator summary\n\n${intro.trim()}\n`;
  }
}
