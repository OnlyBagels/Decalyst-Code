import { describe, it, expect } from "vitest";
import { extract } from "../../../src/services/code-index/extractor.js";
import type { ParseResult } from "../../../src/services/code-index/types.js";

function ts(content: string): ParseResult {
  return { language: "typescript", content };
}

function py(content: string): ParseResult {
  return { language: "python", content };
}

describe("extractor — TypeScript", () => {
  it("extracts named exported function", () => {
    const result = extract(ts("export function greet(name: string): string { return name; }"));
    expect(result.exportedSymbols).toHaveLength(1);
    expect(result.exportedSymbols[0]?.name).toBe("greet");
    expect(result.exportedSymbols[0]?.kind).toBe("function");
    expect(result.exportedSymbols[0]?.isExported).toBe(true);
  });

  it("extracts exported class", () => {
    const result = extract(ts("export class Foo { bar(): void {} }"));
    expect(result.exportedSymbols.some((s) => s.name === "Foo" && s.kind === "class")).toBe(true);
  });

  it("extracts exported const", () => {
    const result = extract(ts("export const PI = 3.14;"));
    expect(result.exportedSymbols.some((s) => s.name === "PI" && s.kind === "const")).toBe(true);
  });

  it("extracts exported type alias", () => {
    const result = extract(ts("export type UserId = string;"));
    expect(result.exportedSymbols.some((s) => s.name === "UserId" && s.kind === "type")).toBe(true);
  });

  it("extracts exported interface", () => {
    const result = extract(ts("export interface User { id: string; name: string; }"));
    expect(result.exportedSymbols.some((s) => s.name === "User" && s.kind === "interface")).toBe(true);
  });

  it("extracts named imports", () => {
    const result = extract(ts(`import { readFile, writeFile } from "node:fs/promises";`));
    expect(result.imports).toHaveLength(1);
    const imp = result.imports[0]!;
    expect(imp.from).toBe("node:fs/promises");
    expect(imp.symbols).toContain("readFile");
    expect(imp.symbols).toContain("writeFile");
  });

  it("extracts default import", () => {
    const result = extract(ts(`import path from "node:path";`));
    const imp = result.imports[0]!;
    expect(imp.from).toBe("node:path");
    expect(imp.symbols).toContain("path");
  });

  it("extracts namespace import", () => {
    const result = extract(ts(`import * as fs from "node:fs";`));
    const imp = result.imports[0]!;
    expect(imp.from).toBe("node:fs");
    expect(imp.symbols).toContain("*");
  });

  it("extracts non-exported top-level definitions", () => {
    const result = extract(ts("function internal(): void {}"));
    expect(result.definitions.some((d) => d.name === "internal")).toBe(true);
    expect(result.exportedSymbols.some((d) => d.name === "internal")).toBe(false);
  });

  it("signature does not include function body", () => {
    const result = extract(ts("export function add(a: number, b: number): number { return a + b; }"));
    const sig = result.exportedSymbols[0]?.signature ?? "";
    expect(sig).not.toContain("return a + b");
    expect(sig).toContain("add");
  });

  it("extracts multiple exports from one file", () => {
    const code = `
export function foo() {}
export class Bar {}
export const BAZ = 42;
export type ID = string;
export interface IFoo { x: number; }
    `.trim();
    const result = extract(ts(code));
    expect(result.exportedSymbols.length).toBeGreaterThanOrEqual(5);
  });

  it("handles malformed code without throwing", () => {
    expect(() => extract(ts("export function ("))).not.toThrow();
  });
});

describe("extractor — Python", () => {
  it("extracts top-level def", () => {
    const result = extract(py("def hello(name):\n    print(name)"));
    expect(result.definitions.some((d) => d.name === "hello" && d.kind === "function")).toBe(true);
  });

  it("extracts class", () => {
    const result = extract(py("class Animal:\n    pass"));
    expect(result.definitions.some((d) => d.name === "Animal" && d.kind === "class")).toBe(true);
  });

  it("treats public names as exported", () => {
    const result = extract(py("def public_fn(): pass\ndef _private(): pass"));
    expect(result.exportedSymbols.some((d) => d.name === "public_fn")).toBe(true);
    expect(result.exportedSymbols.some((d) => d.name === "_private")).toBe(false);
  });

  it("extracts imports", () => {
    const result = extract(py("from os import path\nimport sys"));
    expect(result.imports.some((i) => i.from === "os")).toBe(true);
    expect(result.imports.some((i) => i.from === "sys")).toBe(true);
  });

  it("extracts async def", () => {
    const result = extract(py("async def fetch(url):\n    pass"));
    expect(result.definitions.some((d) => d.name === "fetch" && d.kind === "function")).toBe(true);
  });
});
