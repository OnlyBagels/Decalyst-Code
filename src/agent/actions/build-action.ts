import { RunSession } from "../../core/run-session.js";
import type { Message, SessionState } from "../session-state.js";

export async function runBuild(args: {
  state: SessionState;
  goal: string;
  runSession: RunSession;
  onMessage: (m: Message) => void;
}): Promise<{ passed: boolean; report: string; durationMs: number }> {
  const startedAt = Date.now();

  const now = () => new Date().toISOString();

  args.onMessage({ kind: "build", line: `Starting build: ${args.goal}`, ts: now() });

  try {
    const summary = await args.runSession.run();
    const durationMs = Date.now() - startedAt;

    const report = summary.finalReport;
    const status = summary.passed ? "passed" : "incomplete";

    args.onMessage({
      kind: "system",
      text: `Build ${status} in ${(durationMs / 1000).toFixed(1)}s. Run id: ${summary.runId}. Files: ${summary.filesCreated.length}.`,
      ts: now(),
    });

    return { passed: summary.passed, report, durationMs };
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    const msg = err instanceof Error ? err.message : String(err);
    args.onMessage({ kind: "system", text: `Build failed: ${msg}`, ts: now() });
    return { passed: false, report: msg, durationMs };
  }
}
