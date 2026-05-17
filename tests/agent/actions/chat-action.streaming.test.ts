import { describe, it, expect, vi } from "vitest";
import { runChat } from "../../../src/agent/actions/chat-action.js";
import { EventBus } from "../../../src/events/bus.js";
import { createSessionState } from "../../../src/agent/session-state.js";
import type { ModelClient, ModelCallArgs } from "../../../src/models/model-client.js";
import type { Message } from "../../../src/agent/session-state.js";
import * as os from "node:os";
import * as path from "node:path";

function makeTmpDir(): string {
  return path.join(os.tmpdir(), `decalyst-chat-stream-${Date.now()}`);
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

describe("runChat streaming", () => {
  it("emits transcript_chunk events for each delta when bus is provided", async () => {
    const state = createSessionState({ workspaceRoot: makeTmpDir() });
    const bus = new EventBus();
    const chunks: Array<{ messageId: string; deltaText: string }> = [];
    bus.on("transcript_chunk", (e) => chunks.push({ messageId: e.messageId, deltaText: e.deltaText }));

    const client = makeStreamingClient(["Hello", " world", "!"]);
    const messages: Message[] = [];

    await runChat({
      state,
      message: "hi",
      client,
      onMessage: (m) => messages.push(m),
      bus,
    });

    expect(chunks).toHaveLength(3);
    expect(chunks.map((c) => c.deltaText)).toEqual(["Hello", " world", "!"]);
    const ids = new Set(chunks.map((c) => c.messageId));
    expect(ids.size).toBe(1);
  });

  it("emits transcript_finish after streaming completes", async () => {
    const state = createSessionState({ workspaceRoot: makeTmpDir() });
    const bus = new EventBus();
    const finishEvents: string[] = [];
    bus.on("transcript_finish", (e) => finishEvents.push(e.messageId));

    const client = makeStreamingClient(["done"]);
    await runChat({
      state,
      message: "hi",
      client,
      onMessage: () => {},
      bus,
    });

    expect(finishEvents).toHaveLength(1);
    expect(typeof finishEvents[0]).toBe("string");
  });

  it("transcript_chunk messageId matches transcript_finish messageId", async () => {
    const state = createSessionState({ workspaceRoot: makeTmpDir() });
    const bus = new EventBus();
    const chunkIds: string[] = [];
    let finishId = "";
    bus.on("transcript_chunk", (e) => chunkIds.push(e.messageId));
    bus.on("transcript_finish", (e) => { finishId = e.messageId; });

    const client = makeStreamingClient(["a", "b"]);
    await runChat({ state, message: "hi", client, onMessage: () => {}, bus });

    expect(chunkIds.every((id) => id === finishId)).toBe(true);
  });

  it("calls onMessage with full text after streaming", async () => {
    const state = createSessionState({ workspaceRoot: makeTmpDir() });
    const bus = new EventBus();
    const messages: Message[] = [];

    const client = makeStreamingClient(["Hello", " world"]);
    await runChat({ state, message: "hi", client, onMessage: (m) => messages.push(m), bus });

    const agent = messages.find((m) => m.kind === "agent");
    expect(agent).toBeDefined();
    expect((agent as Extract<Message, { kind: "agent" }>).text).toBe("Hello world");
  });

  it("accumulates chunks and calls onMessage with full text when no bus", async () => {
    const state = createSessionState({ workspaceRoot: makeTmpDir() });
    const messages: Message[] = [];

    const client = makeStreamingClient(["Part1", " Part2"]);
    await runChat({ state, message: "hi", client, onMessage: (m) => messages.push(m) });

    const agent = messages.find((m) => m.kind === "agent");
    expect(agent).toBeDefined();
    expect((agent as Extract<Message, { kind: "agent" }>).text).toBe("Part1 Part2");
  });

  it("does not emit bus events when no bus provided", async () => {
    const state = createSessionState({ workspaceRoot: makeTmpDir() });
    const bus = new EventBus();
    const chunks: unknown[] = [];
    bus.on("transcript_chunk", (e) => chunks.push(e));

    const client = makeStreamingClient(["hello"]);
    await runChat({ state, message: "hi", client, onMessage: () => {} });

    expect(chunks).toHaveLength(0);
  });
});
