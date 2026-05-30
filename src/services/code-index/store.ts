import * as path from "node:path";
import * as crypto from "node:crypto";
import Database from "better-sqlite3";
import type { Symbol, Import, SymbolHit } from "./types.js";

const SCHEMA_VERSION = 1;

export class Store {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
  }

  init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS files (
        id      INTEGER PRIMARY KEY AUTOINCREMENT,
        path    TEXT UNIQUE NOT NULL,
        language TEXT NOT NULL,
        hash    TEXT NOT NULL,
        mtime   INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS symbols (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        file_id     INTEGER NOT NULL,
        name        TEXT NOT NULL,
        kind        TEXT NOT NULL,
        signature   TEXT,
        range_start INTEGER NOT NULL DEFAULT 0,
        range_end   INTEGER NOT NULL DEFAULT 0,
        is_exported INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY(file_id) REFERENCES files(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS imports (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        file_id     INTEGER NOT NULL,
        from_path   TEXT NOT NULL,
        name        TEXT NOT NULL DEFAULT '',
        range_start INTEGER NOT NULL DEFAULT 0,
        range_end   INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY(file_id) REFERENCES files(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_symbols_name    ON symbols(name);
      CREATE INDEX IF NOT EXISTS idx_symbols_file    ON symbols(file_id);
      CREATE INDEX IF NOT EXISTS idx_imports_file    ON imports(file_id);
      CREATE INDEX IF NOT EXISTS idx_imports_from    ON imports(from_path);
    `);

    // FTS5 virtual table for symbol search.
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS symbols_fts
        USING fts5(name, signature, content=symbols, content_rowid=id);

      CREATE TRIGGER IF NOT EXISTS symbols_ai AFTER INSERT ON symbols BEGIN
        INSERT INTO symbols_fts(rowid, name, signature)
          VALUES (new.id, new.name, COALESCE(new.signature, ''));
      END;

      CREATE TRIGGER IF NOT EXISTS symbols_ad AFTER DELETE ON symbols BEGIN
        INSERT INTO symbols_fts(symbols_fts, rowid, name, signature)
          VALUES ('delete', old.id, old.name, COALESCE(old.signature, ''));
      END;

      CREATE TRIGGER IF NOT EXISTS symbols_au AFTER UPDATE ON symbols BEGIN
        INSERT INTO symbols_fts(symbols_fts, rowid, name, signature)
          VALUES ('delete', old.id, old.name, COALESCE(old.signature, ''));
        INSERT INTO symbols_fts(rowid, name, signature)
          VALUES (new.id, new.name, COALESCE(new.signature, ''));
      END;
    `);

    const versionRow = this.db
      .prepare("SELECT version FROM schema_version LIMIT 1")
      .get() as { version: number } | undefined;

    if (!versionRow) {
      this.db
        .prepare("INSERT INTO schema_version (version) VALUES (?)")
        .run(SCHEMA_VERSION);
    }
  }

  upsertFile(
    filePath: string,
    language: string,
    content: string,
    hash: string,
    symbols: Symbol[],
    imports: Import[],
  ): void {
    const mtime = Date.now();

    const upsert = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO files (path, language, hash, mtime)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(path) DO UPDATE SET
             language = excluded.language,
             hash     = excluded.hash,
             mtime    = excluded.mtime`,
        )
        .run(filePath, language, hash, mtime);

      const fileRow = this.db
        .prepare("SELECT id FROM files WHERE path = ?")
        .get(filePath) as { id: number };
      const fileId = fileRow.id;

      this.db.prepare("DELETE FROM symbols WHERE file_id = ?").run(fileId);
      this.db.prepare("DELETE FROM imports WHERE file_id = ?").run(fileId);

      const insertSymbol = this.db.prepare(
        `INSERT INTO symbols (file_id, name, kind, signature, range_start, range_end, is_exported)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const sym of symbols) {
        insertSymbol.run(
          fileId,
          sym.name,
          sym.kind,
          sym.signature ?? null,
          sym.range.start,
          sym.range.end,
          sym.isExported ? 1 : 0,
        );
      }

      const insertImport = this.db.prepare(
        `INSERT INTO imports (file_id, from_path, name, range_start, range_end)
         VALUES (?, ?, ?, ?, ?)`,
      );
      for (const imp of imports) {
        if (imp.symbols.length === 0) {
          insertImport.run(
            fileId,
            imp.from,
            "",
            imp.range.start,
            imp.range.end,
          );
        } else {
          for (const name of imp.symbols) {
            insertImport.run(
              fileId,
              imp.from,
              name,
              imp.range.start,
              imp.range.end,
            );
          }
        }
      }
    });

    upsert();
  }

  removeFile(filePath: string): void {
    const row = this.db
      .prepare("SELECT id FROM files WHERE path = ?")
      .get(filePath) as { id: number } | undefined;
    if (!row) return;
    this.db.prepare("DELETE FROM symbols WHERE file_id = ?").run(row.id);
    this.db.prepare("DELETE FROM imports WHERE file_id = ?").run(row.id);
    this.db.prepare("DELETE FROM files WHERE id = ?").run(row.id);
  }

  querySymbols(query: string, limit = 20): SymbolHit[] {
    // FTS5 prefix query: append * so "greet" matches "greetUser", "greetAdmin", etc.
    // Escape any FTS5 special chars in the query first.
    const ftsQuery = sanitizeFtsQuery(query);
    // Try FTS5 first.
    try {
      const rows = this.db
        .prepare(
          `SELECT s.name, s.kind, s.signature, s.range_start, s.range_end, s.is_exported, f.path
           FROM symbols_fts fts
           JOIN symbols s ON s.id = fts.rowid
           JOIN files f ON f.id = s.file_id
           WHERE symbols_fts MATCH ?
           ORDER BY rank
           LIMIT ?`,
        )
        .all(ftsQuery, limit) as Array<{
        name: string;
        kind: string;
        signature: string | null;
        range_start: number;
        range_end: number;
        is_exported: number;
        path: string;
      }>;
      return rows.map(rowToHit);
    } catch {
      // FTS failed — fall back to LIKE search.
      const rows = this.db
        .prepare(
          `SELECT s.name, s.kind, s.signature, s.range_start, s.range_end, s.is_exported, f.path
           FROM symbols s
           JOIN files f ON f.id = s.file_id
           WHERE s.name LIKE ?
           ORDER BY s.name
           LIMIT ?`,
        )
        .all(`%${query}%`, limit) as Array<{
        name: string;
        kind: string;
        signature: string | null;
        range_start: number;
        range_end: number;
        is_exported: number;
        path: string;
      }>;
      return rows.map(rowToHit);
    }
  }

  getSymbolsInFile(filePath: string): SymbolHit[] {
    const rows = this.db
      .prepare(
        `SELECT s.name, s.kind, s.signature, s.range_start, s.range_end, s.is_exported, f.path
         FROM symbols s
         JOIN files f ON f.id = s.file_id
         WHERE f.path = ?
         ORDER BY s.range_start`,
      )
      .all(filePath) as Array<{
      name: string;
      kind: string;
      signature: string | null;
      range_start: number;
      range_end: number;
      is_exported: number;
      path: string;
    }>;
    return rows.map(rowToHit);
  }

  getImportsForFile(filePath: string): Array<{
    fromPath: string;
    name: string;
    rangeStart: number;
    rangeEnd: number;
  }> {
    const rows = this.db
      .prepare(
        `SELECT i.from_path, i.name, i.range_start, i.range_end
         FROM imports i
         JOIN files f ON f.id = i.file_id
         WHERE f.path = ?`,
      )
      .all(filePath) as Array<{
      from_path: string;
      name: string;
      range_start: number;
      range_end: number;
    }>;
    return rows.map((r) => ({
      fromPath: r.from_path,
      name: r.name,
      rangeStart: r.range_start,
      rangeEnd: r.range_end,
    }));
  }

  resolveImportTarget(
    fromFile: string,
    importStr: string,
  ): string | null {
    // Only resolve relative imports.
    if (!importStr.startsWith(".")) return null;

    const dir = path.dirname(fromFile);
    const candidate = path.posix.normalize(path.posix.join(dir, importStr));

    // Try exact match first, then with common extensions.
    const extensions = [".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"];
    const toCheck = [
      candidate,
      ...extensions.map((e) => candidate + e),
      ...extensions.map((e) => candidate + "/index" + e),
    ];

    for (const c of toCheck) {
      const row = this.db
        .prepare("SELECT path FROM files WHERE path = ?")
        .get(c) as { path: string } | undefined;
      if (row) return row.path;
    }
    return null;
  }

  fileHash(filePath: string): string | null {
    const row = this.db
      .prepare("SELECT hash FROM files WHERE path = ?")
      .get(filePath) as { hash: string } | undefined;
    return row?.hash ?? null;
  }

  stats(): { fileCount: number; symbolCount: number } {
    const fc = this.db
      .prepare("SELECT COUNT(*) as c FROM files")
      .get() as { c: number };
    const sc = this.db
      .prepare("SELECT COUNT(*) as c FROM symbols")
      .get() as { c: number };
    return { fileCount: fc.c, symbolCount: sc.c };
  }

  allFilePaths(): string[] {
    const rows = this.db
      .prepare("SELECT path FROM files")
      .all() as Array<{ path: string }>;
    return rows.map((r) => r.path);
  }

  close(): void {
    this.db.close();
  }
}

function sanitizeFtsQuery(raw: string): string {
  // Strip FTS5 special chars that would cause a parse error, then add prefix wildcard.
  const safe = raw.replace(/["'*^()]/g, "").trim();
  if (!safe) return '""';
  return `${safe}*`;
}

function rowToHit(r: {
  name: string;
  kind: string;
  signature: string | null;
  range_start: number;
  range_end: number;
  is_exported: number;
  path: string;
}): SymbolHit {
  return {
    name: r.name,
    kind: r.kind as SymbolHit["kind"],
    signature: r.signature ?? undefined,
    filePath: r.path,
    rangeStart: r.range_start,
    rangeEnd: r.range_end,
    isExported: r.is_exported === 1,
  };
}

export function hashContent(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}
