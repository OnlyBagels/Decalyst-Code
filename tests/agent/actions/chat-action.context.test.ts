import { describe, it, expect } from "vitest";
import { runChat } from "../../../src/agent/actions/chat-action.js";
import { createSessionState } from "../../../src/agent/session-state.js";
import type { ModelClient, ModelCallArgs, ChatMessage } from "../../../src/models/model-client.js";
import type { Message } from "../../../src/agent/session-state.js";
import * as os from "node:os";
import * as path from "node:path";

function makeTmpDir(): string {
  return path.join(os.tmpdir(), `decalyst-chat-ctx-${Date.now()}`);
}

function makeCapturingClient(response: string): { client: ModelClient; captured: ModelCallArgs[] } {
  const captured: ModelCallArgs[] = [];
  const client: ModelClient = {
    async completeText(args: ModelCallArgs): Promise<string> {
      captured.push(args);
      return response;
    },
    async completeJson(args: ModelCallArgs): Promise<string> {
      captured.push(args);
      return response;
    },
    async completeWithTools() {
      throw new Error("not used");
    },
  };
  return { client, captured };
}

function makeUserMsg(text: string): Message {
  return { kind: "user", text, ts: new Date().toISOString() };
}

function makeAgentMsg(text: string): Message {
  return { kind: "agent", text, ts: new Date().toISOString() };
}

describe("runChat history compaction", () => {
  it("sends full history to model when transcript is small", async () => {
    const state = createSessionState({ workspaceRoot: makeTmpDir() });

    state.transcript.push(makeUserMsg("Hello"));
    state.transcript.push(makeAgentMsg("Hi there"));
    state.transcript.push(makeUserMsg("How are you?"));

    const { client, captured } = makeCapturingClient("I am fine.");

    await runChat({ state, message: "How are you?", client, onMessage: () => {} });

    expect(captured).toHaveLength(1);
    const call = captured[0]!;
    const nonSystem = call.messages.filter((m: ChatMessage) => m.role !== "system");
    // All 3 transcript messages should be present unchanged
    expect(nonSystem).toHaveLength(3);
    expect(nonSystem[0]!.content).toBe("Hello");
    expect(nonSystem[1]!.content).toBe("Hi there");
    expect(nonSystem[2]!.content).toBe("How are you?");
  });

  it("sends compacted [summary + recent] when transcript exceeds budget", async () => {
    const state = createSessionState({ workspaceRoot: makeTmpDir() });

    // Build a transcript that exceeds the 2000-token default
    for (let i = 0; i < 30; i++) {
      const longText = Array.from({ length: 40 }, (_, j) => `word${j}`).join(" ");
      state.transcript.push(makeUserMsg(`${longText} question${i}`));
      state.transcript.push(makeAgentMsg(`${longText} answer${i}`));
    }

    // The summarizer call will return a summary, then the main call returns the reply
    let callCount = 0;
    const client: ModelClient = {
      async completeText(args: ModelCallArgs): Promise<string> {
        callCount++;
        if (args.agent === "summarizer") return "Summary of prior discussion.";
        return "Final answer.";
      },
      async completeJson(): Promise<string> { return ""; },
      async completeWithTools() { throw new Error("not used"); },
    };

    await runChat({ state, message: "Final question", client, onMessage: () => {} });

    // At least 2 calls: summarizer + main chat
    expect(callCount).toBeGreaterThanOrEqual(2);
  });

  it("persists conversationSummary on state after compaction", async () => {
    const state = createSessionState({ workspaceRoot: makeTmpDir() });

    for (let i = 0; i < 30; i++) {
      const longText = Array.from({ length: 40 }, (_, j) => `word${j}`).join(" ");
      state.transcript.push(makeUserMsg(`${longText} q${i}`));
      state.transcript.push(makeAgentMsg(`${longText} a${i}`));
    }

    expect(state.conversationSummary).toBeUndefined();

    const client: ModelClient = {
      async completeText(args: ModelCallArgs): Promise<string> {
        if (args.agent === "summarizer") return "Stored summary text.";
        return "Reply.";
      },
      async completeJson(): Promise<string> { return ""; },
      async completeWithTools() { throw new Error("not used"); },
    };

    await runChat({ state, message: "New question", client, onMessage: () => {} });

    expect(state.conversationSummary).toBeDefined();
    expect(state.conversationSummary!.text).toBe("Stored summary text.");
    expect(typeof state.conversationSummary!.upToIndex).toBe("number");
  });
});
