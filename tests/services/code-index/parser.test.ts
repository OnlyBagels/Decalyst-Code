import { describe, it, expect } from "vitest";
import { Parser, LanguageDetector } from "../../../src/services/code-index/parser.js";

describe("LanguageDetector", () => {
  const detector = new LanguageDetector();

  it("maps TS extensions correctly", () => {
    expect(detector.detect("src/foo.ts")).toBe("typescript");
    expect(detector.detect("src/bar.tsx")).toBe("typescript");
    expect(detector.detect("src/baz.mts")).toBe("typescript");
    expect(detector.detect("src/qux.cts")).toBe("typescript");
  });

  it("maps JS extensions correctly", () => {
    expect(detector.detect("src/foo.js")).toBe("javascript");
    expect(detector.detect("src/bar.jsx")).toBe("javascript");
    expect(detector.detect("src/baz.mjs")).toBe("javascript");
    expect(detector.detect("src/qux.cjs")).toBe("javascript");
  });

  it("maps other languages", () => {
    expect(detector.detect("main.py")).toBe("python");
    expect(detector.detect("main.rs")).toBe("rust");
    expect(detector.detect("main.go")).toBe("go");
    expect(detector.detect("app.rb")).toBe("ruby");
    expect(detector.detect("App.java")).toBe("java");
    expect(detector.detect("index.html")).toBe("html");
    expect(detector.detect("config.json")).toBe("json");
    expect(detector.detect("config.yaml")).toBe("yaml");
    expect(detector.detect("config.yml")).toBe("yaml");
  });

  it("returns null for unknown extensions", () => {
    expect(detector.detect("file.xyz")).toBeNull();
    expect(detector.detect("Makefile")).toBeNull();
    expect(detector.detect("binary.wasm")).toBeNull();
  });

  it("isAstSupported returns true only for TS and JS", () => {
    expect(detector.isAstSupported("typescript")).toBe(true);
    expect(detector.isAstSupported("javascript")).toBe(true);
    expect(detector.isAstSupported("python")).toBe(false);
    expect(detector.isAstSupported("rust")).toBe(false);
  });
});

describe("Parser", () => {
  const parser = new Parser();

  it("parses a TS file and returns language + content", () => {
    const content = "export const x = 1;";
    const result = parser.parse("src/foo.ts", content);
    expect(result).not.toBeNull();
    expect(result?.language).toBe("typescript");
    expect(result?.content).toBe(content);
  });

  it("parses a Python file", () => {
    const result = parser.parse("app/main.py", "def foo(): pass");
    expect(result?.language).toBe("python");
  });

  it("returns null for unknown extension without throwing", () => {
    expect(() => parser.parse("binary.wasm", "\x00\x01\x02")).not.toThrow();
    expect(parser.parse("binary.wasm", "\x00\x01\x02")).toBeNull();
  });
});
