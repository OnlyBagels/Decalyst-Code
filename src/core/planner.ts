import { extractJsonObject } from "../utils/json.js";
import { OrchestratorError, toMessage } from "../utils/errors.js";
import { projectPlanSchema } from "../patches/schemas.js";
import { getDefaultOrchestratorModel } from "../models/orchestrator-client.js";
import type { ModelClient } from "../models/model-client.js";
import type { ProjectPlan } from "../types/plan.js";

const PLANNER_SYSTEM_PROMPT = `You are the orchestrator for decalyst-swarm.

Your job is to take a user's natural-language request for a TypeScript project
and turn it into a tiny, concrete plan that a 428M-parameter local TypeScript
worker model can execute one file at a time.

Hard rules:
- Output ONE JSON object. No markdown. No prose.
- 3 to 8 files maximum. Smaller is better.
- Stick to one of: fastify | express | hono.
- Use Zod for input validation if validation is needed.
- Use vitest for tests.
- Path allowlist: src/**, tests/**, README.md, package.json, tsconfig.json.
- Do not invent novel libraries. Prefer fastify, zod, typescript, tsx, vitest, @types/node.
- Workers can only edit ONE file each; choose roles accordingly.
- Order files by dependency: schemas → services → routes → server → tests → docs.

Required JSON schema:
{
  "projectName": "string",
  "framework": "fastify | express | hono",
  "packageManager": "npm",
  "dependencies":   { "name": "version" },
  "devDependencies":{ "name": "version" },
  "files": [
    {
      "path": "string (relative)",
      "role": "scaffold-writer | route-writer | schema-writer | service-writer | test-writer | fixer | refactor-worker | docs-worker",
      "purpose": "string (one sentence)",
      "dependsOn": ["task ids of files that must exist first, optional"]
    }
  ],
  "constraints": ["string"]
}

Use the file PATH as the implicit task identifier when populating "dependsOn"
(e.g. "src/schemas/user.schema.ts").`;

export class Planner {
  constructor(private readonly client: ModelClient) {}

  async createPlan(userRequest: string): Promise<ProjectPlan> {
    const raw = await this.client.completeText({
      model: getDefaultOrchestratorModel(),
      messages: [
        { role: "system", content: PLANNER_SYSTEM_PROMPT },
        {
          role: "user",
          content: `User request:\n\n${userRequest}\n\nReturn the JSON plan now.`,
        },
      ],
      temperature: 0.2,
      maxTokens: 4000,
    });

    let extracted: unknown;
    try {
      extracted = extractJsonObject(raw);
    } catch (err) {
      throw new OrchestratorError(
        `Failed to parse orchestrator plan: ${toMessage(err)}`,
      );
    }

    const parsed = projectPlanSchema.safeParse(extracted);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      throw new OrchestratorError(`Invalid project plan: ${issues}`);
    }

    return parsed.data as ProjectPlan;
  }
}
