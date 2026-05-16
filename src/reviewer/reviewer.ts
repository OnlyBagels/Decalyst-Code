import { z } from "zod";
import { extractJsonObject } from "../utils/json.js";
import { OrchestratorError } from "../utils/errors.js";
import type { ModelClient } from "../models/model-client.js";

export interface ReviewFix {
  filePath: string;
  issue: string;
  suggestion: string;
}

export interface ReviewResult {
  verdict: "approved" | "fix";
  summary: string;
  fixes: ReviewFix[];
}

const reviewResultSchema = z.object({
  verdict: z.enum(["approved", "fix"]),
  summary: z.string(),
  fixes: z
    .array(
      z.object({
        filePath: z.string().min(1),
        issue: z.string().min(1),
        suggestion: z.string().min(1),
      }),
    )
    .default([]),
});

const REVIEWER_SYSTEM_PROMPT = `You are a senior code reviewer.

You receive the user's original goal and the files the coding swarm produced.
Evaluate whether the code correctly and completely fulfills the goal.

Output JSON only — no markdown, no explanation, no prose.

Required JSON schema:
{
  "verdict": "approved | fix",
  "summary": "one sentence overall assessment",
  "fixes": [
    {
      "filePath": "src/path/to/file.ts",
      "issue": "specific functional problem",
      "suggestion": "exactly how to fix it — workers will act on this directly"
    }
  ]
}

Rules:
- verdict "approved" if the code is correct, complete, and fulfills the goal
- verdict "fix" if there are real functional problems (missing logic, broken types, incomplete implementation)
- Do not flag style or nitpicks — only real correctness issues
- fixes[] must be empty when verdict is "approved"
- Be concrete: workers read issue and suggestion as task instructions
- Output JSON only`;

export class Reviewer {
  constructor(
    private readonly client: ModelClient,
    private readonly model: string,
  ) {}

  async review(
    goal: string,
    changedFiles: { path: string; content: string }[],
  ): Promise<ReviewResult> {
    const filesSection = changedFiles
      .map(
        (f) =>
          `### ${f.path}\n\`\`\`typescript\n${f.content.slice(0, 3000)}\n\`\`\``,
      )
      .join("\n\n");

    const userContent = `Goal: ${goal}\n\nFiles produced by the swarm:\n\n${filesSection}`;

    const raw = await this.client.completeJson({
      model: this.model,
      messages: [
        { role: "system", content: REVIEWER_SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      temperature: 0.1,
      maxTokens: 2000,
    });

    const extracted = extractJsonObject(raw);
    const parsed = reviewResultSchema.safeParse(extracted);

    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      throw new OrchestratorError(
        `Reviewer produced invalid result: ${issues}`,
      );
    }

    return parsed.data;
  }
}
