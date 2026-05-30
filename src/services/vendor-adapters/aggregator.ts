import type { AdapterContent } from "./types.js";

export interface Adapter {
  discover(workspaceRoot: string): Promise<AdapterContent | null>;
}

export class VendorAdapterAggregator {
  private adapters: Adapter[];

  constructor(opts: { adapters: Adapter[] }) {
    this.adapters = opts.adapters;
  }

  async discoverAll(workspaceRoot: string): Promise<AdapterContent[]> {
    const results: AdapterContent[] = [];

    for (const adapter of this.adapters) {
      try {
        const result = await adapter.discover(workspaceRoot);
        if (result !== null) {
          results.push(result);
        }
      } catch (err) {
        console.warn(`Adapter discovery failed: ${err}`);
      }
    }

    return results;
  }

  async toPromptSection(workspaceRoot: string): Promise<string | null> {
    const contents = await this.discoverAll(workspaceRoot);

    if (contents.length === 0) {
      return null;
    }

    const sections: string[] = [
      "External agent config detected in workspace.",
    ];

    for (const content of contents) {
      if (content.conventions.length > 0) {
        sections.push("");
        sections.push(`Conventions from ${content.vendor}:`);
        for (const convention of content.conventions) {
          const lines = convention.split("\n").slice(0, 3);
          const preview = lines.join(" ").slice(0, 100);
          sections.push(`- ${preview}${preview.length >= 100 ? "..." : ""}`);
        }
      }

      if (content.skills.length > 0) {
        sections.push("");
        sections.push(`Skills from ${content.vendor}:`);
        for (const skill of content.skills) {
          const bodyLines = skill.body.split("\n");
          const firstLine = bodyLines[0];
          const bodyPreview = firstLine ? firstLine.slice(0, 60) : "";
          sections.push(
            `- ${skill.name}: ${skill.description || bodyPreview}`,
          );
        }
      }

      if (content.memory.length > 0) {
        sections.push("");
        sections.push(`Memory from ${content.vendor}:`);
        for (const entry of content.memory) {
          sections.push(`- ${entry.title}`);
        }
      }
    }

    return sections.join("\n");
  }
}
