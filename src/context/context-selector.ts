import { FileManager } from "../files/file-manager.js";
import { sha256 } from "../files/hashing.js";
import { findDirectImports } from "./import-graph.js";
import { truncateToChars, defaultBudget } from "./token-budget.js";
import type { AgentTask, FileContext } from "../types/agent.js";

function detectLanguage(filePath: string): FileContext["language"] {
  if (filePath.endsWith(".ts") || filePath.endsWith(".tsx"))
    return "typescript";
  if (filePath.endsWith(".js") || filePath.endsWith(".jsx"))
    return "javascript";
  if (filePath.endsWith(".json")) return "json";
  if (filePath.endsWith(".md")) return "markdown";
  return "text";
}

export class ContextSelector {
  private readonly budget = defaultBudget();

  constructor(
    private readonly fm: FileManager,
    private readonly workspaceRoot: string,
  ) {}

  async select(task: AgentTask): Promise<FileContext[]> {
    const contexts: FileContext[] = [];
    let remainingChars = this.budget.maxInputChars;

    // Priority 1: always include package.json if present
    const pkgCtx = await this.loadFile(
      "package.json",
      "project config",
      remainingChars,
    );
    if (pkgCtx) {
      contexts.push(pkgCtx);
      remainingChars -= pkgCtx.content.length;
    }

    // Priority 2: target files (full content)
    for (const targetPath of task.targetFiles) {
      if (contexts.length >= this.budget.maxContextFiles) break;
      const ctx = await this.loadFile(
        targetPath,
        "target file",
        remainingChars,
      );
      if (ctx) {
        contexts.push(ctx);
        remainingChars -= ctx.content.length;
      }
    }

    // Priority 2.5: explicit dependency files — the real interfaces this task
    // imports. They exist on disk (deps run first), so the worker reads the
    // actual signatures instead of guessing.
    for (const depPath of task.dependencyFiles ?? []) {
      if (contexts.length >= this.budget.maxContextFiles) break;
      if (contexts.some((c) => c.path === depPath)) continue;
      const ctx = await this.loadFile(depPath, "dependency (imported)", remainingChars);
      if (ctx && ctx.exists) {
        contexts.push(ctx);
        remainingChars -= ctx.content.length;
      }
    }

    // Priority 3: files imported by target files
    for (const targetPath of task.targetFiles) {
      if (!targetPath.endsWith(".ts")) continue;
      const imports = await findDirectImports(this.workspaceRoot, targetPath);
      for (const imp of imports) {
        if (contexts.length >= this.budget.maxContextFiles) break;
        if (contexts.some((c) => c.path === imp)) continue;
        const ctx = await this.loadFile(
          imp,
          `imported by ${targetPath}`,
          remainingChars * 0.5,
        );
        if (ctx) {
          contexts.push(ctx);
          remainingChars -= ctx.content.length;
        }
      }
    }

    // Priority 4: compiler errors reference files
    if (task.compilerErrors) {
      for (const err of task.compilerErrors) {
        if (!err.filePath) continue;
        if (contexts.length >= this.budget.maxContextFiles) break;
        if (contexts.some((c) => c.path === err.filePath)) continue;
        const ctx = await this.loadFile(
          err.filePath,
          "referenced in compiler error",
          remainingChars * 0.5,
        );
        if (ctx) {
          contexts.push(ctx);
          remainingChars -= ctx.content.length;
        }
      }
    }

    return contexts;
  }

  private async loadFile(
    relativePath: string,
    reason: string,
    maxChars: number,
  ): Promise<FileContext | null> {
    const content = await this.fm.read(relativePath);
    const exists = content !== null;
    const rawContent = content ?? "";
    const truncated = truncateToChars(rawContent, Math.max(0, maxChars));

    return {
      path: relativePath,
      content: truncated,
      sha256: sha256(rawContent),
      exists,
      language: detectLanguage(relativePath),
      reason,
    };
  }
}
