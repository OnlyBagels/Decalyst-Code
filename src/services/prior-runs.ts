import * as fs from "node:fs/promises";
import * as path from "node:path";

export interface SearchResult {
  runId: string;
  matchedPath: string;
  snippet: string;
}

export class PriorRunsSearch {
  constructor(private readonly opts: { runsRoot: string }) {}

  async search(query: string, limit: number = 10): Promise<SearchResult[]> {
    const runsRoot = this.opts.runsRoot;

    let runDirs: string[];
    try {
      const entries = await fs.readdir(runsRoot, { withFileTypes: true });
      runDirs = entries
        .filter((e) => e.isDirectory())
        .map((e) => path.join(runsRoot, e.name));
    } catch {
      return [];
    }

    const results: SearchResult[] = [];
    const queryLower = query.toLowerCase();

    for (const runDir of runDirs) {
      if (results.length >= limit) break;

      const runId = path.basename(runDir);
      const matches = await this.searchRunDir(runDir, queryLower, runId);

      for (const match of matches) {
        if (results.length >= limit) break;
        results.push(match);
      }
    }

    return results;
  }

  private async searchRunDir(
    runDir: string,
    queryLower: string,
    runId: string,
  ): Promise<SearchResult[]> {
    const results: SearchResult[] = [];

    let files: string[];
    try {
      const entries = await fs.readdir(runDir, { withFileTypes: true });
      files = entries
        .filter((e) => e.isFile() && e.name.endsWith(".md"))
        .map((e) => path.join(runDir, e.name));
    } catch {
      return results;
    }

    for (const filePath of files) {
      let content: string;
      try {
        content = await fs.readFile(filePath, "utf8");
      } catch {
        continue;
      }

      const contentLower = content.toLowerCase();
      let idx = contentLower.indexOf(queryLower);

      while (idx !== -1 && results.length < 10) {
        const start = Math.max(0, idx - 50);
        const end = Math.min(content.length, idx + 50 + queryLower.length);
        const snippet = content.substring(start, end);

        results.push({
          runId,
          matchedPath: path.relative(path.dirname(runDir), filePath),
          snippet: snippet.replace(/\n/g, " "),
        });

        idx = contentLower.indexOf(queryLower, idx + 1);
      }
    }

    return results;
  }
}
