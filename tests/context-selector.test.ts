import { describe, it, expect, beforeEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { FileManager } from "../src/files/file-manager.js";
import { ContextSelector } from "../src/context/context-selector.js";
import type { AgentTask, ProjectContext } from "../src/types/agent.js";

const projectContext: ProjectContext = {
  packageManager: "npm",
  framework: "fastify",
  testFramework: "vitest",
  validationLibrary: "zod",
  moduleSystem: "esm",
  strictTypeScript: true,
};

describe("ContextSelector", () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "swarm-ctx-"));
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      JSON.stringify({ name: "x", dependencies: { fastify: "^4" } }),
    );
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "src/server.ts"),
      "import { router } from './routes.js';\nexport const x = 1;\n",
    );
    await fs.writeFile(
      path.join(workspaceRoot, "src/routes.ts"),
      "export const router = {};\n",
    );
  });

  it("includes package.json and target file", async () => {
    const fm = new FileManager(workspaceRoot);
    const cs = new ContextSelector(fm, workspaceRoot);

    const task: AgentTask = {
      id: "task-001",
      role: "route-writer",
      title: "Edit server",
      goal: "x",
      targetFiles: ["src/server.ts"],
      fileContexts: [],
      constraints: [],
      projectContext,
      limits: { maxFilesToEdit: 1, maxOutputChars: 10000 },
      dependencies: [],
      status: "pending",
      attempt: 0,
    };

    const ctx = await cs.select(task);
    const paths = ctx.map((c) => c.path);
    expect(paths).toContain("package.json");
    expect(paths).toContain("src/server.ts");
  });

  it("includes imported files for ts targets", async () => {
    const fm = new FileManager(workspaceRoot);
    const cs = new ContextSelector(fm, workspaceRoot);

    const task: AgentTask = {
      id: "task-001",
      role: "route-writer",
      title: "Edit server",
      goal: "x",
      targetFiles: ["src/server.ts"],
      fileContexts: [],
      constraints: [],
      projectContext,
      limits: { maxFilesToEdit: 1, maxOutputChars: 10000 },
      dependencies: [],
      status: "pending",
      attempt: 0,
    };

    const ctx = await cs.select(task);
    const paths = ctx.map((c) => c.path);
    expect(paths).toContain("src/routes.ts");
  });
});
