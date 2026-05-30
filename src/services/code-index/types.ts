export type SymbolKind =
  | "function"
  | "class"
  | "const"
  | "type"
  | "interface"
  | "enum"
  | "variable"
  | "method"
  | "module";

export interface SymbolRange {
  start: number;
  end: number;
}

export interface Symbol {
  name: string;
  kind: SymbolKind;
  range: SymbolRange;
  signature?: string;
  isExported: boolean;
}

export interface Import {
  from: string;
  symbols: string[];
  range: SymbolRange;
}

export interface ExtractResult {
  exportedSymbols: Symbol[];
  definitions: Symbol[];
  imports: Import[];
}

export interface SymbolHit {
  name: string;
  kind: SymbolKind;
  signature?: string;
  filePath: string;
  rangeStart: number;
  rangeEnd: number;
  isExported: boolean;
}

export interface ImportEdge {
  fromFile: string;
  toFile: string;
  symbols: string[];
  rawImport: string;
}

export interface TextHit {
  filePath: string;
  line: number;
  column: number;
  text: string;
}

export type SignatureList = Array<{
  name: string;
  kind: SymbolKind;
  signature: string | undefined;
  range: SymbolRange;
}>;

export interface ParseResult {
  language: string;
  content: string;
}
