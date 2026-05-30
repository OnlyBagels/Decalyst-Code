/** Rough char-to-token estimate (4 chars ≈ 1 token). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export interface TokenBudget {
  maxInputChars: number;
  maxContextFiles: number;
}

/**
 * Worker context budget. DeepSeek V4 and MiMo V2.5 carry 1M-token windows, so
 * the worker can hold the full contract plus every dependency file without
 * truncation. Sized targeted-generous (~30k tokens), not to the whole window:
 * the selector pulls only relevant files, and stuffing more dilutes attention.
 * Raise via env for the pro / long-context tier.
 */
export function defaultBudget(): TokenBudget {
  return {
    maxInputChars: envInt("SWARM_MAX_INPUT_CHARS", 120_000),
    maxContextFiles: envInt("SWARM_MAX_CONTEXT_FILES", 24),
  };
}

function envInt(name: string, fallback: number): number {
  const n = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Truncate content to stay within a char budget, appending a note. */
export function truncateToChars(content: string, maxChars: number): string {
  if (content.length <= maxChars) return content;
  return content.slice(0, maxChars) + `\n... [truncated at ${maxChars} chars]`;
}
