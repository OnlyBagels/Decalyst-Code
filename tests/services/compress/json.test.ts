import { describe, expect, it } from "vitest";
import { JsonCompressor } from "../../../src/services/compress/json.js";

const compressor = new JsonCompressor();

describe("JsonCompressor", () => {
  it("compresses large arrays: keeps first 3 + last 2", () => {
    const data = Array.from({ length: 20 }, (_, i) => i);
    const result = compressor.compress(JSON.stringify(data));
    const parsed = JSON.parse(result.content) as unknown[];
    expect(parsed[0]).toBe(0);
    expect(parsed[1]).toBe(1);
    expect(parsed[2]).toBe(2);
    const last = parsed[parsed.length - 1];
    expect(last).toBe(19);
    const sentinel = parsed.find((v) => typeof v === "string" && (v as string).includes("more items"));
    expect(sentinel).toBeDefined();
  });

  it("marks similar-shaped objects with similar-items sentinel", () => {
    const data = Array.from({ length: 10 }, (_, i) => ({ id: i, name: `item-${i}` }));
    const result = compressor.compress(JSON.stringify(data));
    expect(result.content).toContain("similar items");
  });

  it("truncates long string fields", () => {
    const data = { key: "x".repeat(500) };
    const result = compressor.compress(JSON.stringify(data));
    const parsed = JSON.parse(result.content) as { key: string };
    expect(parsed.key.length).toBeLessThan(500);
    expect(parsed.key).toContain("chars elided");
  });

  it("truncates deeply nested objects", () => {
    let deep: unknown = { leaf: "value" };
    for (let i = 0; i < 10; i++) deep = { child: deep };
    const result = compressor.compress(JSON.stringify(deep));
    expect(result.content).toContain("...nested...");
  });

  it("falls back to text strategy on invalid JSON", () => {
    const result = compressor.compress("this is not { json }");
    expect(result.strategy).toBe("json-parse-failed");
    expect(result.content).toContain("this is not");
  });

  it("drops null values by default", () => {
    const data = { a: 1, b: null, c: "hello" };
    const result = compressor.compress(JSON.stringify(data));
    const parsed = JSON.parse(result.content) as Record<string, unknown>;
    expect(parsed["b"]).toBeUndefined();
    expect(parsed["a"]).toBe(1);
  });

  it("small arrays pass through unchanged", () => {
    const data = [1, 2, 3];
    const result = compressor.compress(JSON.stringify(data));
    const parsed = JSON.parse(result.content) as number[];
    expect(parsed).toEqual([1, 2, 3]);
  });
});
