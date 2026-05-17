import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { describe, it, expect, afterEach } from "vitest";
import { CursorAdapter } from "../../../src/services/vendor-adapters/cursor-adapter.js";

const tmpDirs: string[] = [];

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

async function makeTmp(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cursor-adapter-"));
  tmpDirs.push(dir);
  return dir;
}

describe("CursorAdapter", () => {
  it("returns null when no cursor config present", async () => {
    const tmp = await makeTmp();
    const adapter = new CursorAdapter();
    const result = await adapter.discover(tmp);
    expect(result).toBeNull();
  });

  it("reads .cursorrules into conventions", async () => {
    const tmp = await makeTmp();
    const content = "Always use TypeScript. Be pedantic.";

    await fs.writeFile(path.join(tmp, ".cursorrules"), content);
    const adapter = new CursorAdapter();
    const result = await adapter.discover(tmp);

    expect(result).not.toBeNull();
    expect(result!.vendor).toBe("cursor");
    expect(result!.conventions.length).toBeGreaterThan(0);
    expect(result!.conventions[0]).toBe(content);
    expect(result!.sourcePaths).toContain(".cursorrules");
  });

  it("reads .cursor/rules.md into conventions", async () => {
    const tmp = await makeTmp();
    const cursorDir = path.join(tmp, ".cursor");
    await fs.mkdir(cursorDir);

    const content = "# Cursor Rules\nBe excellent.";
    await fs.writeFile(path.join(cursorDir, "rules.md"), content);

    const adapter = new CursorAdapter();
    const result = await adapter.discover(tmp);

    expect(result).not.toBeNull();
    expect(result!.conventions).toContain(content);
    expect(result!.sourcePaths).toContain(".cursor/rules.md");
  });

  it("reads .cursor/*.md skill files (excluding rules.md)", async () => {
    const tmp = await makeTmp();
    const cursorDir = path.join(tmp, ".cursor");
    await fs.mkdir(cursorDir);

    await fs.writeFile(path.join(cursorDir, "refactor.md"), "Refactor body");
    await fs.writeFile(path.join(cursorDir, "test.md"), "Test body");
    await fs.writeFile(path.join(cursorDir, "rules.md"), "Should skip this");

    const adapter = new CursorAdapter();
    const result = await adapter.discover(tmp);

    expect(result!.skills.length).toBe(2);
    expect(result!.skills.map((s) => s.name)).toEqual(
      expect.arrayContaining(["refactor", "test"]),
    );
    expect(result!.skills.every((s) => s.body !== "Should skip this")).toBe(
      true,
    );
  });

  it("returns null when .cursor dir exists but is empty", async () => {
    const tmp = await makeTmp();
    const cursorDir = path.join(tmp, ".cursor");
    await fs.mkdir(cursorDir);

    const adapter = new CursorAdapter();
    const result = await adapter.discover(tmp);

    expect(result).toBeNull();
  });

  it("handles both .cursorrules and .cursor/ together", async () => {
    const tmp = await makeTmp();
    const cursorDir = path.join(tmp, ".cursor");
    await fs.mkdir(cursorDir);

    await fs.writeFile(path.join(tmp, ".cursorrules"), "Legacy rule");
    await fs.writeFile(path.join(cursorDir, "rules.md"), "New rule");
    await fs.writeFile(path.join(cursorDir, "lint.md"), "Linting rules");

    const adapter = new CursorAdapter();
    const result = await adapter.discover(tmp);

    expect(result!.conventions.length).toBe(2);
    expect(result!.conventions).toContain("Legacy rule");
    expect(result!.conventions).toContain("New rule");
    expect(result!.skills.length).toBe(1);
    expect(result!.skills[0].name).toBe("lint");
  });

  it("includes sourcePaths for all discovered files", async () => {
    const tmp = await makeTmp();
    const cursorDir = path.join(tmp, ".cursor");
    await fs.mkdir(cursorDir);

    await fs.writeFile(path.join(tmp, ".cursorrules"), "Rule");
    await fs.writeFile(path.join(cursorDir, "rules.md"), "More rules");
    await fs.writeFile(path.join(cursorDir, "skill.md"), "Skill");

    const adapter = new CursorAdapter();
    const result = await adapter.discover(tmp);

    expect(result!.sourcePaths).toContain(".cursorrules");
    expect(result!.sourcePaths).toContain(".cursor/rules.md");
    expect(result!.sourcePaths).toContain(".cursor/");
  });
});
