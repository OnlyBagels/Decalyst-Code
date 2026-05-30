import * as path from "node:path";
import * as fs from "node:fs/promises";
import { RunSession } from "../../core/run-session.js";
import { toMessage } from "../../utils/errors.js";
import { UsageTracker } from "../../tui/usage-tracker.js";
import { TuiController, detectTuiEnabled } from "../../tui/tui-controller.js";

export interface RunCommandOptions {
  request: string;
  workspace: string;
  traces: string;
  concurrency: number;
  maxFixRounds: number;
}

export async function runCommand(opts: RunCommandOptions): Promise<number> {
  const workspaceRoot = path.resolve(opts.workspace);
  const tracesRoot = path.resolve(opts.traces);

  await fs.mkdir(workspaceRoot, { recursive: true });
  await fs.mkdir(tracesRoot, { recursive: true });

  // Header — printed once above the panel, then never redrawn.
  console.log(`User request:   ${opts.request}`);
  console.log(`Workspace:      ${workspaceRoot}`);
  console.log(`Traces:         ${tracesRoot}`);
  console.log(`Concurrency:    ${opts.concurrency}`);
  console.log(`Max fix rounds: ${opts.maxFixRounds}`);
  console.log();

  const tracker = new UsageTracker();
  const tui = new TuiController(tracker, {
    enabled: detectTuiEnabled(),
    maxLogLines: 4,
  });
  tui.start();

  const session = new RunSession({
    userRequest: opts.request,
    workspaceRoot,
    tracesRoot,
    concurrency: opts.concurrency,
    maxFixRounds: opts.maxFixRounds,
    tracker,
  });

  try {
    const summary = await session.run();
    tracker.setPhase("done");
    tui.stop();

    console.log("\n========== Run Report ==========\n");
    console.log(summary.finalReport);
    console.log("\n================================");
    console.log(summary.passed ? "Result: PASSED" : "Result: INCOMPLETE");
    console.log(`Files written: ${summary.filesCreated.length}`);
    console.log(`Run id:        ${summary.runId}`);

    const t = tracker.totals();
    console.log(
      `Tokens:        ${t.promptTokens.toLocaleString()} in / ${t.completionTokens.toLocaleString()} out`,
    );
    console.log(`Estimated cost: $${t.cost.toFixed(4)} (${t.calls} model calls)`);

    return summary.passed ? 0 : 2;
  } catch (err) {
    tui.stop();
    console.error("Run failed:", toMessage(err));
    return 1;
  }
}
