import { renderPanel } from "./panel.js";
import { UsageTracker } from "./usage-tracker.js";

const ANSI_CURSOR_UP = (n: number) => `\x1b[${n}A`;
const ANSI_CLEAR_LINE = "\x1b[2K";
const ANSI_CURSOR_TO_COL_0 = "\r";
const ANSI_HIDE_CURSOR = "\x1b[?25l";
const ANSI_SHOW_CURSOR = "\x1b[?25h";

export interface TuiOptions {
  enabled: boolean;
  maxLogLines: number;
}

/**
 * Live in-place rendering of the stats panel. Uses ANSI escape codes to
 * redraw the panel after every state change. Works in any ANSI-capable TTY.
 * When `enabled` is false, falls back to plain console.log output.
 */
export class TuiController {
  private readonly recentLogs: string[] = [];
  private lastRenderLines = 0;
  private unsubscribe: (() => void) | null = null;
  private rafTimer: NodeJS.Timeout | null = null;
  private dirty = false;
  private stopped = false;

  constructor(
    public readonly tracker: UsageTracker,
    private readonly opts: TuiOptions,
  ) {}

  start(): void {
    if (!this.opts.enabled) return;
    process.stdout.write(ANSI_HIDE_CURSOR);
    this.unsubscribe = this.tracker.onChange(() => this.scheduleRender());
    // Tick the elapsed timer
    this.rafTimer = setInterval(() => this.scheduleRender(), 500);
    this.render();
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    if (this.unsubscribe) this.unsubscribe();
    if (this.rafTimer) clearInterval(this.rafTimer);
    if (this.opts.enabled) {
      this.render(); // final paint
      process.stdout.write(ANSI_SHOW_CURSOR);
      process.stdout.write("\n");
    }
  }

  log(message: string): void {
    this.recentLogs.push(message);
    if (this.recentLogs.length > 200) this.recentLogs.shift();
    if (this.opts.enabled) {
      this.scheduleRender();
    } else {
      console.log(message);
    }
  }

  private scheduleRender(): void {
    if (this.dirty) return;
    this.dirty = true;
    setImmediate(() => {
      this.dirty = false;
      this.render();
    });
  }

  private render(): void {
    if (!this.opts.enabled) return;
    const width = process.stdout.columns ?? 100;
    const lines = renderPanel(this.tracker, this.recentLogs, {
      width,
      maxLogLines: this.opts.maxLogLines,
    });

    // Clear previous render in place, then redraw.
    let out = "";
    if (this.lastRenderLines > 0) {
      out += ANSI_CURSOR_UP(this.lastRenderLines);
      for (let i = 0; i < this.lastRenderLines; i++) {
        out += ANSI_CLEAR_LINE + "\n";
      }
      out += ANSI_CURSOR_UP(this.lastRenderLines);
    }
    out += ANSI_CURSOR_TO_COL_0;
    out += lines.join("\n") + "\n";

    process.stdout.write(out);
    this.lastRenderLines = lines.length;
  }
}

export function detectTuiEnabled(): boolean {
  // Disable in non-TTY (piped output, CI) and when explicitly disabled.
  if (process.env["DECALYST_TUI"] === "0") return false;
  if (process.env["DECALYST_TUI"] === "1") return true;
  if (!process.stdout.isTTY) return false;
  return true;
}
