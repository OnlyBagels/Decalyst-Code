import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Store, hashContent } from "../../../src/services/code-index/store.js";
import type { Symbol, Import } from "../../../src/services/code-index/types.js";

function makeStore(): Store {
  const store = new Store(":memory:");
  store.init();
  return store;
}

const SAMPLE_SYMBOLS: Symbol[] = [
  {
    name: "greet",
    kind: "function",
    range: { start: 0, end: 50 },
    signature: "export function greet(name: string): string",
    isExported: true,
  },
  {
    name: "SECRET",
    kind: "const",
    range: { start: 51, end: 80 },
    signature: "const SECRET = 42",
    isExported: false,
  },
];

const SAMPLE_IMPORTS: Import[] = [
  {
    from: "node:path",
    symbols: ["join", "resolve"],
    range: { start: 0, end: 30 },
  },
];

describe("Store — upsert and query", () => {
  let store: Store;

  beforeEach(() => {
    store = makeStore();
  });

  afterEach(() => {
    store.close();
  });

  it("upserts a file and retrieves symbols", () => {
    store.upsertFile(
      "src/hello.ts",
      "typescript",
      "export function greet() {}",
      hashContent("export function greet() {}"),
      SAMPLE_SYMBOLS,
      [],
    );
    const hits = store.getSymbolsInFile("src/hello.ts");
    expect(hits).toHaveLength(2);
    expect(hits.some((h) => h.name === "greet")).toBe(true);
  });

  it("upserts same file twice — replaces symbols not duplicates", () => {
    const content1 = "export function greet() {}";
    const content2 = "export function farewell() {}";
    store.upsertFile("src/hello.ts", "typescript", content1, hashContent(content1), SAMPLE_SYMBOLS, []);

    const newSymbols: Symbol[] = [
      {
        name: "farewell",
        kind: "function",
        range: { start: 0, end: 40 },
        signature: "export function farewell(): void",
        isExported: true,
      },
    ];
    store.upsertFile("src/hello.ts", "typescript", content2, hashContent(content2), newSymbols, []);

    const hits = store.getSymbolsInFile("src/hello.ts");
    expect(hits).toHaveLength(1);
    expect(hits[0]?.name).toBe("farewell");
  });

  it("removeFile clears symbols and imports", () => {
    store.upsertFile(
      "src/hello.ts",
      "typescript",
      "content",
      hashContent("content"),
      SAMPLE_SYMBOLS,
      SAMPLE_IMPORTS,
    );
    store.removeFile("src/hello.ts");
    expect(store.getSymbolsInFile("src/hello.ts")).toHaveLength(0);
    expect(store.getImportsForFile("src/hello.ts")).toHaveLength(0);
  });

  it("retrieves imports for a file", () => {
    store.upsertFile(
      "src/hello.ts",
      "typescript",
      "content",
      hashContent("content"),
      [],
      SAMPLE_IMPORTS,
    );
    const imports = store.getImportsForFile("src/hello.ts");
    expect(imports.some((i) => i.fromPath === "node:path")).toBe(true);
    const pathImport = imports.filter((i) => i.fromPath === "node:path");
    expect(pathImport.some((i) => i.name === "join")).toBe(true);
  });

  it("FTS search returns ranked results", () => {
    store.upsertFile(
      "src/a.ts",
      "typescript",
      "a",
      hashContent("a"),
      [
        {
          name: "greetUser",
          kind: "function",
          range: { start: 0, end: 20 },
          signature: "function greetUser()",
          isExported: true,
        },
      ],
      [],
    );
    store.upsertFile(
      "src/b.ts",
      "typescript",
      "b",
      hashContent("b"),
      [
        {
          name: "greetAdmin",
          kind: "function",
          range: { start: 0, end: 20 },
          signature: "function greetAdmin()",
          isExported: true,
        },
      ],
      [],
    );

    const hits = store.querySymbols("greet", 10);
    expect(hits.length).toBeGreaterThanOrEqual(2);
    expect(hits.some((h) => h.name === "greetUser")).toBe(true);
    expect(hits.some((h) => h.name === "greetAdmin")).toBe(true);
  });

  it("querySymbols returns empty for no match", () => {
    const hits = store.querySymbols("nonexistentXYZABC", 10);
    expect(hits).toHaveLength(0);
  });

  it("stats returns correct counts", () => {
    store.upsertFile(
      "src/hello.ts",
      "typescript",
      "x",
      hashContent("x"),
      SAMPLE_SYMBOLS,
      [],
    );
    const { fileCount, symbolCount } = store.stats();
    expect(fileCount).toBe(1);
    expect(symbolCount).toBe(2);
  });

  it("resolveImportTarget resolves relative imports", () => {
    store.upsertFile(
      "src/utils/helper.ts",
      "typescript",
      "x",
      hashContent("x"),
      [],
      [],
    );
    const resolved = store.resolveImportTarget("src/index.ts", "./utils/helper");
    expect(resolved).toBe("src/utils/helper.ts");
  });

  it("resolveImportTarget returns null for non-relative imports", () => {
    const resolved = store.resolveImportTarget("src/index.ts", "node:path");
    expect(resolved).toBeNull();
  });
});
