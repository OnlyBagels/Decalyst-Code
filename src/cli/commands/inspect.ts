import * as fs from "node:fs/promises";
import * as path from "node:path";

export async function inspectCommand(
  runId: string,
  tracesRoot: string,
): Promise<number> {
  const dir = path.resolve(tracesRoot, runId);
  try {
    const stat = await fs.stat(dir);
    if (!stat.isDirectory()) {
      console.error(`Not a directory: ${dir}`);
      return 1;
    }
  } catch {
    console.error(`Run not found: ${dir}`);
    return 1;
  }

  const reportPath = path.join(dir, "final-report.md");
  try {
    const report = await fs.readFile(reportPath, "utf8");
    console.log(report);
    return 0;
  } catch {
    console.error(`No final-report.md found in ${dir}`);
    return 1;
  }
}
