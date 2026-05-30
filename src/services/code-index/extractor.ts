import type {
  ExtractResult,
  Symbol,
  Import,
  SymbolKind,
  SymbolRange,
} from "./types.js";
import type { ParseResult } from "./types.js";

// Lazy-loaded estree parser — only resolved on first TS/JS extraction.
let estreeParser: typeof import("@typescript-eslint/typescript-estree") | null =
  null;

async function getEstreeParser() {
  if (estreeParser === null) {
    try {
      estreeParser = await import("@typescript-eslint/typescript-estree");
    } catch {
      return null;
    }
  }
  return estreeParser;
}

// Synchronous estree parser reference — populated on first call.
let estreeSync: typeof import("@typescript-eslint/typescript-estree") | null =
  null;

function loadEstreeSync(): typeof import("@typescript-eslint/typescript-estree") | null {
  if (estreeSync !== null) return estreeSync;
  try {
    // ESM workaround: use createRequire-style dynamic access at runtime.
    // This is intentional — the module is CommonJS-compatible.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("@typescript-eslint/typescript-estree");
    estreeSync = mod as typeof import("@typescript-eslint/typescript-estree");
    return estreeSync;
  } catch {
    return null;
  }
}

type AnyNode = {
  type: string;
  [key: string]: unknown;
};

function getRange(node: AnyNode): SymbolRange {
  const r = node.range as [number, number] | undefined;
  return r ? { start: r[0], end: r[1] } : { start: 0, end: 0 };
}

function extractSignature(content: string, range: SymbolRange): string {
  const raw = content.slice(range.start, range.end);
  // Return up to first { or ; to capture the declaration without body.
  const brace = raw.indexOf("{");
  const semi = raw.indexOf(";");
  let end = raw.length;
  if (brace !== -1 && (semi === -1 || brace < semi)) end = brace;
  else if (semi !== -1) end = semi + 1;
  return raw.slice(0, end).trim();
}

function nodeKind(node: AnyNode): SymbolKind | null {
  switch (node.type) {
    case "FunctionDeclaration":
    case "TSDeclareFunction":
      return "function";
    case "ClassDeclaration":
      return "class";
    case "TSInterfaceDeclaration":
      return "interface";
    case "TSTypeAliasDeclaration":
      return "type";
    case "TSEnumDeclaration":
      return "enum";
    case "VariableDeclaration": {
      const kind = (node.kind as string) === "const" ? "const" : "variable";
      return kind;
    }
    default:
      return null;
  }
}

