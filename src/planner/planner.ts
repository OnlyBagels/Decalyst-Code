import { projectPlanSchema } from "../patches/schemas.js";
import { extractJsonObject } from "../utils/json.js";
import { OrchestratorError } from "../utils/errors.js";
import type { ModelClient } from "../models/model-client.js";
import type { ProjectPlan } from "../types/plan.js";

const PLANNER_SYSTEM_PROMPT = `You are Decalyst-Planner, an expert TypeScript project architect.

Your job is to decompose a user's coding goal into a structured project plan.
Output JSON only — no markdown, no explanation, no prose.

Required JSON schema:
{
  "projectName": "string",
  "framework": "fastify | express | hono",
  "packageManager": "npm",
  "dependencies": { "packageName": "semver" },
  "devDependencies": { "packageName": "semver" },
  "files": [
    {
      "path": "string (e.g. src/routes/users.ts)",
      "role": "scaffold-writer | route-writer | schema-writer | service-writer | test-writer | fixer | refactor-worker | docs-worker",
      "purpose": "one sentence describing exactly what this file must implement",
      "dependsOn": ["path/to/other/file.ts"]
    }
  ],
  "constraints": ["string — project-wide rules every worker must follow"]
}

Rules:
- Use TypeScript strict mode, ESM (import/export)
- Use Zod for runtime validation
- Use vitest for tests
- List every file the workers need to write — do not omit entry points
- dependsOn must only reference paths that exist in files[]
- purpose must be specific enough for a worker to act on without asking questions
- Output JSON only — no other text`;

export class Planner {
  constructor(
    private readonly client: ModelClient,
    private readonly model: string,
  ) {}

  async plan(goal: string, workspaceSummary?: string): Promise<ProjectPlan> {
    const userContent = workspaceSummary
      ? `Goal: ${goal}\n\nExisting workspace:\n${workspaceSummary}`
      : `Goal: ${goal}`;

    const raw = await this.client.completeJson({
      model: this.model,
      messages: [
        { role: "system", content: PLANNER_SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      temperature: 0.2,
      maxTokens: 4000,
    });

    const extracted = extractJsonObject(raw);
    const parsed = projectPlanSchema.safeParse(extracted);

    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      throw new OrchestratorError(`Planner produced invalid plan: ${issues}`);
    }

    return parsed.data as ProjectPlan;
  }
}
