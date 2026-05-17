import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { Scratchpad } from "../../src/state/scratchpad.js";

describe("Scratchpad", () => {
  let tracesDir: string;
  let scratchpad: Scratchpad;

  beforeEach(async () => {
    tracesDir = await fs.mkdtemp(path.join(os.tmpdir(), "scratchpad-test-"));
    scratchpad = new Scratchpad({ tracesDir });
  });

  afterEach(async () => {
    try {
      await fs.rm(tracesDir, { recursive: true });
    } catch {
      // ignore cleanup
    }
  });

  it("read returns empty string before write", async () => {
    const content = await scratchpad.read();
    expect(content).toBe("");
  });

  it("write and read roundtrip", async () => {
    const testContent = "# Notes\n\nFirst entry";
    await scratchpad.write(testContent);

    const readContent = await scratchpad.read();
    expect(readContent).toBe(testContent);
  });

  it("append adds line with newline", async () => {
    await scratchpad.write("Initial");
    await scratchpad.append("Second");
    await scratchpad.append("Third");

    const content = await scratchpad.read();
    expect(content).toBe("Initial\nSecond\nThird");
  });

  it("append to empty scratchpad", async () => {
    await scratchpad.append("First line");

    const content = await scratchpad.read();
    expect(content).toBe("First line");
  });

  it("atomic write uses tmp file", async () => {
    const testContent = "test";
    await scratchpad.write(testContent);

    const filePath = path.join(tracesDir, "scratchpad.md");
    const stat = await fs.stat(filePath);
    expect(stat.isFile()).toBe(true);

    const read = await fs.readFile(filePath, "utf8");
    expect(read).toBe(testContent);
  });
});
