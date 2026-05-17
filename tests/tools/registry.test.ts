import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { z } from "zod";
import { ToolRegistry } from "../../src/tools/registry.js";
import { PermissionResolver } from "../../src/tools/permissions.js";
import { FileLocks } from "../../src/tools/locks.js";
import type { ToolCtx, PermissionConfig, ToolDef } from "../../src/tools/schemas.js";

function makeConfig(overrides: Partial<PermissionConfig> = {}): PermissionConfig {
  return { perTool: {}, ...overrides };
}

function makeCtx(overrides: Partial<ToolCtx> = {}): ToolCtx {
  return {
    workspaceRoot: "/tmp",
    agent: "orchestrator",
    signal: new AbortController().signal,
    emit: vi.fn(),
    ...overrides,
  };
}

const echoSchema = z.object({ msg: z.string() });

function echoTool(): ToolDef<{ msg: string }, string> {
  return {
    name: "echo",
    description: "returns msg",
    agent: "both",
    schema: echoSchema,
    handler: async ({ msg }) => msg,
  };
}

function makeRegistry(opts: Partial<PermissionConfig> = {}, auditDir?: string) {
  const permissions = new PermissionResolver(makeConfig(opts));
  const locks = new FileLocks();
  return new ToolRegistry({ permissions, locks, auditDir });
}

describe("ToolRegistry", () => {
  it("happy path: registered tool returns ok with data", async () => {
    const reg = makeRegistry({ perTool: { echo: "auto" } });
    reg.register(echoTool());

    const result = await reg.invoke("echo", { msg: "hello" }, makeCtx());
    expect(result).toEqual({ ok: true, data: "hello" });
  });

  it("returns ok:false for unknown tool", async () => {
    const reg = makeRegistry();
    const result = await reg.invoke("nope", {}, makeCtx());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("TOOL_NOT_FOUND");
    }
  });

  it("returns ok:false when schema validation fails", async () => {
    const reg = makeRegistry({ perTool: { echo: "auto" } });
    reg.register(echoTool());

    const result = await reg.invoke("echo", { msg: 42 }, makeCtx());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("SCHEMA_VALIDATION_FAILED");
    }
  });

  it("returns ok:false when permission is deny", async () => {
    const reg = makeRegistry({ perTool: { echo: "deny" } });
    reg.register(echoTool());

    const result = await reg.invoke("echo", { msg: "hi" }, makeCtx());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("PERMISSION_DENIED");
    }
  });

  it("serializes concurrent invokes on the same locked path", async () => {
    const reg = makeRegistry({ perTool: { slow_write: "auto" } });
    const order: string[] = [];

    const slowSchema = z.object({ file: z.string() });
    reg.register({
      name: "slow_write",
      description: "slow write",
      agent: "both",
      schema: slowSchema,
      filesAccessed: ({ file }) => [file],
      handler: async () => {
        order.push("start");
        await new Promise((r) => setTimeout(r, 30));
        order.push("end");
        return null;
      },
    });

    const ctx = makeCtx();
    const args = { file: "shared.ts" };
    await Promise.all([
      reg.invoke("slow_write", args, ctx),
      reg.invoke("slow_write", args, ctx),
    ]);

    expect(order).toEqual(["start", "end", "start", "end"]);
  });

  it("writes audit log when auditDir is set", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "audit-"));
    const reg = makeRegistry({ perTool: { echo: "auto" } }, dir);
    reg.register(echoTool());

    await reg.invoke("echo", { msg: "audit-me" }, makeCtx());

    const files = await fs.readdir(dir);
    expect(files.length).toBeGreaterThan(0);

    const content = await fs.readFile(path.join(dir, files[0]!), "utf8");
    const entry = JSON.parse(content) as { toolName: string; result: { ok: boolean } };
    expect(entry.toolName).toBe("echo");
    expect(entry.result.ok).toBe(true);
  });

  it("listForAgent returns only tools visible to that agent", () => {
    const reg = makeRegistry();
    reg.register({ ...echoTool(), name: "orch-only", agent: "orchestrator" });
    reg.register({ ...echoTool(), name: "swarm-only", agent: "swarm" });
    reg.register({ ...echoTool(), name: "shared", agent: "both" });

    const orchTools = reg.listForAgent("orchestrator").map((d) => d.name);
    expect(orchTools).toContain("orch-only");
    expect(orchTools).toContain("shared");
    expect(orchTools).not.toContain("swarm-only");

    const swarmTools = reg.listForAgent("swarm").map((d) => d.name);
    expect(swarmTools).toContain("swarm-only");
    expect(swarmTools).toContain("shared");
    expect(swarmTools).not.toContain("orch-only");
  });
});
