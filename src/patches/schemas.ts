import { z } from "zod";

export const workerRoleSchema = z.enum([
  "scaffold-writer",
  "route-writer",
  "schema-writer",
  "service-writer",
  "test-writer",
  "fixer",
  "refactor-worker",
  "docs-worker",
]);

export const fileEditSchema = z.object({
  mode: z.enum(["create", "replace"]),
  path: z.string().min(1),
  fullContent: z.string(),
  expectedSha256: z.string().optional(),
});

export const agentResultSchema = z
  .object({
    taskId: z.string().min(1),
    role: workerRoleSchema,
    status: z.enum(["success", "cannot_complete"]),
    edits: z.array(fileEditSchema).max(8),
    blockers: z.array(z.string()).default([]),
    requestedDependencies: z
      .object({
        dependencies: z.record(z.string()).optional(),
        devDependencies: z.record(z.string()).optional(),
      })
      .optional(),
  })
  .strict();

export type AgentResultSchema = z.infer<typeof agentResultSchema>;

export const projectPlanSchema = z
  .object({
    projectName: z.string().min(1),
    projectKind: z.string().nullish(),
    framework: z.string().nullish(),
    packageManager: z.string().nullish(),
    dependencies: z.record(z.string()).nullish(),
    devDependencies: z.record(z.string()).nullish(),
    files: z.array(
      z.object({
        path: z.string().min(1),
        role: workerRoleSchema,
        purpose: z.string().min(1),
        dependsOn: z.array(z.string()).nullish(),
        group: z.string().nullish(),
      }),
    ),
    constraints: z.array(z.string()).default([]),
    contract: z.string().nullish(),
  })
  .strict();

export type ProjectPlanSchema = z.infer<typeof projectPlanSchema>;
