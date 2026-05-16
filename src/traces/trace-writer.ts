import * as fs from "node:fs/promises";
import * as path from "node:path";
import { safeStringify } from "../utils/json.js";
import type {
  AgentTask,
  AgentResult,
  PatchResult,
  TestResult,
} from "../types/agent.js";
import type { ProjectPlan } from "../types/plan.js";

export class TraceWriter {
  constructor(private readonly traceDir: string) {}

  async init(): Promise<void> {
    await fs.mkdir(this.traceDir, { recursive: true });
    await fs.mkdir(path.join(this.traceDir, "model-calls"), {
      recursive: true,
    });
    await fs.mkdir(path.join(this.traceDir, "patches"), { recursive: true });
    await fs.mkdir(path.join(this.traceDir, "command-results"), {
      recursive: true,
    });
  }

  async writeRequest(userRequest: string): Promise<void> {
    await fs.writeFile(
      path.join(this.traceDir, "request.md"),
      `# User Request\n\n${userRequest}\n`,
      "utf8",
    );
  }

  async writePlan(plan: ProjectPlan): Promise<void> {
    await fs.writeFile(
      path.join(this.traceDir, "plan.json"),
      safeStringify(plan),
      "utf8",
    );
  }

  async writeTasks(tasks: AgentTask[]): Promise<void> {
    await fs.writeFile(
      path.join(this.traceDir, "tasks.json"),
      safeStringify(tasks),
      "utf8",
    );
  }

  async writeWorkerCall(
    taskId: string,
    attempt: number,
    systemPrompt: string,
    userPrompt: string,
    rawResponse: string,
    parsed: AgentResult | null,
  ): Promise<void> {
    const safeId = sanitizeId(taskId);
    const base = path.join(
      this.traceDir,
      "model-calls",
      `${safeId}.${attempt}`,
    );
    await fs.writeFile(`${base}.system.txt`, systemPrompt, "utf8");
    await fs.writeFile(`${base}.user.txt`, userPrompt, "utf8");
    await fs.writeFile(`${base}.response.txt`, rawResponse, "utf8");
    if (parsed) {
      await fs.writeFile(`${base}.parsed.json`, safeStringify(parsed), "utf8");
    }
  }

  async writePatchResult(taskId: string, result: PatchResult): Promise<void> {
    await fs.writeFile(
      path.join(this.traceDir, "patches", `${sanitizeId(taskId)}.json`),
      safeStringify(result),
      "utf8",
    );
  }

  async writeCommandResult(name: string, result: TestResult): Promise<void> {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    await fs.writeFile(
      path.join(this.traceDir, "command-results", `${name}-${stamp}.json`),
      safeStringify(result),
      "utf8",
    );
  }

  async writeFinalReport(report: string): Promise<void> {
    await fs.writeFile(
      path.join(this.traceDir, "final-report.md"),
      report,
      "utf8",
    );
  }

  static buildRunId(): string {
    return new Date().toISOString().replace(/[:.]/g, "-");
  }
}

function sanitizeId(id: string): string {
  return id.replace(/[\\/:*?"<>|]/g, "_");
}
