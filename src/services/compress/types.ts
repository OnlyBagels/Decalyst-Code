export type InputKind = "code" | "json" | "text" | "tool-output";

export interface CompressionOptions {
  maxTokens?: number;
  maxArrayItems?: number;
  maxStringLen?: number;
  headLines?: number;
  tailLines?: number;
  language?: string;
}

export interface CompressionResult {
  content: string;
  originalTokens: number;
  compressedTokens: number;
  ratio: number;
  strategy: string;
}
