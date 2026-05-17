import { CacheAligner } from "./cache-align.js";
import { CodeCompressor } from "./code.js";
import { JsonCompressor } from "./json.js";
import { TextCompressor } from "./text.js";
import type { CompressionOptions, CompressionResult, InputKind } from "./types.js";

const DEFAULT_THRESHOLDS: Record<InputKind, number> = {
  code: 2000,
  json: 1500,
  text: 1500,
  "tool-output": 2000,
};

export interface CompressorOptions {
  enabled: boolean;
  thresholds: Partial<Record<InputKind, number>>;
  aligner?: CacheAligner;
}

// Cheap token estimate — 4 chars per token average for cl100k_base.
// Used only for the should-compress gate; actual result tokens come from sub-compressors.
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export class Compressor {
  private readonly thresholds: Record<InputKind, number>;
  private readonly text: TextCompressor;
  private readonly json: JsonCompressor;
  private readonly code: CodeCompressor;
  readonly aligner: CacheAligner | undefined;
  private readonly enabled: boolean;

  constructor(opts: CompressorOptions) {
    this.enabled = opts.enabled;
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...opts.thresholds };
    this.aligner = opts.aligner;
    this.text = new TextCompressor();
    this.json = new JsonCompressor();
    this.code = new CodeCompressor();
  }

  shouldCompress(kind: InputKind, content: string): boolean {
    if (!this.enabled) return false;
    const tokens = estimateTokens(content);
    return tokens >= this.thresholds[kind];
  }

  async compress(args: {
    kind: InputKind;
    content: string;
    language?: string;
    opts?: CompressionOptions;
  }): Promise<CompressionResult> {
    const { kind, content, language, opts = {} } = args;

    if (!this.enabled || !this.shouldCompress(kind, content)) {
      const tokens = estimateTokens(content);
      return {
        content,
        originalTokens: tokens,
        compressedTokens: tokens,
        ratio: 1.0,
        strategy: "no-op",
      };
    }

    let result: CompressionResult;

    switch (kind) {
      case "json":
        result = this.json.compress(content, opts);
        break;
      case "code":
        result = this.code.compress(content, { ...opts, language: language ?? "ts" });
        break;
      case "text":
      case "tool-output":
      default:
        result = this.text.compress(content, opts);
        break;
    }

    // If compression didn't help (ratio >= 0.9), return original
    if (result.ratio >= 0.9) {
      return {
        content,
        originalTokens: result.originalTokens,
        compressedTokens: result.originalTokens,
        ratio: 1.0,
        strategy: "no-op",
      };
    }

    return result;
  }
}
