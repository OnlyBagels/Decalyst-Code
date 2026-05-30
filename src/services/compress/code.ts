import { countTokens } from "gpt-tokenizer";
import type { CompressionOptions, CompressionResult } from "./types.js";

const SUPPORTED = new Set(["ts", "tsx", "js", "jsx", "typescript", "javascript", "python", "go", "rust", "py"]);

function stripBody(content: string, lang: string): string {
  if (lang === "python" || lang === "py") {
    return stripPython(content);
  }
  return stripCurlyBrace(content);
}

// Replaces function/class bodies (delimited by braces) with a placeholder.
// This is a simple brace-counting approach — not a full parser.
function stripCurlyBrace(content: string): string {
  const lines = content.split("\n");
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();

    // Keep imports, exports (non-function), type declarations, interfaces
    if (
      trimmed.startsWith("import ") ||
      trimmed.startsWith("export type ") ||
      trimmed.startsWith("export interface ") ||
      trimmed.startsWith("interface ") ||
      trimmed.startsWith("type ") ||
      trimmed.startsWith("export enum ") ||
      trimmed.startsWith("enum ")
    ) {
      out.push(line);
      i++;
      continue;
    }

    // Detect function/class/const-arrow declarations that open a block
    const isFuncOrClass =
      /^\s*(export\s+)?(async\s+)?function\s+\w+/.test(line) ||
      /^\s*(export\s+)?(abstract\s+)?class\s+\w+/.test(line) ||
      /^\s*(export\s+)?(const|let|var)\s+\w+\s*=\s*(async\s+)?\(/.test(line) ||
      /^\s*(export\s+)?(const|let|var)\s+\w+\s*=\s*(async\s+)?function/.test(line);

    if (!isFuncOrClass) {
      out.push(line);
      i++;
      continue;
    }

    // Collect the signature up to and including the opening brace
    let signature = line;
    let j = i;
    let depth = 0;
    let openFound = false;

    // Walk ahead to find the opening {
    while (j < lines.length) {
      const cur = lines[j] ?? "";
      for (const ch of cur) {
        if (ch === "{") {
          depth++;
          openFound = true;
        } else if (ch === "}") {
          depth--;
        }
      }
      if (j > i) signature += "\n" + cur;
      if (openFound) break;
      j++;
    }

    if (!openFound) {
      out.push(line);
      i++;
      continue;
    }

    // Now consume until depth reaches 0
    let body = j;
    while (body < lines.length && depth > 0) {
      const cur = lines[body] ?? "";
      for (const ch of cur) {
        if (ch === "{") depth++;
        else if (ch === "}") depth--;
      }
      body++;
    }

    // Build collapsed form: signature up to {, placeholder, closing }
    const sigUpToOpen = signature.replace(/\{[^]*$/, "{");
    out.push(sigUpToOpen + " /* ... */ }");
    i = body;
  }

  return out.join("\n");
}

function stripPython(content: string): string {
  const lines = content.split("\n");
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";
    const isFuncOrClass = /^\s*(async\s+)?def\s+\w+|^\s*class\s+\w+/.test(line);

    if (!isFuncOrClass) {
      out.push(line);
      i++;
      continue;
    }

    out.push(line);
    out.push("    ...");

    // Skip body lines (indented deeper than the def/class line)
    const baseIndent = (line.match(/^(\s*)/) ?? ["", ""])[1]!.length;
    i++;
    while (i < lines.length) {
      const next = lines[i] ?? "";
      if (next.trim() === "") {
        i++;
        continue;
      }
      const nextIndent = (next.match(/^(\s*)/) ?? ["", ""])[1]!.length;
      if (nextIndent <= baseIndent) break;
      i++;
    }
  }

  return out.join("\n");
}

export class CodeCompressor {
  compress(content: string, opts: CompressionOptions & { language: string }): CompressionResult {
    const originalTokens = countTokens(content);
    const lang = opts.language.toLowerCase();

    if (!SUPPORTED.has(lang)) {
      return {
        content,
        originalTokens,
        compressedTokens: originalTokens,
        ratio: 1.0,
        strategy: "code-passthrough",
      };
    }

    const stripped = stripBody(content, lang);
    const compressedTokens = countTokens(stripped);

    return {
      content: stripped,
      originalTokens,
      compressedTokens,
      ratio: compressedTokens / originalTokens,
      strategy: "code-signatures",
    };
  }
}
