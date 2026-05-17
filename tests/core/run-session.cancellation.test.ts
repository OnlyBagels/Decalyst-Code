import { describe, it, expect, vi, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { RunSession } from "../../src/core/run-session.js";

// Stub out createOrchestratorClient and createSwarmClient so tests never
// need real API keys or network.

vi.mock("../../src/models/orchestrator-client.js", () => ({
  createOrchestratorClient: () => ({
    async completeText(args: { signal?: AbortSignal }) {
      if (args.signal?.aborted) {
        const err = new Error("Request was aborted.");
        err.name = "AbortError";
        throw err;
      }
      // Return a minimal valid plan JSON so the Planner can parse it.
      return JSON.stringify({
        projectName: "test",
        files: [
          {
            path: "src/index.ts",
            role: "scaffold-writer",
            purpose: "Entry point",
          },
        ],
        constraints: [],
      });
    },
    async completeJson() { return "{}"; },
    async completeWithTools() {
      throw new Error("not used in this test");
    },
  }),
  getDefaultOrchestratorModel: () => "test-model",
}));

vi.mock("../../src/models/swarm-client.js", () => ({
  createSwarmClient: () => ({
    async completeJson() { return JSON.stringify({ action: "submit", args: {} }); },
    async completeText() { return ""; },
    async completeWithTools() { throw new Error("not used"); },
  }),
  getDefaultSwarmModel: () => "test-model",
}));

// Also stub WorkerRunner so we don't spin up real workers.
vi.mock("../../src/workers/worker-runner.js", () => ({
  WorkerRunner: class {
    async run() {
      return {
        taskId: "src/index.ts",
        role: "scaffold-writer",
        status: "success",
        edits: [],
        blockers: [],
      };
    }
  },
}));

// Stub NpmRunner — no real npm needed.
vi.mock("../../src/runners/npm-runner.js", () => ({
  NpmRunner: class {
    async install() { return { stdout: "", stderr: "", exitCode: 0 }; }
    async typecheck() { return { stdout: "", stderr: "", exitCode: 0 }; }
    async test() { return { stdout: "", stderr: "", exitCode: 0 }; }
  },
}));

let tmpDirs: string[] = [];

afterEach(async () => {
  for (const d of tmpDirs) {
    await fs.rm(d, { recursive: true, force: true });
  }
  tmpDirs = [];
});

async function makeDirs() {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "swarm-cancel-test-"));
  tmpDirs.push(base);
  const workspaceRoot = path.join(base, "workspace");
  const tracesRoot = path.join(base, "traces");
  await fs.mkdir(workspaceRoot, { recursive: true });
  await fs.mkdir(tracesRoot, { recursive: true });
  return { workspaceRoot, tracesRoot };
}

describe("RunSession cancellation", () => {
  it("pre-aborted signal returns passed:false with cancelled report", async () => {
    const { workspaceRoot, tracesRoot } = await makeDirs();
    const ac = new AbortController();
    ac.abort();

    const session = new RunSession({
      userRequest: "build something",
      workspaceRoot,
      tracesRoot,
      concurrency: 1,
      maxFixRounds: 1,
      abortSignal: ac.signal,
    });

    const summary = await session.run();

    expect(summary.passed).toBe(false);
    expect(summary.finalReport).toBe("cancelled");
  });

  it("cancellation during planning returns passed:false", async () => {
    const { workspaceRoot, tracesRoot } = await makeDirs();
    const ac = new AbortController();

    // The mock completeText will see aborted=true because we abort before calling run.
    // Simulate aborting synchronously before the session starts.
    ac.abort();

    const session = new RunSession({
      userRequest: "build something",
      workspaceRoot,
      tracesRoot,
      concurrency: 1,
      maxFixRounds: 1,
      abortSignal: ac.signal,
    });

    const summary = await session.run();

    expect(summary.passed).toBe(false);
    expect(summary.finalReport).toBe("cancelled");
    expect(summary.runId).toBeTruthy();
    expect(summary.startedAt).toBeTruthy();
    expect(summary.finishedAt).toBeTruthy();
  });

  it("non-cancelled run completes normally", async () => {
    const { workspaceRoot, tracesRoot } = await makeDirs();

    const session = new RunSession({
      userRequest: "build something",
      workspaceRoot,
      tracesRoot,
      concurrency: 1,
      maxFixRounds: 0,
    });

    // This will run through planner -> tasks -> execution -> fixer -> review.
    // The mocked orchestrator returns a trivial plan; the mock worker returns success.
    const summary = await session.run();

    // The run should complete (passed may be true or false depending on fix loop stubs).
    expect(summary.runId).toBeTruthy();
    expect(summary.finalReport).toBeDefined();
  });
});
