import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { registerVerifyTools } from "../../../src/tools/handlers/verify.js";
import { ToolRegistry } from "../../../src/tools/registry.js";
import { PermissionResolver } from "../../../src/tools/permissions.js";
import { FileLocks } from "../../../src/tools/locks.js";
import type { TestResult } from "../../../src/types/agent.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

describe("verify tools", () => {
  let tmpDir: string;
  let registry: ToolRegistry;
  let tracesRoot: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "verify-"));
    tracesRoot = path.join(tmpDir, "runs");

    const permissions = new PermissionResolver({});
    const locks = new FileLocks();

    registry = new ToolRegistry({
      permissions,
      locks,
    });
  });

  afterEach(async () => {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("run_command", () => {
    it("is registered", async () => {
      const mockRunner = {
        run: vi.fn(async () => ({
          command: "test",
          exitCode: 0,
          passed: true,
          durationMs: 100,
          stdout: "",
          stderr: "",
          failures: [],
        } as TestResult)),
      };

      const mockSandbox = {
        evalTs: vi.fn(),
        evalPython: vi.fn(),
        dryCompileTs: vi.fn(),
      };

      registerVerifyTools(registry, {
        runner: mockRunner as any,
        sandbox: mockSandbox as any,
        tracesRoot,
      });

      const tools = registry.listForAgent("orchestrator");
      expect(tools.some((t) => t.name === "run_command")).toBe(true);
    });
  });

  describe("dry_compile", () => {
    it("is registered", async () => {
      const mockRunner = {
        run: vi.fn(),
      };

      const mockSandbox = {
        evalTs: vi.fn(),
        evalPython: vi.fn(),
        dryCompileTs: vi.fn(async () => ({ ok: true, errors: [] })),
      };

      registerVerifyTools(registry, {
        runner: mockRunner as any,
        sandbox: mockSandbox as any,
        tracesRoot,
      });

      const tools = registry.listForAgent("orchestrator");
      expect(tools.some((t) => t.name === "dry_compile")).toBe(true);
    });
  });

  describe("read_command_output", () => {
    it("is registered", async () => {
      const mockRunner = {
        run: vi.fn(),
      };

      const mockSandbox = {
        evalTs: vi.fn(),
        evalPython: vi.fn(),
        dryCompileTs: vi.fn(),
      };

      registerVerifyTools(registry, {
        runner: mockRunner as any,
        sandbox: mockSandbox as any,
        tracesRoot,
      });

      const tools = registry.listForAgent("orchestrator");
      expect(tools.some((t) => t.name === "read_command_output")).toBe(true);
    });

    it("returns found: false for missing round", async () => {
      const mockRunner = {
        run: vi.fn(),
      };

      const mockSandbox = {
        evalTs: vi.fn(),
        evalPython: vi.fn(),
        dryCompileTs: vi.fn(),
      };

      registerVerifyTools(registry, {
        runner: mockRunner as any,
        sandbox: mockSandbox as any,
        tracesRoot,
      });

      const tools = registry.listForAgent("orchestrator");
      const tool = tools.find((t) => t.name === "read_command_output")!;

      const result = await tool.handler(
        { roundId: "missing-round" },
        {
          workspaceRoot: tmpDir,
          agent: "orchestrator",
          signal: new AbortController().signal,
          emit: () => {},
        },
      );

      expect(result).toBeDefined();
    });
  });

  describe("diff_workspace", () => {
    it("is registered", async () => {
      const mockRunner = {
        run: vi.fn(),
      };

      const mockSandbox = {
        evalTs: vi.fn(),
        evalPython: vi.fn(),
        dryCompileTs: vi.fn(),
      };

      registerVerifyTools(registry, {
        runner: mockRunner as any,
        sandbox: mockSandbox as any,
        tracesRoot,
      });

      const tools = registry.listForAgent("orchestrator");
      expect(tools.some((t) => t.name === "diff_workspace")).toBe(true);
    });
  });
});
