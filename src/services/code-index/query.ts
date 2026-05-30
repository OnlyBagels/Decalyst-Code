import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Store } from "./store.js";
import type {
  SignatureList,
  SymbolHit,
  ImportEdge,
  TextHit,
} from "./types.js";

export class CodeIndexQuery {
  constructor(private readonly store: Store) {}

  outline(filePath: string): SignatureList {
    const hits = this.store.getSymbolsInFile(filePath);
    return hits.map((h) => ({
      name: h.name,
      kind: h.kind,
      signature: h.signature,
      range: { start: h.rangeStart, end: h.rangeEnd },
    }));
  }

  findSymbol(name: string, limit = 20): SymbolHit[] {
    return this.store.querySymbols(name, limit);
  }

  importGraph(filePath?: string): ImportEdge[] {
    const filePaths = filePath
      ? [filePath]
      : this.store.allFilePaths();

    const edges: ImportEdge[] = [];

    for (const fp of filePaths) {
      const rawImports = this.store.getImportsForFile(fp);

      // Group by from_path.
      const byFrom = new Map<string, string[]>();
      for (const imp of rawImports) {
        const existing = byFrom.get(imp.fromPath) ?? [];
        if (imp.name) existing.push(imp.name);
        byFrom.set(imp.fromPath, existing);
      }

      for (const [rawImport, symbols] of byFrom) {
        const resolved =
          this.store.resolveImportTarget(fp, rawImport) ?? rawImport;
        edges.push({
          fromFile: fp,
          toFile: resolved,
          symbols: [...new Set(symbols)],
          rawImport,
        });
      }
    }

    return edges;
  }

  async searchText(query: string, glob?: string): Promise<TextHit[]> {
    // Try FTS symbol search first.
    const symbolHits = this.store.querySymbols(query, 50);
    if (symbolHits.length > 0) {
      return symbolHits.map((h) => ({
        filePath: h.filePath,
        line: 0,
        column: 0,
        text: h.signature ?? h.name,
      }));
    }

    // Fall through to filesystem regex search.
    const filePaths = this.store.allFilePaths();
    const pattern = new RegExp(query, "g");
    const results: TextHit[] = [];

    for (const fp of filePaths) {
      if (glob && !matchGlob(fp, glob)) continue;
      let content: string;
      try {
        content = await fs.readFile(fp, "utf8");
      } catch {
        continue;
      }
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        pattern.lastIndex = 0;
        const line = lines[i] ?? "";
        const m = pattern.exec(line);
        if (m) {
          results.push({
            filePath: fp,
            line: i + 1,
            column: m.index,
            text: line.trim(),
          });
        }
      }
    }

    return results;
  }

  // v2 feature — callers/callees require full call-graph analysis.
  callers(_symbolId: string): SymbolHit[] {
    return [];
  }

  callees(_symbolId: string): SymbolHit[] {
    return [];
  }
}

function matchGlob(filePath: string, glob: string): boolean {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "%%DS%%")
    .replace(/\*/g, "[^/]*")
    .replace(/%%DS%%/g, ".*");
  return new RegExp(escaped).test(filePath);
}
