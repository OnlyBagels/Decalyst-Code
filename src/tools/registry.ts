import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ToolDef, ToolCtx, ToolResult } from "./schemas.js";
import { PermissionResolver } from "./permissions.js";
import { FileLocks } from "./locks.js";

interface RegistryOpts {
  permissions: PermissionResolver;
  locks: FileLocks;
  auditDir?: string;
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

      await this.writeAudit(toolName, args, result);
      return result;
    };

    if (lockPaths.length > 0) {
      return this.opts.locks.withLock(lockPaths, run);
    }
    return run();
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
