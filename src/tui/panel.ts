import { getPricing } from "./pricing.js";
import type { UsageTracker, AgentUsage } from "./usage-tracker.js";

const C_DIM = "\x1b[2m";
const C_BOLD = "\x1b[1m";
const C_CYAN = "\x1b[36m";
const C_GREEN = "\x1b[32m";
const C_YELLOW = "\x1b[33m";
const C_RED = "\x1b[31m";
const C_RESET = "\x1b[0m";

export interface PanelOptions {
  width: number;
  maxLogLines: number;
}

export function renderPanel(
  tracker: UsageTracker,
  recentLogs: string[],
  opts: PanelOptions,
): string[] {
  const lines: string[] = [];
  const W = Math.max(60, Math.min(opts.width, 140));
  const rule = "─".repeat(W);

  const elapsed = formatElapsed(tracker.elapsedMs());
  const totals = tracker.totals();
  const agents = tracker.allAgents();

  // Header
  lines.push(
    `${C_DIM}┌─${C_RESET} ${C_BOLD}decalyst-swarm${C_RESET} ${C_DIM}${rule.slice(0, W - 18)}┐${C_RESET}`,
  );
  lines.push(
    `${C_DIM}│${C_RESET} Phase: ${C_CYAN}${tracker.phase().padEnd(14)}${C_RESET}` +
      `${C_DIM} · ${C_RESET}elapsed ${elapsed.padEnd(8)}` +
      pad(`calls ${totals.calls}`, W - 50) +
      ` ${C_DIM}│${C_RESET}`,
  );
  lines.push(`${C_DIM}├${rule}┤${C_RESET}`);

  // Table header
  lines.push(
    `${C_DIM}│${C_RESET} ` +
      headerCell("Agent", 12) +
      headerCell("Model", 22) +
      headerCell("In", 10, "right") +
      headerCell("Out", 10, "right") +
      headerCell("Ctx %", 8, "right") +
      headerCell("Cost", 10, "right") +
      ` ${C_DIM}│${C_RESET}`,
  );
  lines.push(`${C_DIM}├${rule}┤${C_RESET}`);

  // Per-agent rows
  if (agents.length === 0) {
    lines.push(
      `${C_DIM}│${C_RESET} ${C_DIM}(no agent activity yet)${C_RESET}` +
        pad("", W - 25) +
        ` ${C_DIM}│${C_RESET}`,
    );
  } else {
    for (const a of agents) {
      lines.push(`${C_DIM}│${C_RESET} ${renderAgentRow(tracker, a)} ${C_DIM}│${C_RESET}`);
    }
  }
  lines.push(`${C_DIM}├${rule}┤${C_RESET}`);

  // Recent logs section
  const logs = recentLogs.slice(-opts.maxLogLines);
  if (logs.length === 0) {
    lines.push(
      `${C_DIM}│${C_RESET} ${C_DIM}(waiting…)${C_RESET}` +
        pad("", W - 12) +
        ` ${C_DIM}│${C_RESET}`,
    );
  } else {
    for (const log of logs) {
      lines.push(
        `${C_DIM}│${C_RESET} ${truncate(log, W - 4).padEnd(W - 4)} ${C_DIM}│${C_RESET}`,
      );
    }
  }
  lines.push(`${C_DIM}├${rule}┤${C_RESET}`);

  // Totals
  const totalLine =
    `Total: ${C_GREEN}${formatNum(totals.promptTokens)}${C_RESET} in / ` +
    `${C_YELLOW}${formatNum(totals.completionTokens)}${C_RESET} out` +
    `${C_DIM} · ${C_RESET}~${formatCost(totals.cost)}`;
  lines.push(`${C_DIM}│${C_RESET} ${padVisible(totalLine, W - 2)} ${C_DIM}│${C_RESET}`);
  lines.push(`${C_DIM}└${rule}┘${C_RESET}`);

  return lines;
}

function renderAgentRow(tracker: UsageTracker, a: AgentUsage): string {
  const ctxPct = tracker.contextUtilization(a) * 100;
  const ctxColor =
    ctxPct < 50 ? C_GREEN : ctxPct < 80 ? C_YELLOW : C_RED;
  return (
    cell(a.agent, 12) +
    cell(a.model, 22) +
    cell(formatNum(a.promptTokens), 10, "right") +
    cell(formatNum(a.completionTokens), 10, "right") +
    `${ctxColor}${cell(ctxPct.toFixed(1) + "%", 8, "right")}${C_RESET}` +
    cell(formatCost(a.cost), 10, "right")
  );
}

function cell(text: string, width: number, align: "left" | "right" = "left"): string {
  const t = truncate(text, width);
  if (align === "right") return t.padStart(width);
  return t.padEnd(width);
}

function headerCell(text: string, width: number, align: "left" | "right" = "left"): string {
  return `${C_DIM}${cell(text, width, align)}${C_RESET}`;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, Math.max(0, max - 1)) + "…";
}

function pad(text: string, width: number): string {
  if (text.length >= width) return text.slice(0, width);
  return text + " ".repeat(width - text.length);
}

/** Pad accounting for ANSI escape sequences (which take 0 visual columns). */
function padVisible(text: string, width: number): string {
  const visible = text.replace(/\x1b\[[0-9;]*m/g, "");
  if (visible.length >= width) return text;
  return text + " ".repeat(width - visible.length);
}

function formatNum(n: number): string {
  return n.toLocaleString("en-US");
}

function formatCost(usd: number): string {
  if (usd === 0) return "$0";
  if (usd < 0.001) return "<$0.001";
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

function formatElapsed(ms: number): string {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  return `${min}m${(sec % 60).toString().padStart(2, "0")}s`;
}
