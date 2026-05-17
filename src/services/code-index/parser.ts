import * as path from "node:path";
import type { ParseResult } from "./types.js";

const EXTENSION_MAP: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".mts": "typescript",
  ".cts": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".rs": "rust",
  ".go": "go",
  ".rb": "ruby",
  ".java": "java",
  ".html": "html",
  ".htm": "html",
  ".json": "json",
  ".yaml": "yaml",
  ".yml": "yaml",
};

// Languages supported by full AST extraction.
// Others get regex-based extraction.
const AST_SUPPORTED = new Set(["typescript", "javascript"]);

export class LanguageDetector {
  detect(filePath: string): string | null {
    const ext = path.extname(filePath).toLowerCase();
    return EXTENSION_MAP[ext] ?? null;
  }

  isAstSupported(language: string): boolean {
    return AST_SUPPORTED.has(language);
  }

  supportedLanguages(): string[] {
    return [...new Set(Object.values(EXTENSION_MAP))];
  }
}

export class Parser {
  private readonly detector = new LanguageDetector();

  parse(filePath: string, content: string): ParseResult | null {
    const language = this.detector.detect(filePath);
    if (language === null) {
      return null;
    }
    return { language, content };
  }
}
