import { extractJsonObject } from "../utils/json.js";
import { OrchestratorError, toMessage } from "../utils/errors.js";
import { projectPlanSchema } from "../patches/schemas.js";
import { getDefaultOrchestratorModel } from "../models/orchestrator-client.js";
import type { ModelClient } from "../models/model-client.js";
import type { ProjectPlan } from "../types/plan.js";

const PLANNER_SYSTEM_PROMPT = `You are the orchestrator for decalyst-swarm.

Your job is to take a user's natural-language request and turn it into a
concrete plan that small, narrow worker LLMs can execute one file at a time.

The project may be in ANY language or format: TypeScript, Python, Go, Rust,
HTML, CSS, plain text — whatever fits the request best. Choose the smallest
sensible set of files. A single-file deliverable (e.g. one HTML page) gets
ONE file in "files".

Hard rules:
- Output ONE JSON object. No markdown. No prose.
- 1 to 12 files maximum. Smaller is better.
- Workers edit ONE file each; pick roles accordingly.
- Order files by dependency in the array AND populate "dependsOn" with paths.
- Forbidden paths: .env (not .env.example), .git/**, node_modules/**, dist/**,
  build/**, lock files. Anything else is fair game.
- Do not invent novel libraries. If a runtime/framework is needed, pick one
  the worker can plausibly write.

Required JSON schema:
{
  "projectName": "string",
  "projectKind":   "string (optional, e.g. 'static-html', 'fastify-api', 'cli-tool')",
  "framework":     "string (optional, e.g. 'fastify', 'react', 'none')",
  "packageManager":"string (optional, e.g. 'npm', 'pip', or omit)",
  "dependencies":   { "name": "version" } (optional),
  "devDependencies":{ "name": "version" } (optional),
  "files": [
    {
      "path": "string (relative, forward slashes)",
      "role": "scaffold-writer | route-writer | schema-writer | service-writer | test-writer | fixer | refactor-worker | docs-worker",
      "purpose": "string — one sentence specific enough for a worker to act on",
      "dependsOn": ["other file path", ...]  (optional)
    }
  ],
  "constraints": ["string (project-wide rules)"]  (optional)
}

Role guidance:
- scaffold-writer: bootstrapping files, entry points, config, HTML pages, single-file deliverables
- route-writer:    HTTP route handlers
- schema-writer:   schemas, types, data shapes
- service-writer:  business logic, services, utilities
- test-writer:     tests
- docs-worker:     READMEs, documentation
- refactor-worker / fixer: only used by later phases, do not include in initial plan

Use the file PATH as the implicit task identifier in "dependsOn".`;

export class Planner {
  constructor(private readonly client: ModelClient) {}

  async createPlan(userRequest: string, signal?: AbortSignal): Promise<ProjectPlan> {
    const raw = await this.client.completeText({
      model: getDefaultOrchestratorModel(),
      agent: "planner",
      messages: [
        { role: "system", content: PLANNER_SYSTEM_PROMPT },
        {
          role: "user",
          content: `User request:\n\n${userRequest}\n\nReturn the JSON plan now.`,
        },
      ],
      temperature: 0.2,
      maxTokens: 4000,
      signal,
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
