export interface SkillDef {
  name: string;
  description: string;
  body: string;
}

export interface MemoryEntry {
  title: string;
  body: string;
  source: string;
}

export interface AdapterContent {
  vendor: "claude" | "cursor" | "kiro" | "copilot" | "windsurf" | "continue";
  skills: SkillDef[];
  memory: MemoryEntry[];
  conventions: string[];
  sourcePaths: string[];
}

export type AdapterDiscoverResult = AdapterContent | null;
