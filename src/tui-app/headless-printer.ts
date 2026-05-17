import { EventBus } from "../events/bus.js";
import type {
  SessionEvent,
  WorkerFinishStatus,
  PermissionDecision,
  SessionMode,
} from "../events/types.js";

interface HeadlessPrinterOpts {
  bus: EventBus;
  stream?: NodeJS.WritableStream;
}

export class HeadlessPrinter {
  private bus: EventBus;
  private stream: NodeJS.WritableStream;
  private unsubscribers: Array<() => void> = [];

  constructor(opts: HeadlessPrinterOpts) {
    this.bus = opts.bus;
    this.stream = opts.stream || process.stdout;
  }

  attach(): void {
    this.unsubscribers.push(
      this.bus.on("mode_change", (event) => {
        this.log(`[mode] ${event.mode}`);
      }),
    );

    this.unsubscribers.push(
      this.bus.on("plan_updated", (event) => {
        const plan = event.plan as any;
        const fileCount = plan?.files?.length ?? 0;
        const todoCount = plan?.todos?.length ?? 0;
        this.log(`[plan] plan_updated (${fileCount} files, ${todoCount} todos)`);
      }),
    );

    this.unsubscribers.push(
      this.bus.on("todo_changed", (event) => {
        const count = event.todos?.length ?? 0;
        this.log(`[plan] todo_changed (${count} items)`);
      }),
    );

    this.unsubscribers.push(
      this.bus.on("worker_started", (event) => {
        this.log(
          `[exec] worker ${event.id} ${event.file} (${event.role}) started`,
        );
      }),
    );

    this.unsubscribers.push(
      this.bus.on("worker_tool_call", (event) => {
        const tool = event.tool;
        const argsStr = this.formatArgs(event.args);
        this.log(`[exec] worker ${event.id} tool ${tool}${argsStr}`);
      }),
    );

    this.unsubscribers.push(
      this.bus.on("worker_tool_result", (event) => {
        const status = event.ok ? "ok" : "error";
        this.log(
          `[exec] worker ${event.id} tool ${event.tool} → ${status}`,
        );
      }),
    );

    this.unsubscribers.push(
      this.bus.on("worker_finished", (event) => {
        const status = event.status as WorkerFinishStatus;
        this.log(`[exec] worker ${event.id} → ${status}`);
      }),
    );

    this.unsubscribers.push(
      this.bus.on("command_started", (event) => {
        this.log(`[cmd] ${event.name} started`);
      }),
    );

    this.unsubscribers.push(
      this.bus.on("command_finished", (event) => {
        const status = event.passed ? "passed" : "failed";
        const durationSec = (event.durationMs / 1000).toFixed(1);
        this.log(`[cmd] ${event.name} ${status} in ${durationSec}s`);
      }),
    );

    this.unsubscribers.push(
      this.bus.on("tokens_updated", (event) => {
        this.log(
          `[tokens] ${event.agent} +${event.promptTokens} in / +${event.completionTokens} out`,
        );
      }),
    );

    this.unsubscribers.push(
      this.bus.on("tool_call_started", (event) => {
        const argsStr = this.formatArgs(event.args);
        this.log(
          `[tool] ${event.agent} called ${event.toolName}${argsStr}`,
        );
      }),
    );

    this.unsubscribers.push(
      this.bus.on("tool_call_finished", (event) => {
        const status = event.ok ? "ok" : "error";
        const durationMs = event.durationMs;
        this.log(
          `[tool] ${event.toolName} → ${status} (${durationMs}ms)`,
        );
      }),
    );

    this.unsubscribers.push(
      this.bus.on("permission_request", (event) => {
        const argsStr = this.formatArgs(event.args);
        this.log(
          `[perm] ${event.toolName}${argsStr}`,
        );
      }),
    );

    this.unsubscribers.push(
      this.bus.on("ask_user", (event) => {
        const optionsStr = event.options
          ? ` options=[${event.options.join(", ")}]`
          : "";
        this.log(`[ask] "${event.question}"${optionsStr}`);
      }),
    );

    this.unsubscribers.push(
      this.bus.on("run_finished", (event) => {
        const status = event.passed ? "PASSED" : "FAILED";
        this.log(`[done] run finished — ${status}`);
      }),
    );
  }

  detach(): void {
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers = [];
  }

  private log(message: string): void {
    const timestamp = this.getTimestamp();
    this.stream.write(`${timestamp} ${message}\n`);
  }

  private getTimestamp(): string {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, "0");
    const m = String(now.getMinutes()).padStart(2, "0");
    const s = String(now.getSeconds()).padStart(2, "0");
    return `${h}:${m}:${s}`;
  }

  private formatArgs(args: unknown): string {
    if (!args) return "";
    if (typeof args === "string") return `("${args}")`;
    if (typeof args === "object") {
      const obj = args as Record<string, unknown>;
      const pairs = Object.entries(obj)
        .map(([key, val]) => {
          if (typeof val === "string") return `${key}="${val}"`;
          return `${key}=${JSON.stringify(val)}`;
        })
        .join(", ");
      return pairs ? `(${pairs})` : "";
    }
    return `(${JSON.stringify(args)})`;
  }
}
