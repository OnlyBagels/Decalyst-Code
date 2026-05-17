import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { describe, it, expect, afterEach } from "vitest";
import { Conversation } from "../../src/agent/conversation.js";
import type { Message } from "../../src/agent/session-state.js";

const tmpDirs: string[] = [];

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

async function makeTmp(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "decalyst-conv-"));
  tmpDirs.push(dir);
  return dir;
}

describe("Conversation", () => {
  it("append stores messages and all() returns them in order", async () => {
    const runsRoot = await makeTmp();
    const conv = new Conversation({ sessionId: "2024-01-01T00:00:00.000Z", runsRoot });

    const m1: Message = { kind: "user", text: "hello", ts: "ts1" };
    const m2: Message = { kind: "agent", text: "world", ts: "ts2" };

    await conv.append(m1);
    await conv.append(m2);

    const all = conv.all();
    expect(all).toHaveLength(2);
    expect(all[0]).toEqual(m1);
    expect(all[1]).toEqual(m2);
  });

  it("history(n) returns the last n messages", async () => {
    const runsRoot = await makeTmp();
    const conv = new Conversation({ sessionId: "2024-01-01T00:00:01.000Z", runsRoot });

    for (let i = 0; i < 5; i++) {
      await conv.append({ kind: "user", text: `msg ${i}`, ts: `ts${i}` });
    }

    const last2 = conv.history(2);
    expect(last2).toHaveLength(2);
    expect(last2[0]?.text).toBe("msg 3");
    expect(last2[1]?.text).toBe("msg 4");
  });

  it("persists messages to a jsonl file", async () => {
    const runsRoot = await makeTmp();
    const sessionId = "2024-01-01T00:00:02.000Z";
    const conv = new Conversation({ sessionId, runsRoot });

    const msg: Message = { kind: "system", text: "boot", ts: "ts0" };
    await conv.append(msg);

    const safeId = sessionId.replace(/[:/]/g, "-");
    const filePath = path.join(runsRoot, "sessions", `${safeId}.jsonl`);
    const content = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(content.trim()) as Message;
    expect(parsed).toEqual(msg);
  });
});
