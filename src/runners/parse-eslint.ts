import type { CompilerError, TestResult } from "../types/agent.js";

/**
 * Parses ESLint stylish output. Format:
 *   /abs/path/to/file.ts
 *     12:3   error  Foo bar  rule-name
 */
export function parseEslintErrors(result: TestResult): CompilerError[] {
  const errors: CompilerError[] = [];
  const combined = `${result.stdout}\n${result.stderr}`;
  const lines = combined.split(/\r?\n/);

  let currentFile: string | undefined;
  for (const rawLine of lines) {
    const fileMatch = /^([A-Za-z]:[\\/].+|\/.+|\.\/.+|\..+)\.tsx?$/.exec(
      rawLine.trim(),
    );
    if (fileMatch) {
      currentFile = fileMatch[0];
      continue;
    }

    const errMatch =
      /^\s*(\d+):(\d+)\s+(error|warning)\s+(.+?)\s+(\S+)\s*$/.exec(rawLine);
    if (errMatch && errMatch[3] === "error") {
      errors.push({
        source: "eslint",
        filePath: currentFile,
        line: Number(errMatch[1]),
        column: Number(errMatch[2]),
        code: errMatch[5],
        message: errMatch[4] ?? "",
        raw: rawLine.trim(),
      });
    }
  }

  return errors;
}
