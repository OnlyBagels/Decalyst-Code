import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { describe, it, expect, afterEach } from "vitest";
import { VendorAdapterAggregator } from "../../../src/services/vendor-adapters/aggregator.js";
import { createDefaultAggregator } from "../../../src/services/vendor-adapters/index.js";
import type { AdapterContent } from "../../../src/services/vendor-adapters/types.js";

const tmpDirs: string[] = [];

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

async function makeTmp(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aggregator-"));
  tmpDirs.push(dir);
  return dir;
}

describe("VendorAdapterAggregator", () => {
  it("discoverAll returns array of AdapterContent", async () => {
    const tmp = await makeTmp();
    const aggregator = createDefaultAggregator();

    const claudeDir = path.join(tmp, ".claude", "skill1");
    await fs.mkdir(claudeDir, { recursive: true });
    await fs.writeFile(
      path.join(claudeDir, "SKILL.md"),
      "---\nname: TestSkill\n---\nBody",
    );
    await fs.writeFile(path.join(tmp, "CLAUDE.md"), "## Rules\nBe cool");

    const results = await aggregator.discoverAll(tmp);

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].vendor).toBe("claude");
  });

  it("toPromptSection returns null when nothing discovered", async () => {
    const tmp = await makeTmp();
    const aggregator = createDefaultAggregator();
    const section = await aggregator.toPromptSection(tmp);
    expect(section).toBeNull();
  });

  it("toPromptSection returns coherent text block with discovered content", async () => {
    const tmp = await makeTmp();
    const claudeDir = path.join(tmp, ".claude", "refactor");
    await fs.mkdir(claudeDir, { recursive: true });
    await fs.writeFile(
      path.join(claudeDir, "SKILL.md"),
      "---\nname: Refactor\ndescription: Code refactoring\n---\nRefactor body",
    );
    await fs.writeFile(
      path.join(tmp, "CLAUDE.md"),
      "## Conventions\nUse TypeScript",
    );

    const aggregator = createDefaultAggregator();
    const section = await aggregator.toPromptSection(tmp);

    expect(section).not.toBeNull();
    expect(section).toContain("External agent config");
    expect(section).toContain("Conventions");
    expect(section).toContain("Skills");
    expect(section).toContain("Refactor");
  });

  it("handles multiple adapters discovering content", async () => {
    const tmp = await makeTmp();

    const claudeDir = path.join(tmp, ".claude", "skill");
    await fs.mkdir(claudeDir, { recursive: true });
    await fs.writeFile(
      path.join(claudeDir, "SKILL.md"),
      "---\nname: Skill\n---\nBody",
    );
    await fs.writeFile(path.join(tmp, "CLAUDE.md"), "## Claude Rules\nRule1");

    const cursorDir = path.join(tmp, ".cursor");
    await fs.mkdir(cursorDir);
    await fs.writeFile(path.join(cursorDir, "rules.md"), "Cursor rules");

    const aggregator = createDefaultAggregator();
    const results = await aggregator.discoverAll(tmp);

    const vendors = results.map((r) => r.vendor);
    expect(vendors).toContain("claude");
    expect(vendors).toContain("cursor");
  });

  it("includes skill descriptions in prompt section", async () => {
    const tmp = await makeTmp();
    const claudeDir = path.join(tmp, ".claude", "myskill");
    await fs.mkdir(claudeDir, { recursive: true });
    await fs.writeFile(
      path.join(claudeDir, "SKILL.md"),
      "---\nname: MySkill\ndescription: Very useful\n---\nBody",
    );

    const aggregator = createDefaultAggregator();
    const section = await aggregator.toPromptSection(tmp);

    expect(section).toContain("MySkill");
    expect(section).toContain("Very useful");
  });

  it("createDefaultAggregator returns aggregator with all adapters", async () => {
    const aggregator = createDefaultAggregator();
    expect(aggregator).toBeInstanceOf(VendorAdapterAggregator);
  });

  it("handles adapter discovery failures gracefully", async () => {
    const tmp = await makeTmp();

    const failingAdapter = {
      discover: async () => {
        throw new Error("Discovery failed");
      },
    };

    const aggregator = new VendorAdapterAggregator({
      adapters: [failingAdapter],
    });

    const results = await aggregator.discoverAll(tmp);
    expect(results).toEqual([]);
  });

  it("truncates long convention previews in prompt section", async () => {
    const tmp = await makeTmp();
    const longConvention =
      "This is a very long convention text that should be truncated because it exceeds the maximum preview length for display in the prompt section. It goes on and on and on.";

    await fs.writeFile(path.join(tmp, "CLAUDE.md"), `## Section\n${longConvention}`);

    const aggregator = createDefaultAggregator();
    const section = await aggregator.toPromptSection(tmp);

    expect(section).toBeDefined();
    expect(section!.split("\n").some((line) => line.includes("..."))).toBe(
      true,
    );
  });

  it("includes sourcePaths in discovered content", async () => {
    const tmp = await makeTmp();
    const claudeDir = path.join(tmp, ".claude", "skill");
    await fs.mkdir(claudeDir, { recursive: true });
    await fs.writeFile(
      path.join(claudeDir, "SKILL.md"),
      "---\nname: Test\n---\nBody",
    );
    await fs.writeFile(path.join(tmp, "CLAUDE.md"), "## Rules\nRule");

    const aggregator = createDefaultAggregator();
    const results = await aggregator.discoverAll(tmp);

    const claudeContent = results.find((r) => r.vendor === "claude");
    expect(claudeContent!.sourcePaths.length).toBeGreaterThan(0);
  });
});
