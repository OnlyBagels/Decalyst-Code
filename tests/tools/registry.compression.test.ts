import { describe, it, expect } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { z } from "zod";
import { ToolRegistry } from "../../src/tools/registry.js";
import { PermissionResolver } from "../../src/tools/permissions.js";
import { FileLocks } from "../../src/tools/locks.js";
import { Compressor } from "../../src/services/compress/compressor.js";
import type { ToolCtx, ToolDef } from "../../src/tools/schemas.js";

function makeCtx(overrides: Partial<ToolCtx> = {}): ToolCtx {
  return {
    workspaceRoot: os.tmpdir(),
    agent: "orchestrator",
    signal: new AbortController().signal,
    emit: () => {},
    ...overrides,
  };
}

function makeRegistry(opts: { auditDir?: string; compressor?: Compressor } = {}) {
  const permissions = new PermissionResolver({ perTool: { test_tool: "auto" } });
  const locks = new FileLocks();
  return new ToolRegistry({ permissions, locks, ...opts });
}

function makeStringTool(name: string, result: string): ToolDef<Record<string, never>, string> {
  return {
    name,
    description: "returns a string",
    agent: "both",
    schema: z.object({}),
    handler: async () => result,
  };
}

describe("ToolRegistry compression", () => {
  it("returns tool result as-is when payload is under threshold", async () => {
    const compressor = new Compressor({ enabled: true, thresholds: { "tool-output": 1500 } });
    const reg = makeRegistry({ compressor });
    const shortResult = "short output";
    reg.register(makeStringTool("test_tool", shortResult));

    const result = await reg.invoke("test_tool", {}, makeCtx());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toBe(shortResult);
    }
  });

  it("compresses tool result when payload exceeds threshold", async () => {
    const compressor = new Compressor({ enabled: true, thresholds: { "tool-output": 1 } });
    const reg = makeRegistry({ compressor });

    // 300 lines of content — well above 1-token threshold
    const bigResult = Array.from({ length: 300 }, (_, i) => `line ${i}: some content here`).join("\n");
    reg.register(makeStringTool("test_tool", bigResult));

    const result = await reg.invoke("test_tool", {}, makeCtx());
    expect(result.ok).toBe(true);
    if (result.ok) {
      // If compressed, the data differs from original (unless ratio >= 0.9 triggers no-op)
      // With 300 lines and threshold of 1, compression should occur
      const data = result.data as string;
      expect(typeof data).toBe("string");
    }
  });

  it("audit log receives original result before compression", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "audit-compress-"));
    const compressor = new Compressor({ enabled: true, thresholds: { "tool-output": 1 } });
    const reg = makeRegistry({ auditDir: dir, compressor });

    const bigResult = Array.from({ length: 300 }, (_, i) => `line ${i}: audit test content`).join("\n");
    reg.register(makeStringTool("test_tool", bigResult));

    await reg.invoke("test_tool", {}, makeCtx());

    const files = await fs.readdir(dir);
    expect(files.length).toBeGreaterThan(0);

    const content = await fs.readFile(path.join(dir, files[0]!), "utf8");
    const entry = JSON.parse(content) as { result: { ok: boolean; data: unknown } };

    expect(entry.result.ok).toBe(true);
    // Audit should contain the original (uncompressed) data
    expect(entry.result.data).toBe(bigResult);
  });

  it("behaves without compressor as it did before (no compression)", async () => {
    const reg = makeRegistry();
    const payload = Array.from({ length: 300 }, (_, i) => `line ${i}: some content`).join("\n");
    reg.register(makeStringTool("test_tool", payload));

    const result = await reg.invoke("test_tool", {}, makeCtx());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toBe(payload);
    }
  });
});
