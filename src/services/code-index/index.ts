import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Parser } from "./parser.js";
import { extract } from "./extractor.js";
import { Store, hashContent } from "./store.js";
import { FileWatcher } from "./watcher.js";
import { CodeIndexQuery } from "./query.js";

export type { CodeIndexQuery };
export type * from "./types.js";

const SUPPORTED_EXTENSIONS = new Set([
  ".ts", ".tsx", ".mts", ".cts",
  ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".rs", ".go", ".rb", ".java",
  ".html", ".htm", ".json", ".yaml", ".yml",
]);

export interface CodeIndexOptions {
  workspaceRoot: string;
  dbDir?: string;
}

export class CodeIndex {
  private readonly workspaceRoot: string;
  private readonly dbDir: string;
  private readonly parser = new Parser();
  private store!: Store;
  private watcher!: FileWatcher;
  private query!: CodeIndexQuery;

  constructor(opts: CodeIndexOptions) {
    this.workspaceRoot = path.resolve(opts.workspaceRoot);
    this.dbDir = opts.dbDir ?? path.join(this.workspaceRoot, "runs", ".code-index");
  }

  async init(): Promise<void> {
    await fs.mkdir(this.dbDir, { recursive: true });
    const dbPath = path.join(this.dbDir, "index.db");

    this.store = new Store(dbPath);
    this.store.init();

    this.query = new CodeIndexQuery(this.store);

    await this.walkAndIndex(this.workspaceRoot);

    this.watcher = new FileWatcher({
      workspaceRoot: this.workspaceRoot,
      onChange: (filePath) => {
        void this.indexFile(filePath);
      },
      onDelete: (filePath) => {
        this.store.removeFile(filePath);
      },
    });
    this.watcher.start();
  }

  async shutdown(): Promise<void> {
    this.watcher?.stop();
    this.store?.close();
  }

  getQuery(): CodeIndexQuery {
    return this.query;
  }

  getStats(): { fileCount: number; symbolCount: number } {
    return this.store.stats();
  }

  private async walkAndIndex(dir: string): Promise<void> {
    let entries: Array<{ name: string; isDirectory: () => boolean }>;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true }) as typeof entries;
    } catch {
      return;
    }

    const tasks: Promise<void>[] = [];

    for (const entry of entries) {
      const name = String(entry.name);
      if (shouldSkipDir(name)) continue;

      const fullPath = path.join(dir, name);

      if (entry.isDirectory()) {
        tasks.push(this.walkAndIndex(fullPath));
      } else {
        const ext = path.extname(name).toLowerCase();
        if (SUPPORTED_EXTENSIONS.has(ext)) {
          tasks.push(this.indexFile(fullPath));
        }
      }
    }

    await Promise.all(tasks);
  }

  private async indexFile(filePath: string): Promise<void> {
    let content: string;
    try {
      content = await fs.readFile(filePath, "utf8");
    } catch {
      return;
    }

    const hash = hashContent(content);
    const existing = this.store.fileHash(filePath);
    if (existing === hash) return; // unchanged

    const parsed = this.parser.parse(filePath, content);
    if (!parsed) return;

    const result = extract(parsed);
    const allSymbols = deduplicateSymbols([
      ...result.exportedSymbols,
      ...result.definitions.filter(
        (d) => !result.exportedSymbols.some((e) => e.name === d.name && e.range.start === d.range.start),
      ),
    ]);

    this.store.upsertFile(
      filePath,
      parsed.language,
      content,
      hash,
      allSymbols,
      result.imports,
    );
  }
}

function shouldSkipDir(name: string): boolean {
  return (
    name === "node_modules" ||
    name === ".git" ||
    name === "dist" ||
    name === "build" ||
    name === "coverage" ||
    name === ".code-index" ||
    name === "runs"
  );
}

function deduplicateSymbols(symbols: import("./types.js").Symbol[]): import("./types.js").Symbol[] {
  const seen = new Set<string>();
  return symbols.filter((s) => {
    const key = `${s.name}:${s.range.start}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
