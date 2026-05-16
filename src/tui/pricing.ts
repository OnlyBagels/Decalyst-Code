// USD per 1 million tokens. Update as providers change prices.
// Keys are lowercased model substrings — first match wins.

export interface ModelPricing {
  inputPer1M: number;
  outputPer1M: number;
  contextWindow: number;
}

const PRICING: Array<{ match: RegExp; pricing: ModelPricing }> = [
  // ── DeepSeek (direct api.deepseek.com) ─────────────────────────────
  {
    match: /deepseek-reasoner/i,
    pricing: { inputPer1M: 0.55, outputPer1M: 2.19, contextWindow: 64_000 },
  },
  {
    match: /deepseek-chat|deepseek-v3|deepseek-v4/i,
    pricing: { inputPer1M: 0.27, outputPer1M: 1.10, contextWindow: 64_000 },
  },

  // ── Anthropic (direct or via openrouter) ────────────────────────────
  {
    match: /claude-opus-4/i,
    pricing: { inputPer1M: 15.0, outputPer1M: 75.0, contextWindow: 200_000 },
  },
  {
    match: /claude-sonnet-4/i,
    pricing: { inputPer1M: 3.0, outputPer1M: 15.0, contextWindow: 200_000 },
  },
  {
    match: /claude-haiku-4/i,
    pricing: { inputPer1M: 1.0, outputPer1M: 5.0, contextWindow: 200_000 },
  },

  // ── OpenAI (direct or via openrouter) ───────────────────────────────
  {
    match: /gpt-4o-mini/i,
    pricing: { inputPer1M: 0.15, outputPer1M: 0.60, contextWindow: 128_000 },
  },
  {
    match: /gpt-4o|gpt-4\.1/i,
    pricing: { inputPer1M: 2.50, outputPer1M: 10.0, contextWindow: 128_000 },
  },
  {
    match: /gpt-5/i,
    pricing: { inputPer1M: 5.0, outputPer1M: 15.0, contextWindow: 200_000 },
  },

  // ── Qwen (small swarm-style models) ─────────────────────────────────
  {
    match: /qwen3-coder-flash/i,
    pricing: { inputPer1M: 0.18, outputPer1M: 0.18, contextWindow: 32_000 },
  },
  {
    match: /qwen/i,
    pricing: { inputPer1M: 0.20, outputPer1M: 0.20, contextWindow: 32_000 },
  },

  // ── Local / unknown ─────────────────────────────────────────────────
  {
    match: /^default$|local|mistralrs/i,
    pricing: { inputPer1M: 0, outputPer1M: 0, contextWindow: 32_000 },
  },
];

const UNKNOWN_FALLBACK: ModelPricing = {
  inputPer1M: 0,
  outputPer1M: 0,
  contextWindow: 32_000,
};

export function getPricing(model: string): ModelPricing {
  for (const entry of PRICING) {
    if (entry.match.test(model)) return entry.pricing;
  }
  return UNKNOWN_FALLBACK;
}

export function computeCost(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const p = getPricing(model);
  return (
    (promptTokens / 1_000_000) * p.inputPer1M +
    (completionTokens / 1_000_000) * p.outputPer1M
  );
}