function extractTsJs(content: string, isTypeScript: boolean): ExtractResult {
  const mod = loadEstreeSync();
  if (mod === null) {
    return { exportedSymbols: [], definitions: [], imports: [] };
  }

  let ast: AnyNode;
  try {
    ast = mod.parse(content, {
      jsx: true,
      range: true,
      tolerant: true,
    }) as unknown as AnyNode;
  } catch {
    return { exportedSymbols: [], definitions: [], imports: [] };
  }

  const exported: Symbol[] = [];
  const definitions: Symbol[] = [];
  const imports: Import[] = [];

  const body = (ast.body as AnyNode[]) ?? [];

  for (const node of body) {
    if (
      node.type === "ImportDeclaration" ||
      node.type === "TSImportEqualsDeclaration"
    ) {
      const fromVal =
        node.type === "ImportDeclaration"
          ? (node.source as AnyNode).value
          : (
              (node.moduleReference as AnyNode)
                ?.expression as AnyNode | undefined
            )?.value;
      if (typeof fromVal !== "string") continue;

      const specifiers = (node.specifiers as AnyNode[]) ?? [];
      const symbols = specifiers.map((s) => {
        if (s.type === "ImportDefaultSpecifier")
          return (s.local as AnyNode).name as string;
        if (s.type === "ImportNamespaceSpecifier") return "*";
        const imported = s.imported as AnyNode | undefined;
        return (imported?.name ?? (s.local as AnyNode).name) as string;
      });
      imports.push({ from: fromVal, symbols, range: getRange(node) });
      continue;
    }

    if (node.type === "ExportNamedDeclaration") {
      const decl = node.declaration as AnyNode | null;
      if (decl) {
        const kind = nodeKind(decl);
        if (kind !== null) {
          const names = namesFromDecl(decl);
          for (const name of names) {
            const range = getRange(decl);
            const sym: Symbol = {
              name,
              kind,
              range,
              signature: extractSignature(content, range),
              isExported: true,
            };
            exported.push(sym);
            definitions.push({ ...sym });
          }
        }
      }
      // re-exports: export { foo } from './bar'
      const src = node.source as AnyNode | null;
      if (src) {
        const fromVal = src.value as string;
        const specifiers = (node.specifiers as AnyNode[]) ?? [];
        const syms = specifiers.map(
          (s) =>
            ((s.exported as AnyNode)?.name ?? (s.local as AnyNode).name) as string,
        );
        imports.push({
          from: fromVal,
          symbols: syms,
          range: getRange(node),
        });
      }
      continue;
    }

    if (node.type === "ExportDefaultDeclaration") {
      const decl = node.declaration as AnyNode;
      const range = getRange(node);
      const sym: Symbol = {
        name: "default",
        kind:
          decl.type === "FunctionDeclaration" ||
          decl.type === "ArrowFunctionExpression"
            ? "function"
            : decl.type === "ClassDeclaration"
              ? "class"
              : "variable",
        range,
        signature: extractSignature(content, range),
        isExported: true,
      };
      exported.push(sym);
      definitions.push({ ...sym });
      continue;
    }

    if (node.type === "ExportAllDeclaration") {
      const src = node.source as AnyNode;
      if (typeof src.value === "string") {
        imports.push({ from: src.value, symbols: ["*"], range: getRange(node) });
      }
      continue;
    }

    // Top-level non-exported declarations.
    const kind = nodeKind(node);
    if (kind !== null) {
      const names = namesFromDecl(node);
      for (const name of names) {
        const range = getRange(node);
        definitions.push({
          name,
          kind,
          range,
          signature: extractSignature(content, range),
          isExported: false,
        });
      }
    }
  }

  return { exportedSymbols: exported, definitions, imports };
}

function namesFromDecl(node: AnyNode): string[] {
  if (node.type === "VariableDeclaration") {
    const declarators = (node.declarations as AnyNode[]) ?? [];
    return declarators
      .map((d) => {
        const id = d.id as AnyNode | undefined;
        return id?.name as string | undefined;
      })
      .filter((n): n is string => typeof n === "string");
  }
  const id = node.id as AnyNode | null | undefined;
  if (id?.name && typeof id.name === "string") return [id.name];
  return [];
}

// ——————————————————————————————————————————————————————————
// Regex-based extractors for other languages
// ——————————————————————————————————————————————————————————

function offsetToRange(content: string, matchIndex: number, length: number): SymbolRange {
  return { start: matchIndex, end: matchIndex + length };
}

interface RegexSymbol {
  pattern: RegExp;
  kind: SymbolKind;
  nameGroup: number;
  exported?: boolean;
}

function regexExtract(
  content: string,
  patterns: RegexSymbol[],
  importPatterns: Array<{ pattern: RegExp; fromGroup: number; nameGroup?: number }>,
): ExtractResult {
  const definitions: Symbol[] = [];
  const exports: Symbol[] = [];
  const imports: Import[] = [];

  for (const { pattern, kind, nameGroup, exported: isExported = false } of patterns) {
    let m: RegExpExecArray | null;
    pattern.lastIndex = 0;
    while ((m = pattern.exec(content)) !== null) {
      const name = m[nameGroup];
      if (!name) continue;
      const range = offsetToRange(content, m.index, m[0].length);
      const sym: Symbol = {
        name,
        kind,
        range,
        signature: m[0].trim().slice(0, 120),
        isExported: isExported,
      };
      definitions.push(sym);
      if (isExported) exports.push(sym);
    }
  }

  for (const { pattern, fromGroup, nameGroup } of importPatterns) {
    let m: RegExpExecArray | null;
    pattern.lastIndex = 0;
    while ((m = pattern.exec(content)) !== null) {
      const from = m[fromGroup];
      if (!from) continue;
      const symbols = nameGroup && m[nameGroup] ? [m[nameGroup]] : [];
      const range = offsetToRange(content, m.index, m[0].length);
      imports.push({ from, symbols, range });
    }
  }

  return { exportedSymbols: exports, definitions, imports };
}

