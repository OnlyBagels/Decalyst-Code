import { describe, it, expect, beforeEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { FileManager } from "../src/files/file-manager.js";
import { PatchManager } from "../src/patches/patch-manager.js";
import type { AgentTask, ProjectContext } from "../src/types/agent.js";

const projectContext: ProjectContext = {
  packageManager: "npm",
  framework: "fastify",
  testFramework: "vitest",
  validationLibrary: "zod",
  moduleSystem: "esm",
  strictTypeScript: true,
};

function buildTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: "task-001",
    role: "scaffold-writer",
    title: "Write src/server.ts",
    goal: "Create a minimal server file",
    targetFiles: ["src/server.ts"],
    fileContexts: [],
    constraints: [],
    projectContext,
    limits: { maxFilesToEdit: 1, maxOutputChars: 10000 },
    dependencies: [],
    status: "pending",
    attempt: 0,
    ...overrides,
  };
}

describe("PatchManager", () => {
  let workspaceRoot: string;
  let fm: FileManager;
  let pm: PatchManager;

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "swarm-test-"));
    fm = new FileManager(workspaceRoot);
    pm = new PatchManager(fm);
  });

  it("applies a valid edit and writes the file", async () => {
    const task = buildTask();
    const result = {
      taskId: "task-001",
      role: "scaffold-writer" as const,
      status: "success" as const,
      edits: [
        {
          mode: "create" as const,
          path: "src/server.ts",
          fullContent: "export const port = 3000;\n",
        },
      ],
      blockers: [],
    };

    const patchResult = await pm.validateAndApply(task, result);
    expect(patchResult.applied).toBe(true);
    expect(patchResult.editsApplied).toHaveLength(1);

    const written = await fs.readFile(
      path.join(workspaceRoot, "src/server.ts"),
      "utf8",
    );
    expect(written).toBe("export const port = 3000;\n");
  });

  it("rejects edit on a non-target file", async () => {
    const task = buildTask({ targetFiles: ["src/server.ts"] });
    const result = {
      taskId: "task-001",
      role: "scaffold-writer" as const,
      status: "success" as const,
      edits: [
        {
          mode: "create" as const,
          path: "src/other.ts",
          fullContent: "export const x = 1;\n",
        },
      ],
      blockers: [],
    };

    const patchResult = await pm.validateAndApply(task, result);
    expect(patchResult.applied).toBe(false);
    expect(patchResult.rejectedEdits[0]?.path).toBe("src/other.ts");
  });

  it("rejects mismatched taskId", async () => {
    const task = buildTask();
    const result = {
      taskId: "wrong-id",
      role: "scaffold-writer" as const,
      status: "success" as const,
      edits: [
        {
          mode: "create" as const,
          path: "src/server.ts",
          fullContent: "export const x = 1;\n",
        },
      ],
      blockers: [],
    };

    const patchResult = await pm.validateAndApply(task, result);
    expect(patchResult.applied).toBe(false);
    expect(patchResult.validationErrors.some((e) => e.includes("taskId"))).toBe(
      true,
    );
  });

  it("rolls back on TypeScript parse failure", async () => {
    const task = buildTask();
    const result = {
      taskId: "task-001",
      role: "scaffold-writer" as const,
      status: "success" as const,
      edits: [
        {
          mode: "create" as const,
          path: "src/server.ts",
          fullContent: "this is { not valid TypeScript [[[",
        },
      ],
      blockers: [],
    };

    const patchResult = await pm.validateAndApply(task, result);
    expect(patchResult.applied).toBe(false);
    expect(patchResult.rolledBack).toBe(true);

    // File must not exist on disk after rollback
    await expect(
      fs.access(path.join(workspaceRoot, "src/server.ts")),
    ).rejects.toThrow();
  });
});
