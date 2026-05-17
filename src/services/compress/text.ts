import { countTokens } from "gpt-tokenizer";
import type { CompressionOptions, CompressionResult } from "./types.js";

const DEFAULT_HEAD = 30;
const DEFAULT_TAIL = 15;

export class TextCompressor {
  compress(content: string, opts: CompressionOptions = {}): CompressionResult {
    const headLines = opts.headLines ?? DEFAULT_HEAD;
    const tailLines = opts.tailLines ?? DEFAULT_TAIL;
    const threshold = headLines + tailLines;

    const originalTokens = countTokens(content);
    const lines = content.split("\n");

    if (lines.length <= threshold) {
      return {
        content,
        originalTokens,
        compressedTokens: originalTokens,
        ratio: 1.0,
        strategy: "text-passthrough",
      };
    }

    let head = lines.slice(0, headLines);
    let tail = lines.slice(-tailLines);
    const elided = lines.length - headLines - tailLines;
    const marker = `... [${elided} lines elided] ...`;

    let compressed = [...head, marker, ...tail].join("\n");

    if (opts.maxTokens !== undefined) {
      const cap = opts.maxTokens;
      let current = countTokens(compressed);
      if (current > cap) {
        // Reduce head and tail proportionally until we fit
        let h = headLines;
        let t = tailLines;
        while (current > cap && (h > 1 || t > 1)) {
          if (h > t && h > 1) h--;
          else if (t > 1) t--;
          else if (h > 1) h--;
          const elidedInner = lines.length - h - t;
          const markerInner = `... [${elidedInner} lines elided] ...`;
          compressed = [...lines.slice(0, h), markerInner, ...lines.slice(-t)].join("\n");
          current = countTokens(compressed);
        }

        if (current > cap) {
          const truncMarker = `\n... [truncated to token limit] ...`;
          compressed = compressed.slice(0, Math.floor(compressed.length * 0.5)) + truncMarker;
        }
      }
    }

    const compressedTokens = countTokens(compressed);
    return {
      content: compressed,
      originalTokens,
      compressedTokens,
      ratio: compressedTokens / originalTokens,
      strategy: "text-head-tail",
    };
  }
}
