import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ToolDef, ToolCtx, ToolResult } from "./schemas.js";
import { PermissionResolver } from "./permissions.js";
import { FileLocks } from "./locks.js";
import type { Compressor } from "../services/compress/compressor.js";

const TOOL_OUTPUT_TOKEN_THRESHOLD = 1500;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

interface RegistryOpts {
  permissions: PermissionResolver;
  locks: FileLocks;
  auditDir?: string;
  compressor?: Compressor;
}

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDef>();
  private seq = 0;

  constructor(private readonly opts: RegistryOpts) {}

  register<A, R>(def: ToolDef<A, R>): void {
    this.tools.set(def.name, def as ToolDef);
  }

  async invoke(
    toolName: string,
    args: unknown,
    ctx: ToolCtx,
  ): Promise<ToolResult> {
    const def = this.tools.get(toolName);
    if (def === undefined) {
      return { ok: false, error: `Unknown tool: ${toolName}`, code: "TOOL_NOT_FOUND" };
    }

    // TODO: mode check — wire in when mode-controller phase ships

    const parsed = def.schema.safeParse(args);
    if (!parsed.success) {
      return {
        ok: false,
        error: `Invalid args for ${toolName}: ${parsed.error.message}`,
        code: "SCHEMA_VALIDATION_FAILED",
      };
    }

    const decision = await this.opts.permissions.resolve(toolName, args, ctx);
    if (decision === "deny") {
      return { ok: false, error: `Permission denied for tool: ${toolName}`, code: "PERMISSION_DENIED" };
    }

    const typedArgs = parsed.data;
    const lockPaths = def.filesAccessed ? def.filesAccessed(typedArgs) : [];

    const run = async (): Promise<ToolResult> => {
      const startedAt = Date.now();
      ctx.emit({ t: "tool_call_started", toolName, taskId: ctx.taskId });

      let result: ToolResult;
      try {
        const data = await def.handler(typedArgs, ctx);
        result = { ok: true, data };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result = { ok: false, error: msg, code: "HANDLER_ERROR" };
      }

      ctx.emit({
        t: "tool_call_finished",
        toolName,
        taskId: ctx.taskId,
        ok: result.ok,
        durationMs: Date.now() - startedAt,
      });

      // Audit log receives the original result before any compression
      await this.writeAudit(toolName, args, result);

      if (result.ok && this.opts.compressor) {
        result = await this.maybeCompress(toolName, result);
      }

      return result;
    };

    if (lockPaths.length > 0) {
      return this.opts.locks.withLock(lockPaths, run);
    }
    return run();
  }

  private async maybeCompress(toolName: string, result: ToolResult & { ok: true }): Promise<ToolResult> {
    const compressor = this.opts.compressor!;
    const data = result.data;

    let payload: string | undefined;

    if (typeof data === "string") {
      payload = data;
    } else if (data !== null && typeof data === "object") {
      const obj = data as Record<string, unknown>;
      if (typeof obj["content"] === "string") payload = obj["content"];
      else if (typeof obj["stdout"] === "string") payload = obj["stdout"];
      else if (typeof obj["text"] === "string") payload = obj["text"];
    }

    if (payload === undefined || estimateTokens(payload) <= TOOL_OUTPUT_TOKEN_THRESHOLD) {
      return result;
    }

    const language = inferLanguage(toolName);
    const compressed = await compressor.compress({
      kind: "tool-output",
      content: payload,
      language,
    });

    if (compressed.strategy === "no-op") {
      return result;
    }

    const meta = {
      originalTokens: compressed.originalTokens,
      compressedTokens: compressed.compressedTokens,
      strategy: compressed.strategy,
    };

    let compressedData: unknown;

    if (typeof data === "string") {
      compressedData = compressed.content;
    } else {
      const obj = data as Record<string, unknown>;
      if (typeof obj["content"] === "string") {
        compressedData = { ...obj, content: compressed.content, _compression: meta };
      } else if (typeof obj["stdout"] === "string") {
        compressedData = { ...obj, stdout: compressed.content, _compression: meta };
      } else if (typeof obj["text"] === "string") {
        compressedData = { ...obj, text: compressed.content, _compression: meta };
      } else {
        compressedData = data;
      }
    }

    return { ok: true, data: compressedData };
  }

  listForAgent(agent: "orchestrator" | "swarm" | "both"): ToolDef[] {
    const out: ToolDef[] = [];
    for (const def of this.tools.values()) {
      if (def.agent === "both" || def.agent === agent) {
        out.push(def);
      }
    }
    return out;
  }

  private async writeAudit(
    toolName: string,
    args: unknown,
    result: ToolResult,
  ): Promise<void> {
    if (this.opts.auditDir === undefined) return;
    const seq = ++this.seq;
    const filename = path.join(this.opts.auditDir, `${seq}.json`);
    const entry = {
      seq,
      toolName,
      args,
      result,
      ts: new Date().toISOString(),
    };
    await fs.mkdir(this.opts.auditDir, { recursive: true });
    await fs.writeFile(filename, JSON.stringify(entry, null, 2), "utf8");
  }
}

function inferLanguage(toolName: string): string | undefined {
  if (toolName.includes("typescript") || toolName.includes("ts")) return "ts";
  if (toolName.includes("python") || toolName.includes("py")) return "python";
  if (toolName.includes("json")) return "json";
  return undefined;
}
