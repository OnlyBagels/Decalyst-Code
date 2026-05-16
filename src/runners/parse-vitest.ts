import type { TestFailure, TestResult } from "../types/agent.js";

/**
 * Lightweight vitest output scanner.
 * Looks for "FAIL " markers and the following test description / error block.
 */
export function parseVitestFailures(result: TestResult): TestFailure[] {
  const failures: TestFailure[] = [];
  const combined = `${result.stdout}\n${result.stderr}`;
  const lines = combined.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const failMatch = /^\s*(?:FAIL|×)\s+(.+?)\s*(?:\(\d+\s*ms\))?$/i.exec(line);
    if (!failMatch) continue;

    const header = failMatch[1] ?? "";
    const next = (lines[i + 1] ?? "").trim();
    const filePathMatch = /([^\s>]+\.(?:test|spec)\.tsx?)/i.exec(
      line + " " + next,
    );

    failures.push({
      filePath: filePathMatch?.[1],
      testName: header.replace(/.*>\s*/, "").trim(),
      message: next,
      raw: line,
    });
  }

  // Capture AssertionError blocks
  const assertionRe = /AssertionError:\s*(.+)/g;
  let m: RegExpExecArray | null;
  while ((m = assertionRe.exec(combined)) !== null) {
    failures.push({
      message: m[1] ?? "AssertionError",
      raw: m[0],
    });
  }

  return failures;
}
