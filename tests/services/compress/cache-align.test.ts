import { describe, expect, it } from "vitest";
import { CacheAligner } from "../../../src/services/compress/cache-align.js";
import type { ChatMessage } from "../../../src/models/model-client.js";

const aligner = new CacheAligner();

describe("CacheAligner", () => {
  it("splits a system message with stable + variable sections", () => {
    const messages: ChatMessage[] = [
      {
        role: "system",
        content:
          "You are a helpful assistant.\nYour role is to write code.\n\n# Current state\nThe file has 3 errors.",
      },
    ];
    const result = aligner.alignPrompt(messages);
    expect(result.length).toBe(2);
    expect(result[0]!.role).toBe("system");
    expect(result[0]!.content).toContain("You are");
    expect(result[0]!.content).not.toContain("Current state");
    expect(result[1]!.role).toBe("system");
    expect(result[1]!.content).toContain("Current state");
    expect(result[1]!.content).toContain("3 errors");
  });

  it("leaves messages without stable/variable boundary unchanged", () => {
    const messages: ChatMessage[] = [
      { role: "system", content: "Just a plain system message." },
      { role: "user", content: "Hello" },
    ];
    const result = aligner.alignPrompt(messages);
    expect(result.length).toBe(2);
    expect(result[0]!.content).toBe("Just a plain system message.");
  });

  it("preserves order across role boundaries", () => {
    const messages: ChatMessage[] = [
      { role: "system", content: "System prompt." },
      { role: "user", content: "First user message." },
      { role: "assistant", content: "First assistant reply." },
      { role: "user", content: "Second user message." },
    ];
    const result = aligner.alignPrompt(messages);
    expect(result[result.length - 2]!.role).toBe("assistant");
    expect(result[result.length - 1]!.role).toBe("user");
    expect(result[result.length - 1]!.content).toBe("Second user message.");
  });

  it("handles empty message list", () => {
    expect(aligner.alignPrompt([])).toEqual([]);
  });

  it("does not reorder user/assistant messages", () => {
    const messages: ChatMessage[] = [
      { role: "user", content: "user 1" },
      { role: "assistant", content: "assistant 1" },
      { role: "user", content: "user 2" },
    ];
    const result = aligner.alignPrompt(messages);
    expect(result.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
  });
});
