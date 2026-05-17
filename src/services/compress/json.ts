import { countTokens } from "gpt-tokenizer";
import { TextCompressor } from "./text.js";
import type { CompressionOptions, CompressionResult } from "./types.js";

const DEFAULT_MAX_ARRAY_ITEMS = 5;
const DEFAULT_MAX_STRING_LEN = 200;
const DEFAULT_MAX_DEPTH = 6;
const DEFAULT_DROP_NULLS = true;

function compressValue(
  val: unknown,
  maxArrayItems: number,
  maxStringLen: number,
  dropNulls: boolean,
  depth: number,
): unknown {
  if (depth > DEFAULT_MAX_DEPTH) {
    return "...nested...";
  }

  if (val === null || val === undefined) {
    return val;
  }

  if (typeof val === "string") {
    if (val.length > maxStringLen) {
      const elided = val.length - maxStringLen;
      return val.slice(0, maxStringLen) + `... [${elided} chars elided] ...`;
    }
    return val;
  }

  if (Array.isArray(val)) {
    if (val.length <= maxArrayItems) {
      return val.map((item) => compressValue(item, maxArrayItems, maxStringLen, dropNulls, depth + 1));
    }

    const keepHead = 3;
    const keepTail = 2;
    const middle = val.length - keepHead - keepTail;

    const head = val
      .slice(0, keepHead)
      .map((item) => compressValue(item, maxArrayItems, maxStringLen, dropNulls, depth + 1));

    const tail = val
      .slice(-keepTail)
      .map((item) => compressValue(item, maxArrayItems, maxStringLen, dropNulls, depth + 1));

    // Check for structural similarity across members
    const allObjects = val.every((item) => item !== null && typeof item === "object" && !Array.isArray(item));
    if (allObjects && middle > 0) {
      const firstKeys = Object.keys(val[0] as Record<string, unknown>).sort().join(",");
      const allSameShape = val.every(
        (item) => Object.keys(item as Record<string, unknown>).sort().join(",") === firstKeys,
      );
      if (allSameShape) {
        return [...head, `...${middle} similar items...`, ...tail];
      }
    }

    return [...head, `...${middle} more items...`, ...tail];
  }

  if (typeof val === "object") {
    const obj = val as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(obj)) {
      if (dropNulls && (v === null || v === undefined)) continue;
      result[key] = compressValue(v, maxArrayItems, maxStringLen, dropNulls, depth + 1);
    }
    return result;
  }

  return val;
}

const textCompressor = new TextCompressor();

export class JsonCompressor {
  compress(content: string, opts: CompressionOptions = {}): CompressionResult {
    const originalTokens = countTokens(content);

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      const result = textCompressor.compress(content, opts);
      return { ...result, strategy: "json-parse-failed" };
    }

    const maxArrayItems = opts.maxArrayItems ?? DEFAULT_MAX_ARRAY_ITEMS;
    const maxStringLen = opts.maxStringLen ?? DEFAULT_MAX_STRING_LEN;

    const compressed = compressValue(parsed, maxArrayItems, maxStringLen, DEFAULT_DROP_NULLS, 0);
    const serialized = JSON.stringify(compressed, null, 2);
    const compressedTokens = countTokens(serialized);

    return {
      content: serialized,
      originalTokens,
      compressedTokens,
      ratio: compressedTokens / originalTokens,
      strategy: "json-compress",
    };
  }
}
