import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { AdapterContent, SkillDef } from "./types.js";

export class CursorAdapter {
  async discover(workspaceRoot: string): Promise<AdapterContent | null> {
    const cursorRulesPath = path.join(workspaceRoot, ".cursorrules");
    const cursorDirPath = path.join(workspaceRoot, ".cursor");
    const cursorRulesMdPath = path.join(cursorDirPath, "rules.md");

    const hasCursorRules = await this.pathExists(cursorRulesPath);
    const hasCursorDir = await this.pathExists(cursorDirPath);

    if (!hasCursorRules && !hasCursorDir) {
      return null;
    }

    const sourcePaths: string[] = [];
    const conventions: string[] = [];
    const skills: SkillDef[] = [];

    if (hasCursorRules) {
      try {
        const content = await fs.readFile(cursorRulesPath, "utf8");
        conventions.push(content.trim());
        sourcePaths.push(".cursorrules");
      } catch (err) {
        console.warn(`Failed to read .cursorrules: ${err}`);
      }
    }

    if (hasCursorDir) {
      const rulesContent = await this.readFile(cursorRulesMdPath);
      if (rulesContent) {
        conventions.push(rulesContent.trim());
        sourcePaths.push(".cursor/rules.md");
      }

      try {
        const skillDefs = await this.readSkillsFromDir(cursorDirPath);
        skills.push(...skillDefs);
        if (skillDefs.length > 0) {
          sourcePaths.push(".cursor/");
        }
      } catch (err) {
        console.warn(`Failed to read .cursor/ skills: ${err}`);
      }
    }

    if (conventions.length === 0 && skills.length === 0) {
      return null;
    }

    return {
      vendor: "cursor",
      skills,
      memory: [],
      conventions,
      sourcePaths,
    };
  }

  private async pathExists(p: string): Promise<boolean> {
    try {
      await fs.access(p);
      return true;
    } catch {
      return false;
    }
  }

  private async readFile(p: string): Promise<string | null> {
    try {
      return await fs.readFile(p, "utf8");
    } catch {
      return null;
    }
  }

  private async readSkillsFromDir(cursorDirPath: string): Promise<SkillDef[]> {
    const skills: SkillDef[] = [];

    try {
      const entries = await fs.readdir(cursorDirPath, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
        if (entry.name === "rules.md") continue;

        try {
          const content = await fs.readFile(
            path.join(cursorDirPath, entry.name),
            "utf8",
          );

          const skillName = entry.name.slice(0, -3);
          skills.push({
            name: skillName,
            description: "",
            body: content.trim(),
          });
        } catch {
          continue;
        }
      }
    } catch {
      return [];
    }

    return skills;
  }
}
