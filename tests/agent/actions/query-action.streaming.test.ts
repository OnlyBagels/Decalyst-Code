import { describe, it, expect, vi } from "vitest";
import { runQuery } from "../../../src/agent/actions/query-action.js";
import { EventBus } from "../../../src/events/bus.js";
import { createSessionState } from "../../../src/agent/session-state.js";
import { FileManager } from "../../../src/files/file-manager.js";
import type { ModelClient, ModelCallArgs } from "../../../src/models/model-client.js";
import type { Message } from "../../../src/agent/session-state.js";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs/promises";

async function makeTmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "decalyst-query-stream-"));
}

function makeStreamingClient(chunks: string[]): ModelClient {
  return {
    async completeText(args: ModelCallArgs): Promise<string> {
      let full = "";
      for (const chunk of chunks) {
        full += chunk;
        args.onDelta?.(chunk);
      }
      return full;
    },
    async completeJson(args: ModelCallArgs): Promise<string> {
      return args.messages[0]?.content ?? "";
    },
    async completeWithTools() {
      throw new Error("not used");
    },
  };
}

describe("runQuery streaming", () => {
  it("emits transcript_chunk events for each delta", async () => {
    const tmp = await makeTmpDir();
    const state = createSessionState({ workspaceRoot: tmp });
    const bus = new EventBus();
    const chunks: Array<{ messageId: string; deltaText: string }> = [];
    bus.on("transcript_chunk", (e) => chunks.push({ messageId: e.messageId, deltaText: e.deltaText }));

    const client = makeStreamingClient(["Answer", " here"]);
    const fm = new FileManager(tmp);

    await runQuery({ state, question: "what is in the workspace?", client, fileManager: fm, onMessage: () => {}, bus });

    expect(chunks).toHaveLength(2);
    expect(chunks.map((c) => c.deltaText)).toEqual(["Answer", " here"]);
  });

  it("emits transcript_finish after streaming", async () => {
    const tmp = await makeTmpDir();
    const state = createSessionState({ workspaceRoot: tmp });
    const bus = new EventBus();
    const finishIds: string[] = [];
    bus.on("transcript_finish", (e) => finishIds.push(e.messageId));

    const client = makeStreamingClient(["done"]);
    const fm = new FileManager(tmp);

    await runQuery({ state, question: "test?", client, fileManager: fm, onMessage: () => {}, bus });

    expect(finishIds).toHaveLength(1);
  });

  it("chunk and finish share the same messageId", async () => {
    const tmp = await makeTmpDir();
    const state = createSessionState({ workspaceRoot: tmp });
    const bus = new EventBus();
    const chunkIds: string[] = [];
    let finishId = "";
    bus.on("transcript_chunk", (e) => chunkIds.push(e.messageId));
    bus.on("transcript_finish", (e) => { finishId = e.messageId; });

    const client = makeStreamingClient(["x", "y"]);
    const fm = new FileManager(tmp);

    await runQuery({ state, question: "q?", client, fileManager: fm, onMessage: () => {}, bus });

    expect(chunkIds.length).toBeGreaterThan(0);
    expect(chunkIds.every((id) => id === finishId)).toBe(true);
  });

  it("calls onMessage with full answer text", async () => {
    const tmp = await makeTmpDir();
    const state = createSessionState({ workspaceRoot: tmp });
    const bus = new EventBus();
    const messages: Message[] = [];

    const client = makeStreamingClient(["Foo", " bar"]);
    const fm = new FileManager(tmp);

    await runQuery({ state, question: "q?", client, fileManager: fm, onMessage: (m) => messages.push(m), bus });

    const agent = messages.find((m) => m.kind === "agent");
    expect((agent as Extract<Message, { kind: "agent" }>).text).toBe("Foo bar");
  });
});
