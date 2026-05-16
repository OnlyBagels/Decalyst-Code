/** Rough char-to-token estimate (4 chars ≈ 1 token). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export interface TokenBudget {
  maxInputChars: number;
  maxContextFiles: number;
}

export function defaultBudget(): TokenBudget {
  return {
    maxInputChars: 12_000,
    maxContextFiles: 4,
  };
}

/** Truncate content to stay within a char budget, appending a note. */
export function truncateToChars(content: string, maxChars: number): string {
  if (content.length <= maxChars) return content;
  return content.slice(0, maxChars) + `\n... [truncated at ${maxChars} chars]`;
}
