import { describe, expect, it } from "vitest";
import { CodeCompressor } from "../../../src/services/compress/code.js";

const compressor = new CodeCompressor();

describe("CodeCompressor", () => {
  it("replaces TS function body with placeholder", () => {
    const content = `function add(a: number, b: number): number {
  return a + b;
}`;
    const result = compressor.compress(content, { language: "ts" });
    expect(result.content).toContain("function add");
    expect(result.content).toContain("/* ... */");
    expect(result.content).not.toContain("return a + b");
    expect(result.strategy).toBe("code-signatures");
  });

  it("preserves import statements", () => {
    const content = `import { foo } from './foo.js';
function bar(): void {
  foo();
}`;
    const result = compressor.compress(content, { language: "ts" });
    expect(result.content).toContain("import { foo }");
    expect(result.content).not.toContain("foo();");
  });

  it("preserves export type declarations", () => {
    const content = `export type MyType = { a: string; b: number };
function helper(): void {
  console.log("hello");
}`;
    const result = compressor.compress(content, { language: "ts" });
    expect(result.content).toContain("export type MyType");
    expect(result.content).not.toContain("console.log");
  });

  it("collapses class bodies", () => {
    const content = `class Greeter {
  private name: string;
  constructor(name: string) {
    this.name = name;
  }
  greet(): string {
    return \`Hello \${this.name}\`;
  }
}`;
    const result = compressor.compress(content, { language: "ts" });
    expect(result.content).toContain("class Greeter");
    expect(result.content).toContain("/* ... */");
    expect(result.content).not.toContain("this.name = name");
  });

  it("passes unsupported languages through unchanged", () => {
    const content = "SELECT * FROM users WHERE id = 1;";
    const result = compressor.compress(content, { language: "sql" });
    expect(result.content).toBe(content);
    expect(result.ratio).toBe(1.0);
    expect(result.strategy).toBe("code-passthrough");
  });

  it("handles arrow function expressions", () => {
    const content = `const multiply = (a: number, b: number): number => {
  return a * b;
};`;
    const result = compressor.compress(content, { language: "ts" });
    expect(result.content).toContain("const multiply");
    expect(result.content).toContain("/* ... */");
    expect(result.content).not.toContain("return a * b");
  });
});
