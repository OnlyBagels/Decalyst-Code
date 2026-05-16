import type { CompilerError, TestResult } from "../types/agent.js";

const TSC_LINE = /^(.+?)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.+)$/;

/**
 * Parses TypeScript compiler errors from the combined stdout+stderr of `tsc`.
 * Lines look like: `src/foo.ts(12,3): error TS2304: Cannot find name 'bar'.`
 */
export function parseTscErrors(result: TestResult): CompilerError[] {
  const errors: CompilerError[] = [];
  const combined = `${result.stdout}\n${result.stderr}`;

  for (const rawLine of combined.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = TSC_LINE.exec(line);
    if (!match) continue;

    errors.push({
      source: "tsc",
      filePath: match[1],
      line: Number(match[2]),
      column: Number(match[3]),
      code: match[4],
      message: match[5] ?? "",
      raw: line,
    });
  }

  return errors;
}
