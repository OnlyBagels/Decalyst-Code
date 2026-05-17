import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { describe, it, expect, afterEach } from "vitest";
import { ClaudeAdapter } from "../../../src/services/vendor-adapters/claude-adapter.js";

const tmpDirs: string[] = [];

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

async function makeTmp(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "claude-adapter-"));
  tmpDirs.push(dir);
  return dir;
}

describe("ClaudeAdapter", () => {
  it("returns null when no .claude/ or CLAUDE.md present", async () => {
    const tmp = await makeTmp();
    const adapter = new ClaudeAdapter();
    const result = await adapter.discover(tmp);
    expect(result).toBeNull();
  });

  it("reads CLAUDE.md into conventions", async () => {
    const tmp = await makeTmp();
    const content = `# Header

## Section 1
This is section 1 content.

## Section 2
This is section 2 content.`;

    await fs.writeFile(path.join(tmp, "CLAUDE.md"), content);
    const adapter = new ClaudeAdapter();
    const result = await adapter.discover(tmp);

    expect(result).not.toBeNull();
    expect(result!.vendor).toBe("claude");
    expect(result!.conventions.length).toBe(2);
    expect(result!.conventions[0]).toContain("Section 1");
    expect(result!.conventions[1]).toContain("Section 2");
    expect(result!.sourcePaths).toContain("CLAUDE.md");
  });

  it("reads .claude/<skill>/SKILL.md with frontmatter into skills", async () => {
    const tmp = await makeTmp();
    const claudeDir = path.join(tmp, ".claude");
    const skillDir = path.join(claudeDir, "my-skill");

    await fs.mkdir(skillDir, { recursive: true });

    const skillContent = `---
name: MySkill
description: Does something useful
---
This is the skill body.
It can span multiple lines.`;

    await fs.writeFile(path.join(skillDir, "SKILL.md"), skillContent);

    const adapter = new ClaudeAdapter();
    const result = await adapter.discover(tmp);

    expect(result).not.toBeNull();
    expect(result!.vendor).toBe("claude");
    expect(result!.skills.length).toBe(1);
    expect(result!.skills[0].name).toBe("MySkill");
    expect(result!.skills[0].description).toBe("Does something useful");
    expect(result!.skills[0].body).toContain("This is the skill body");
  });

  it("handles malformed frontmatter gracefully", async () => {
    const tmp = await makeTmp();
    const claudeDir = path.join(tmp, ".claude");
    const skillDir = path.join(claudeDir, "broken-skill");

    await fs.mkdir(skillDir, { recursive: true });

    const skillContent = `No frontmatter here.
Just plain text.`;

    await fs.writeFile(path.join(skillDir, "SKILL.md"), skillContent);

    const adapter = new ClaudeAdapter();
    const result = await adapter.discover(tmp);

    expect(result).not.toBeNull();
    expect(result!.skills.length).toBe(1);
    expect(result!.skills[0].name).toBe("broken-skill");
    expect(result!.skills[0].body).toContain("No frontmatter here");
  });

  it("skips SKILL.md files in subdirectories that don't exist", async () => {
    const tmp = await makeTmp();
    const claudeDir = path.join(tmp, ".claude");

    await fs.mkdir(claudeDir, { recursive: true });
    await fs.writeFile(
      path.join(claudeDir, "stray-file.md"),
      "This is not in a subdir",
    );

    const adapter = new ClaudeAdapter();
    const result = await adapter.discover(tmp);

    expect(result).not.toBeNull();
    expect(result!.skills.length).toBe(0);
  });

  it("collects sourcePaths for all discovered content", async () => {
    const tmp = await makeTmp();
    const claudeDir = path.join(tmp, ".claude");
    const skillDir = path.join(claudeDir, "skill1");

    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(path.join(tmp, "CLAUDE.md"), "## Rules\nBe cool.");
    await fs.writeFile(path.join(skillDir, "SKILL.md"), "---\nname: S1\n---\nBody");

    const adapter = new ClaudeAdapter();
    const result = await adapter.discover(tmp);

    expect(result!.sourcePaths).toContain("CLAUDE.md");
    expect(result!.sourcePaths).toContain(".claude/");
  });

  it("handles multiple skills in .claude/", async () => {
    const tmp = await makeTmp();
    const claudeDir = path.join(tmp, ".claude");

    for (const skillName of ["skill1", "skill2", "skill3"]) {
      const skillDir = path.join(claudeDir, skillName);
      await fs.mkdir(skillDir, { recursive: true });
      await fs.writeFile(
        path.join(skillDir, "SKILL.md"),
        `---\nname: ${skillName}\n---\nBody for ${skillName}`,
      );
    }

    const adapter = new ClaudeAdapter();
    const result = await adapter.discover(tmp);

    expect(result!.skills.length).toBe(3);
    expect(result!.skills.map((s) => s.name)).toEqual([
      "skill1",
      "skill2",
      "skill3",
    ]);
  });
});
