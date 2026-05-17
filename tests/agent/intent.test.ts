import { describe, it, expect } from "vitest";
import { IntentClassifier } from "../../src/agent/intent.js";
import type { ModelClient } from "../../src/models/model-client.js";

function makeClient(jsonResponse: string): ModelClient {
  return {
    async completeJson() { return jsonResponse; },
    async completeText() { return jsonResponse; },
    async completeWithTools() {
      throw new Error("not used");
    },
  };
}

describe("IntentClassifier", () => {
  it("classifies a build intent", async () => {
    const client = makeClient(JSON.stringify({ kind: "build", goal: "create REST API" }));
    const classifier = new IntentClassifier(client, "test-model");
    const result = await classifier.classify({
      userMessage: "Build me a REST API",
      recentTranscript: [],
    });
    expect(result.kind).toBe("build");
    if (result.kind === "build") {
      expect(result.goal).toBe("create REST API");
    }
  });

  it("classifies a query intent", async () => {
    const client = makeClient(JSON.stringify({ kind: "query", goal: "list files" }));
    const classifier = new IntentClassifier(client, "test-model");
    const result = await classifier.classify({
      userMessage: "What files exist?",
      recentTranscript: [],
    });
    expect(result.kind).toBe("query");
    if (result.kind === "query") {
      expect(result.question).toBe("list files");
    }
  });

  it("classifies a chat intent", async () => {
    const client = makeClient(JSON.stringify({ kind: "chat", goal: "greeting" }));
    const classifier = new IntentClassifier(client, "test-model");
    const result = await classifier.classify({
      userMessage: "Hello!",
      recentTranscript: [],
    });
    expect(result.kind).toBe("chat");
  });

  it("falls back to chat on invalid JSON from the model", async () => {
    const client = makeClient("not valid json at all {{");
    const classifier = new IntentClassifier(client, "test-model");
    const result = await classifier.classify({
      userMessage: "something weird",
      recentTranscript: [],
    });
    expect(result.kind).toBe("chat");
  });
});