function extractPython(content: string): ExtractResult {
  const patterns: RegexSymbol[] = [
    {
      pattern: /^(?:async\s+)?def\s+(\w+)\s*\(/gm,
      kind: "function",
      nameGroup: 1,
      exported: false,
    },
    {
      pattern: /^class\s+(\w+)\s*[:(]/gm,
      kind: "class",
      nameGroup: 1,
      exported: false,
    },
  ];
  const importPatterns = [
    {
      pattern: /^from\s+([\w.]+)\s+import\s+(\w+)/gm,
      fromGroup: 1,
      nameGroup: 2,
    },
    { pattern: /^import\s+([\w.]+)/gm, fromGroup: 1 },
  ];

  const result = regexExtract(content, patterns, importPatterns);

  // Python has no export keyword — public names (no leading underscore) are exported.
  result.exportedSymbols = result.definitions.filter(
    (d) => !d.name.startsWith("_"),
  );
  result.definitions = result.definitions.map((d) => ({
    ...d,
    isExported: !d.name.startsWith("_"),
  }));

  return result;
}

function extractRust(content: string): ExtractResult {
  const patterns: RegexSymbol[] = [
    {
      pattern: /^pub(?:\([^)]*\))?\s+(?:async\s+)?fn\s+(\w+)/gm,
      kind: "function",
      nameGroup: 1,
      exported: true,
    },
    {
      pattern: /^(?:async\s+)?fn\s+(\w+)/gm,
      kind: "function",
      nameGroup: 1,
      exported: false,
    },
    {
      pattern: /^pub(?:\([^)]*\))?\s+struct\s+(\w+)/gm,
      kind: "class",
      nameGroup: 1,
      exported: true,
    },
    {
      pattern: /^struct\s+(\w+)/gm,
      kind: "class",
      nameGroup: 1,
      exported: false,
    },
    {
      pattern: /^pub(?:\([^)]*\))?\s+enum\s+(\w+)/gm,
      kind: "enum",
      nameGroup: 1,
      exported: true,
    },
    {
      pattern: /^pub(?:\([^)]*\))?\s+trait\s+(\w+)/gm,
      kind: "interface",
      nameGroup: 1,
      exported: true,
    },
    {
      pattern: /^pub(?:\([^)]*\))?\s+type\s+(\w+)/gm,
      kind: "type",
      nameGroup: 1,
      exported: true,
    },
    {
      pattern: /^pub(?:\([^)]*\))?\s+const\s+(\w+)/gm,
      kind: "const",
      nameGroup: 1,
      exported: true,
    },
    {
      pattern: /^pub(?:\([^)]*\))?\s+mod\s+(\w+)/gm,
      kind: "module",
      nameGroup: 1,
      exported: true,
    },
  ];
  const importPatterns = [
    { pattern: /^use\s+([\w:]+(?:::\{[^}]*\})?)/gm, fromGroup: 1 },
    { pattern: /^mod\s+(\w+)/gm, fromGroup: 1 },
  ];
  return regexExtract(content, patterns, importPatterns);
}

function extractGo(content: string): ExtractResult {
  const patterns: RegexSymbol[] = [
    {
      pattern: /^func\s+(?:\([^)]+\)\s+)?([A-Z]\w*)\s*\(/gm,
      kind: "function",
      nameGroup: 1,
      exported: true,
    },
    {
      pattern: /^func\s+(?:\([^)]+\)\s+)?([a-z]\w*)\s*\(/gm,
      kind: "function",
      nameGroup: 1,
      exported: false,
    },
    {
      pattern: /^type\s+([A-Z]\w*)\s+struct/gm,
      kind: "class",
      nameGroup: 1,
      exported: true,
    },
    {
      pattern: /^type\s+([A-Z]\w*)\s+interface/gm,
      kind: "interface",
      nameGroup: 1,
      exported: true,
    },
    {
      pattern: /^type\s+([A-Z]\w*)\s+/gm,
      kind: "type",
      nameGroup: 1,
      exported: true,
    },
    {
      pattern: /^const\s+([A-Z]\w*)\s*/gm,
      kind: "const",
      nameGroup: 1,
      exported: true,
    },
  ];
  const importPatterns = [
    { pattern: /import\s+"([\w./]+)"/gm, fromGroup: 1 },
    { pattern: /import\s+\w+\s+"([\w./]+)"/gm, fromGroup: 1 },
  ];
  return regexExtract(content, patterns, importPatterns);
}

