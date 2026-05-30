import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Message } from "./session-state.js";

export class Conversation {
  private readonly messages: Message[] = [];
  private readonly sessionFile: string;

  constructor(opts: { sessionId: string; runsRoot: string }) {
    const sessionsDir = path.join(opts.runsRoot, "sessions");
    this.sessionFile = path.join(sessionsDir, `${opts.sessionId.replace(/[:/]/g, "-")}.jsonl`);
  }

  async append(msg: Message): Promise<void> {
    this.messages.push(msg);
    await fs.mkdir(path.dirname(this.sessionFile), { recursive: true });
    await fs.appendFile(this.sessionFile, JSON.stringify(msg) + "\n", "utf8");
  }

  history(limit?: number): Message[] {
    if (limit === undefined) return [...this.messages];
    return this.messages.slice(-limit);
  }

  all(): Message[] {
    return [...this.messages];
  }
}
