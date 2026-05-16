import * as ts from "typescript";
import { FileManager } from "../files/file-manager.js";
import { sha256 } from "../files/hashing.js";
import { SwarmError } from "../utils/errors.js";
import type { FileEdit } from "../types/agent.js";

export interface ApplyResult {
  path: string;
  mode: "create" | "replace";
  beforeSha256?: string;
  afterSha256: string;
}

export async function applyFullFileEdit(
  edit: FileEdit,
  fm: FileManager,
): Promise<ApplyResult> {
  const beforeContent = await fm.read(edit.path);
  const beforeHash = beforeContent !== null ? sha256(beforeContent) : undefined;

  if (edit.mode === "replace" && beforeContent === null) {
    throw new SwarmError(`Cannot replace "${edit.path}": file does not exist`);
  }

  if (edit.expectedSha256 !== undefined && beforeHash !== edit.expectedSha256) {
    throw new SwarmError(
      `Hash mismatch for "${edit.path}": expected ${edit.expectedSha256}, got ${beforeHash ?? "null"}`,
    );
  }

  // TypeScript syntax check before writing
  if (edit.path.endsWith(".ts") || edit.path.endsWith(".tsx")) {
    assertTypeScriptParses(edit.path, edit.fullContent);
  }

  // JSON syntax check
  if (edit.path.endsWith(".json")) {
    assertJsonParses(edit.path, edit.fullContent);
  }

  await fm.write(edit.path, edit.fullContent);

  return {
    path: edit.path,
    mode: edit.mode,
    beforeSha256: beforeHash,
    afterSha256: sha256(edit.fullContent),
  };
}

function assertTypeScriptParses(filePath: string, content: string): void {
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.ESNext,
    true,
  );
  const errors: string[] = [];

  function collectDiagnostics(node: ts.Node): void {
    // TS parse errors are represented as nodes with "missing" tokens.
    // We rely on the compiler API's parse diagnostic for a quick check.
    ts.forEachChild(node, collectDiagnostics);
  }
  collectDiagnostics(sourceFile);

  // Use the compiler to get parse-level diagnostics
  const program = ts.createProgram({
    rootNames: [filePath],
    options: { noLib: true, allowJs: false },
    host: {
      ...ts.createCompilerHost({}),
      getSourceFile: (name) => (name === filePath ? sourceFile : undefined),
      fileExists: (name) => name === filePath,
      readFile: (name) => (name === filePath ? content : undefined),
    },
  });

  const syntacticDiags = program.getSyntacticDiagnostics(sourceFile);
  for (const d of syntacticDiags) {
    errors.push(ts.flattenDiagnosticMessageText(d.messageText, "\n"));
  }

  if (errors.length > 0) {
    throw new SwarmError(
      `TypeScript syntax error in "${filePath}":\n${errors.slice(0, 5).join("\n")}`,
    );
  }
}

function assertJsonParses(filePath: string, content: string): void {
  try {
    JSON.parse(content);
  } catch (err) {
    throw new SwarmError(`JSON parse error in "${filePath}": ${String(err)}`);
  }
}
