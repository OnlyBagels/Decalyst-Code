import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { describe, it, expect, vi, afterEach } from "vitest";
import { AgentRunner } from "../../src/agent/agent-runner.js";
import { createSessionState } from "../../src/agent/session-state.js";
import { Conversation } from "../../src/agent/conversation.js";
import { IntentClassifier } from "../../src/agent/intent.js";
import { FileManager } from "../../src/files/file-manager.js";
import { EventBus } from "../../src/events/bus.js";
import type { ModelClient } from "../../src/models/model-client.js";
import type { Message } from "../../src/agent/session-state.js";
import type { SessionMode } from "../../src/events/types.js";

const tmpDirs: string[] = [];

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

async function makeTmp(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "decalyst-runner-"));
  tmpDirs.push(dir);
  return dir;
}

function makeClient(textReply: string, jsonReply: string): ModelClient {
  return {
    async completeJson() { return jsonReply; },
    async completeText() { return textReply; },
    async completeWithTools() { throw new Error("not used"); },
  };
}

describe("AgentRunner", () => {
  it("handles a slash command without classifying intent", async () => {
    const tmp = await makeTmp();
    const state = createSessionState({ workspaceRoot: tmp });
    const conv = new Conversation({ sessionId: state.sessionId, runsRoot: tmp });
    const client = makeClient("irrelevant", "{}");
    const intent = new IntentClassifier(client);
    const classifySpy = vi.spyOn(intent, "classify");
    const fm = new FileManager(tmp);

    const messages: Message[] = [];
    const runner = new AgentRunner({
      state,
      conversation: conv,
      orchestratorClient: client,
      swarmClient: client,
      intent,
      fileManager: fm,
      runsRoot: tmp,
      onMessage: (m) => messages.push(m),
    });

    const result = await runner.handleInput("/help");
    expect(classifySpy).not.toHaveBeenCalled();
    expect(messages.some((m) => m.kind === "system")).toBe(true);
    expect(result.exit).toBeUndefined();
  });

  it("/exit returns exit: true", async () => {
    const tmp = await makeTmp();
    const state = createSessionState({ workspaceRoot: tmp });
    const conv = new Conversation({ sessionId: state.sessionId, runsRoot: tmp });
    const client = makeClient("", "{}");
    const intent = new IntentClassifier(client);
    const fm = new FileManager(tmp);
    const messages: Message[] = [];

    const runner = new AgentRunner({
      state,
      conversation: conv,
      orchestratorClient: client,
      swarmClient: client,
      intent,
      fileManager: fm,
      runsRoot: tmp,
      onMessage: (m) => messages.push(m),
    });

    const result = await runner.handleInput("/exit");
    expect(result.exit).toBe(true);
  });

  it("query intent calls completeText and emits an agent message", async () => {
    const tmp = await makeTmp();
    const state = createSessionState({ workspaceRoot: tmp });
    const conv = new Conversation({ sessionId: state.sessionId, runsRoot: tmp });

    const intentJson = JSON.stringify({ kind: "query", goal: "list files" });
    const queryReply = "Here are your files.";
    const client = makeClient(queryReply, intentJson);
    const intent = new IntentClassifier(client);
    const fm = new FileManager(tmp);
    const messages: Message[] = [];

    const runner = new AgentRunner({
      state,
      conversation: conv,
      orchestratorClient: client,
      swarmClient: client,
      intent,
      fileManager: fm,
      runsRoot: tmp,
      onMessage: (m) => messages.push(m),
    });

    await runner.handleInput("What files are in the workspace?");

    const agentMsgs = messages.filter((m) => m.kind === "agent");
    expect(agentMsgs.length).toBeGreaterThan(0);
    expect(agentMsgs[0]?.text).toBe(queryReply);
  });

  it("chat intent calls completeText and emits an agent message", async () => {
    const tmp = await makeTmp();
    const state = createSessionState({ workspaceRoot: tmp });
    const conv = new Conversation({ sessionId: state.sessionId, runsRoot: tmp });

    const intentJson = JSON.stringify({ kind: "chat", goal: "greeting" });
    const chatReply = "Hello! How can I help?";
    const client = makeClient(chatReply, intentJson);
    const intent = new IntentClassifier(client);
    const fm = new FileManager(tmp);
    const messages: Message[] = [];

    const runner = new AgentRunner({
      state,
      conversation: conv,
      orchestratorClient: client,
      swarmClient: client,
      intent,
      fileManager: fm,
      runsRoot: tmp,
      onMessage: (m) => messages.push(m),
    });

    await runner.handleInput("Hello!");

    const agentMsgs = messages.filter((m) => m.kind === "agent");
    expect(agentMsgs.length).toBeGreaterThan(0);
    expect(agentMsgs[0]?.text).toBe(chatReply);
  });

  it("emits mode_change('plan') at start and mode_change('idle') at end for chat intent", async () => {
    const tmp = await makeTmp();
    const state = createSessionState({ workspaceRoot: tmp });
    const conv = new Conversation({ sessionId: state.sessionId, runsRoot: tmp });

    const intentJson = JSON.stringify({ kind: "chat", goal: "greeting" });
    const chatReply = "Hey there!";
    const client = makeClient(chatReply, intentJson);
    const intent = new IntentClassifier(client);
    const fm = new FileManager(tmp);
    const bus = new EventBus();
    const modes: SessionMode[] = [];
    bus.on("mode_change", (e) => modes.push(e.mode));

    const runner = new AgentRunner({
      state,
      conversation: conv,
      orchestratorClient: client,
      swarmClient: client,
      intent,
      fileManager: fm,
      runsRoot: tmp,
      onMessage: () => {},
      bus,
    });

    await runner.handleInput("Hey!");

    expect(modes[0]).toBe("plan");
    expect(modes[modes.length - 1]).toBe("idle");
  });

  it("emits mode_change('plan') at start and mode_change('idle') at end for query intent", async () => {
    const tmp = await makeTmp();
    const state = createSessionState({ workspaceRoot: tmp });
    const conv = new Conversation({ sessionId: state.sessionId, runsRoot: tmp });

    const intentJson = JSON.stringify({ kind: "query", goal: "list files" });
    const queryReply = "Here are files.";
    const client = makeClient(queryReply, intentJson);
    const intent = new IntentClassifier(client);
    const fm = new FileManager(tmp);
    const bus = new EventBus();
    const modes: SessionMode[] = [];
    bus.on("mode_change", (e) => modes.push(e.mode));

    const runner = new AgentRunner({
      state,
      conversation: conv,
      orchestratorClient: client,
      swarmClient: client,
      intent,
      fileManager: fm,
      runsRoot: tmp,
      onMessage: () => {},
      bus,
    });

    await runner.handleInput("What files exist?");

    expect(modes[0]).toBe("plan");
    expect(modes[modes.length - 1]).toBe("idle");
  });

  it("works without a bus (bus is optional)", async () => {
    const tmp = await makeTmp();
    const state = createSessionState({ workspaceRoot: tmp });
    const conv = new Conversation({ sessionId: state.sessionId, runsRoot: tmp });

    const intentJson = JSON.stringify({ kind: "chat", goal: "greeting" });
    const chatReply = "No bus, no problem.";
    const client = makeClient(chatReply, intentJson);
    const intent = new IntentClassifier(client);
    const fm = new FileManager(tmp);
    const messages: Message[] = [];

    const runner = new AgentRunner({
      state,
      conversation: conv,
      orchestratorClient: client,
      swarmClient: client,
      intent,
      fileManager: fm,
      runsRoot: tmp,
      onMessage: (m) => messages.push(m),
    });

    await expect(runner.handleInput("Hey!")).resolves.not.toThrow();
    expect(messages.some((m) => m.kind === "agent")).toBe(true);
  });
});
