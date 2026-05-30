import { describe, it, expect } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { execPlan } from "../src/core/exec-plan.js";
import { parseProjectPlan } from "../src/core/plan-input.js";
import type { ModelClient } from "../src/models/model-client.js";

/** A worker stub that writes a trivial valid module for whatever task it gets. */
function applyingSwarm(): ModelClient {
  return {
    async completeJson({ messages }) {
      const payload = parsePayload(messages);
      return JSON.stringify({
        taskId: payload.taskId,
        role: payload.role,
        status: "success",
        edits: [
          {
            mode: "create",
            path: payload.targetFiles[0],
            fullContent: "export const value = 1;\n",
          },
        ],
        blockers: [],
      });
    },
    async completeText() {
      throw new Error("completeText is not used by exec-plan");
    },
    async completeWithTools() {
      throw new Error("completeWithTools is not used by exec-plan");
    },
  };
}

/** A worker stub that always declines, to exercise the failure path. */
function decliningSwarm(): ModelClient {
  return {
    async completeJson({ messages }) {
      const payload = parsePayload(messages);
      return JSON.stringify({
        taskId: payload.taskId,
        role: payload.role,
        status: "cannot_complete",
        edits: [],
        blockers: ["missing spec"],
      });
    },
    async completeText() {
      throw new Error("unused");
    },
    async completeWithTools() {
      throw new Error("unused");
    },
  };
}

function parsePayload(messages: { role: string; content: string }[]): {
  taskId: string;
  role: string;
  targetFiles: string[];
} {
  const user = messages.find((m) => m.role === "user")?.content ?? "{}";
  return JSON.parse(user);
}

async function tmp(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

describe("parseProjectPlan", () => {
  it("infers a worker role from the file path when role is omitted", () => {
    const plan = parseProjectPlan({
      projectName: "demo",
      files: [
        { path: "src/user.service.ts", purpose: "user service" },
        { path: "src/user.test.ts", purpose: "tests" },
      ],
      constraints: [],
    });
    expect(plan.files[0]?.role).toBe("service-writer");
    expect(plan.files[1]?.role).toBe("test-writer");
  });

  it("throws on a structurally invalid plan", () => {
    expect(() => parseProjectPlan({ foo: "bar" })).toThrow();
  });
});

describe("execPlan (external orchestrator)", () => {
  it("runs the swarm with no orchestrator model and applies files in dependency order", async () => {
    const workspaceRoot = await tmp("swarm-exec-ws-");
    const tracesRoot = await tmp("swarm-exec-runs-");

    const plan = parseProjectPlan({
      projectName: "demo",
      files: [
        { path: "src/a.ts", purpose: "module a" },
        { path: "src/b.ts", purpose: "module b", dependsOn: ["src/a.ts"] },
      ],
      constraints: [],
    });

    const result = await execPlan({
      plan,
      workspaceRoot,
      tracesRoot,
      concurrency: 4,
      verify: false,
      swarmClient: applyingSwarm(),
    });

    expect(result.failed).toHaveLength(0);
    expect(result.blocked).toHaveLength(0);
    expect([...result.applied].sort()).toEqual(["src/a.ts", "src/b.ts"]);

    const a = await fs.readFile(path.join(workspaceRoot, "src/a.ts"), "utf8");
    expect(a).toContain("export const value");

    const saved = JSON.parse(
      await fs.readFile(path.join(result.traceDir, "result.json"), "utf8"),
    );
    expect(saved.applied).toContain("src/a.ts");
  });

  it("reports failed tasks without throwing when a worker declines", async () => {
    const workspaceRoot = await tmp("swarm-exec-ws-");
    const tracesRoot = await tmp("swarm-exec-runs-");

    const plan = parseProjectPlan({
      projectName: "demo",
      files: [{ path: "src/a.ts", purpose: "module a" }],
      constraints: [],
    });

    const result = await execPlan({
      plan,
      workspaceRoot,
      tracesRoot,
      concurrency: 1,
      verify: false,
      swarmClient: decliningSwarm(),
    });

    expect(result.applied).toHaveLength(0);
    expect(result.failed).toHaveLength(1);
  });
});
