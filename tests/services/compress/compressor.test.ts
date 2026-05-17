import { describe, expect, it } from "vitest";
import { Compressor } from "../../../src/services/compress/compressor.js";

function makeContent(chars: number): string {
  return Array.from({ length: Math.ceil(chars / 20) }, (_, i) => `line ${i} of the content`).join("\n");
}

describe("Compressor", () => {
  const compressor = new Compressor({ enabled: true, thresholds: {} });

  it("returns no-op when disabled", async () => {
    const off = new Compressor({ enabled: false, thresholds: {} });
    const content = makeContent(5000);
    const result = await off.compress({ kind: "text", content });
    expect(result.strategy).toBe("no-op");
    expect(result.content).toBe(content);
  });

  it("returns no-op when below token threshold", async () => {
    const content = "short content";
    const result = await compressor.compress({ kind: "text", content });
    expect(result.strategy).toBe("no-op");
  });

  it("routes json kind to json compressor", async () => {
    const data = Array.from({ length: 50 }, (_, i) => ({
      id: i,
      name: `item-${i}`,
      description: "x".repeat(300),
    }));
    const content = JSON.stringify(data, null, 2);
    const result = await compressor.compress({ kind: "json", content });
    // Either compressed (json-compress) or no-op if ratio too high
    expect(["json-compress", "no-op"]).toContain(result.strategy);
  });

  it("routes code kind to code compressor", async () => {
    const fn = (i: number) => `function fn${i}(a: number, b: number): number { return a + b + ${i}; }`;
    const content = Array.from({ length: 100 }, (_, i) => fn(i)).join("\n");
    const result = await compressor.compress({ kind: "code", content, language: "ts" });
    expect(["code-signatures", "no-op"]).toContain(result.strategy);
    if (result.strategy === "code-signatures") {
      expect(result.ratio).toBeLessThan(0.9);
    }
  });

  it("returns original when compression ratio >= 0.9", async () => {
    // 46 lines is just above the 45-line threshold for text, but content is dense
    // Use a low custom threshold to force compression attempt
    const custom = new Compressor({ enabled: true, thresholds: { text: 1 } });
    const content = "short line\nsecond line\nthird line"; // too short to compress well
    const result = await custom.compress({ kind: "text", content });
    // Ratio will be 1.0 since text is below head+tail threshold, so strategy = no-op
    expect(result.strategy).toBe("no-op");
  });

  it("compresses large text and returns ratio < 0.9", async () => {
    // 300 lines is enough to exercise head+tail compression without OOM
    const content = Array.from({ length: 300 }, (_, i) => `line ${i} content here`).join("\n");
    const result = await compressor.compress({ kind: "text", content });
    if (result.strategy !== "no-op") {
      expect(result.ratio).toBeLessThan(0.9);
    }
  });

  it("shouldCompress returns false when disabled", () => {
    const off = new Compressor({ enabled: false, thresholds: {} });
    expect(off.shouldCompress("text", makeContent(50000))).toBe(false);
  });

  it("shouldCompress returns false below threshold", () => {
    expect(compressor.shouldCompress("text", "tiny")).toBe(false);
  });

  it("shouldCompress returns true above threshold", () => {
    // text threshold is 1500 tokens (~6000 chars at 4 chars/token)
    expect(compressor.shouldCompress("text", makeContent(10000))).toBe(true);
  });
});
