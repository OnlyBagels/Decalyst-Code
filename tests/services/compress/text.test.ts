import { describe, expect, it } from "vitest";
import { TextCompressor } from "../../../src/services/compress/text.js";

const compressor = new TextCompressor();

function lines(n: number): string {
  return Array.from({ length: n }, (_, i) => `line ${i + 1}`).join("\n");
}

describe("TextCompressor", () => {
  it("returns short text unchanged", () => {
    const content = lines(10);
    const result = compressor.compress(content);
    expect(result.content).toBe(content);
    expect(result.ratio).toBe(1.0);
    expect(result.strategy).toBe("text-passthrough");
  });

  it("returns text at exactly the threshold unchanged", () => {
    const content = lines(45); // 30 + 15
    const result = compressor.compress(content);
    expect(result.strategy).toBe("text-passthrough");
  });

  it("elides the middle for long text", () => {
    const content = lines(100);
    const result = compressor.compress(content);
    expect(result.strategy).toBe("text-head-tail");
    expect(result.content).toContain("line 1");
    expect(result.content).toContain("line 30");
    expect(result.content).toContain("lines elided");
    expect(result.content).toContain("line 100");
    expect(result.ratio).toBeLessThan(1.0);
  });

  it("preserves first and last lines", () => {
    const content = lines(200);
    const result = compressor.compress(content);
    const parts = result.content.split("\n");
    expect(parts[0]).toBe("line 1");
    expect(parts[parts.length - 1]).toBe("line 200");
  });

  it("uses custom headLines and tailLines", () => {
    const content = lines(100);
    const result = compressor.compress(content, { headLines: 5, tailLines: 5 });
    expect(result.content).toContain("line 5");
    expect(result.content).toContain("line 96");
    expect(result.content).not.toContain("line 6\n");
  });

  it("enforces maxTokens hard cap", () => {
    const content = lines(500);
    const result = compressor.compress(content, { maxTokens: 50 });
    expect(result.compressedTokens).toBeLessThanOrEqual(60); // allow small tokenizer variance
  });
});
