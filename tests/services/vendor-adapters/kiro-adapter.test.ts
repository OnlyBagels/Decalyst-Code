import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { describe, it, expect, afterEach } from "vitest";
import { KiroAdapter } from "../../../src/services/vendor-adapters/kiro-adapter.js";

const tmpDirs: string[] = [];

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

async function makeTmp(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "kiro-adapter-"));
  tmpDirs.push(dir);
  return dir;
}

describe("KiroAdapter", () => {
  it("returns null when .kiro/ is missing", async () => {
    const tmp = await makeTmp();
    const adapter = new KiroAdapter();
    const result = await adapter.discover(tmp);
    expect(result).toBeNull();
  });

  it("reads all .md files from .kiro/ as conventions", async () => {
    const tmp = await makeTmp();
    const kiroDir = path.join(tmp, ".kiro");
    await fs.mkdir(kiroDir);

    await fs.writeFile(path.join(kiroDir, "rules.md"), "Kiro rule 1");
    await fs.writeFile(path.join(kiroDir, "conventions.md"), "Kiro convention");
    await fs.writeFile(path.join(kiroDir, "stray.txt"), "Not markdown");

    const adapter = new KiroAdapter();
    const result = await adapter.discover(tmp);

    expect(result).not.toBeNull();
    expect(result!.vendor).toBe("kiro");
    expect(result!.conventions.length).toBe(2);
    expect(result!.conventions).toContain("Kiro rule 1");
    expect(result!.conventions).toContain("Kiro convention");
    expect(result!.skills.length).toBe(0);
    expect(result!.memory.length).toBe(0);
  });

  it("returns null when .kiro/ is empty", async () => {
    const tmp = await makeTmp();
    const kiroDir = path.join(tmp, ".kiro");
    await fs.mkdir(kiroDir);

    const adapter = new KiroAdapter();
    const result = await adapter.discover(tmp);

    expect(result).toBeNull();
  });

  it("ignores non-.md files in .kiro/", async () => {
    const tmp = await makeTmp();
    const kiroDir = path.join(tmp, ".kiro");
    await fs.mkdir(kiroDir);

    await fs.writeFile(path.join(kiroDir, "config.json"), '{"key":"value"}');
    await fs.writeFile(path.join(kiroDir, "rules.md"), "The rule");

    const adapter = new KiroAdapter();
    const result = await adapter.discover(tmp);

    expect(result!.conventions.length).toBe(1);
    expect(result!.conventions[0]).toBe("The rule");
  });

  it("tracks sourcePaths for each .md file", async () => {
    const tmp = await makeTmp();
    const kiroDir = path.join(tmp, ".kiro");
    await fs.mkdir(kiroDir);

    await fs.writeFile(path.join(kiroDir, "a.md"), "A");
    await fs.writeFile(path.join(kiroDir, "b.md"), "B");

    const adapter = new KiroAdapter();
    const result = await adapter.discover(tmp);

    expect(result!.sourcePaths).toContain(".kiro/a.md");
    expect(result!.sourcePaths).toContain(".kiro/b.md");
  });
});
