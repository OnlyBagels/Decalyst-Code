import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { AdapterContent, SkillDef, MemoryEntry } from "./types.js";

export class ClaudeAdapter {
  async discover(workspaceRoot: string): Promise<AdapterContent | null> {
    const claudePath = path.join(workspaceRoot, ".claude");
    const claudeMdPath = path.join(workspaceRoot, "CLAUDE.md");

    const hasClaude = await this.pathExists(claudePath);
    const hasClaudeMd = await this.pathExists(claudeMdPath);

    if (!hasClaude && !hasClaudeMd) {
      return null;
    }

    const sourcePaths: string[] = [];
    const conventions: string[] = [];
    const skills: SkillDef[] = [];
    const memory: MemoryEntry[] = [];

    if (hasClaudeMd) {
      try {
        const content = await fs.readFile(claudeMdPath, "utf8");
        const sections = this.parseH2Sections(content);
        conventions.push(...sections);
        sourcePaths.push("CLAUDE.md");
      } catch (err) {
        console.warn(`Failed to read CLAUDE.md: ${err}`);
      }
    }

    if (hasClaude) {
      try {
        const skillDefs = await this.readSkillsFromDir(claudePath);
        skills.push(...skillDefs);
        if (skillDefs.length > 0) {
          sourcePaths.push(".claude/");
        }
      } catch (err) {
        console.warn(`Failed to read .claude/ skills: ${err}`);
      }
    }

    return {
      vendor: "claude",
      skills,
      memory,
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

  private parseH2Sections(content: string): string[] {
    const sections: string[] = [];
    const lines = content.split("\n");
    let current = "";

    for (const line of lines) {
      if (line.startsWith("## ")) {
        if (current.trim()) {
          sections.push(current.trim());
        }
        current = line.slice(3).trim();
      } else if (current) {
        current += "\n" + line;
      }
    }

    if (current.trim()) {
      sections.push(current.trim());
    }

    return sections;
  }

  private async readSkillsFromDir(claudePath: string): Promise<SkillDef[]> {
    const skills: SkillDef[] = [];

    try {
      const entries = await fs.readdir(claudePath, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const skillMdPath = path.join(claudePath, entry.name, "SKILL.md");
        try {
          const content = await fs.readFile(skillMdPath, "utf8");
          const skill = this.parseSkillMd(entry.name, content);
          if (skill) {
            skills.push(skill);
          }
        } catch {
          continue;
        }
      }
    } catch {
      return [];
    }

    return skills;
  }

  private parseSkillMd(
    skillName: string,
    content: string,
  ): SkillDef | null {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

    if (!frontmatterMatch || !frontmatterMatch[1] || frontmatterMatch[2] === undefined) {
      return {
        name: skillName,
        description: "",
        body: content,
      };
    }

    const fm = this.parseFrontmatter(frontmatterMatch[1]);

    return {
      name: fm.name || skillName,
      description: fm.description || "",
      body: frontmatterMatch[2].trim(),
    };
  }

  private parseFrontmatter(
    frontmatterStr: string,
  ): Record<string, string> {
    const result: Record<string, string> = {};
    const lines = frontmatterStr.split("\n");

    for (const line of lines) {
      const match = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)$/);
      if (match && match[1] && match[2]) {
        result[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
      }
    }

    return result;
  }
}