function extractRuby(content: string): ExtractResult {
  const patterns: RegexSymbol[] = [
    {
      pattern: /^def\s+(self\.)?(\w+)/gm,
      kind: "function",
      nameGroup: 2,
      exported: false,
    },
    {
      pattern: /^class\s+(\w+)/gm,
      kind: "class",
      nameGroup: 1,
      exported: true,
    },
    {
      pattern: /^module\s+(\w+)/gm,
      kind: "module",
      nameGroup: 1,
      exported: true,
    },
  ];
  const importPatterns = [
    { pattern: /^require(?:_relative)?\s+['"]([^'"]+)['"]/gm, fromGroup: 1 },
  ];
  const result = regexExtract(content, patterns, importPatterns);
  result.exportedSymbols = result.definitions.filter(
    (d) => d.kind === "class" || d.kind === "module",
  );
  return result;
}

function extractJava(content: string): ExtractResult {
  const patterns: RegexSymbol[] = [
    {
      pattern: /public\s+(?:static\s+)?(?:\w+\s+)+(\w+)\s*\(/g,
      kind: "function",
      nameGroup: 1,
      exported: true,
    },
    {
      pattern: /public\s+(?:abstract\s+)?class\s+(\w+)/g,
      kind: "class",
      nameGroup: 1,
      exported: true,
    },
    {
      pattern: /public\s+interface\s+(\w+)/g,
      kind: "interface",
      nameGroup: 1,
      exported: true,
    },
    {
      pattern: /public\s+enum\s+(\w+)/g,
      kind: "enum",
      nameGroup: 1,
      exported: true,
    },
  ];
  const importPatterns = [
    { pattern: /^import\s+([\w.]+);/gm, fromGroup: 1 },
  ];
  return regexExtract(content, patterns, importPatterns);
}

function extractHtml(content: string): ExtractResult {
  // Extract script src and link href as "imports".
  const imports: Import[] = [];
  const scriptSrc = /<script[^>]+src=["']([^"']+)["']/gi;
  const linkHref = /<link[^>]+href=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = scriptSrc.exec(content)) !== null) {
    const src = m[1];
    if (src) {
      imports.push({
        from: src,
        symbols: [],
        range: offsetToRange(content, m.index, m[0].length),
      });
    }
  }
  while ((m = linkHref.exec(content)) !== null) {
    const href = m[1];
    if (href) {
      imports.push({
        from: href,
        symbols: [],
        range: offsetToRange(content, m.index, m[0].length),
      });
    }
  }
  return { exportedSymbols: [], definitions: [], imports };
}

function extractJson(_content: string): ExtractResult {
  return { exportedSymbols: [], definitions: [], imports: [] };
}

function extractYaml(_content: string): ExtractResult {
  return { exportedSymbols: [], definitions: [], imports: [] };
}

export function extract(parsed: ParseResult): ExtractResult {
  const { language, content } = parsed;
  switch (language) {
    case "typescript":
    case "javascript":
      return extractTsJs(content, language === "typescript");
    case "python":
      return extractPython(content);
    case "rust":
      return extractRust(content);
    case "go":
      return extractGo(content);
    case "ruby":
      return extractRuby(content);
    case "java":
      return extractJava(content);
    case "html":
      return extractHtml(content);
    case "json":
      return extractJson(content);
    case "yaml":
      return extractYaml(content);
    default:
      return { exportedSymbols: [], definitions: [], imports: [] };
  }
}
