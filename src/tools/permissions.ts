import type { PermissionConfig, PermissionDecision, ToolCtx, ToolEvent } from "./schemas.js";

const AUTO_TOOLS = new Set<string>([
  "glob",
  "grep",
  "read_file",
  "outline",
  "import_graph",
  "peek_signature",
  "npm_view",
  "pkg_view",
  "read_dts",
  "scratchpad_read",
  "scratchpad_write",
  "scratchpad_append",
  "todo_write",
  "todo_update",
  "ask_user",
  "write_plan",
  "finalize",
  "bail",
  "dispatch_worker",
  "wait_workers",
  "run_command:typecheck",
  "run_command:test",
  "run_command:lint",
  "run_command:format",
]);

const ASK_ONCE_TOOLS = new Set<string>([
  "create_file",
  "edit_file",
  "run_command:install",
  "run_command:build",
]);

const ASK_TOOLS = new Set<string>([
  "web_search",
  "fetch_url",
  "prior_runs_search",
]);

function defaultDecision(toolName: string): PermissionDecision {
  if (AUTO_TOOLS.has(toolName)) return "auto";
  if (ASK_ONCE_TOOLS.has(toolName)) return "ask-once";
  if (ASK_TOOLS.has(toolName)) return "ask";
  return "ask";
}

export class PermissionResolver {
  private readonly cache = new Map<string, PermissionDecision>();

  constructor(private readonly config: PermissionConfig) {}

  async resolve(
    toolName: string,
    args: unknown,
    ctx: ToolCtx,
  ): Promise<PermissionDecision> {
    if (this.config.globalOverride !== undefined) {
      return this.config.globalOverride;
    }

    const fromConfig = this.config.perTool[toolName];
    let decision: PermissionDecision = fromConfig ?? defaultDecision(toolName);

    if (decision === "ask-once") {
      const cacheKey = buildCacheKey(toolName, args);
      const cached = this.cache.get(cacheKey);
      if (cached !== undefined) return cached;

      const resolved = await this.promptUser(toolName, args, ctx);
      this.cache.set(cacheKey, resolved);
      return resolved;
    }

    if (decision === "ask") {
      return this.promptUser(toolName, args, ctx);
    }

    return decision;
  }

  private promptUser(
    toolName: string,
    _args: unknown,
    ctx: ToolCtx,
  ): Promise<PermissionDecision> {
    return new Promise<PermissionDecision>((res) => {
      const event: ToolEvent = {
        t: "permission_request",
        toolName,
        taskId: ctx.taskId,
        resolve: res,
      };
      ctx.emit(event);
    });
  }
}

function buildCacheKey(toolName: string, args: unknown): string {
  const path = extractPath(args);
  return path !== undefined ? `${toolName}:${path}` : toolName;
}

function extractPath(args: unknown): string | undefined {
  if (args === null || typeof args !== "object") return undefined;
  const a = args as Record<string, unknown>;
  const candidate = a["path"] ?? a["filePath"] ?? a["file"];
  return typeof candidate === "string" ? candidate : undefined;
}
