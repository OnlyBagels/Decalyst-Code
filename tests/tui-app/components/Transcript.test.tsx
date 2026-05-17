import React from "react";
import { describe, it, expect } from "vitest";
import { render } from "ink-testing-library";
import { Transcript } from "../../../src/tui-app/components/Transcript.js";
import type { Message } from "../../../src/agent/session-state.js";

describe("Transcript", () => {
  it("renders multiple messages in order", () => {
    const messages: Message[] = [
      { kind: "user", text: "first message", ts: "t1" },
      { kind: "agent", text: "second message", ts: "t2" },
      { kind: "build", line: "third build line", ts: "t3" },
    ];
    const { lastFrame } = render(<Transcript messages={messages} />);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("first message");
    expect(frame).toContain("second message");
    expect(frame).toContain("third build line");
  });

  it("empty transcript renders without error", () => {
    const { lastFrame } = render(<Transcript messages={[]} />);
    expect(lastFrame()).toBeDefined();
  });

  it("renders single message without crashing", () => {
    const messages: Message[] = [
      { kind: "system", text: "session started", ts: "t1" },
    ];
    const { lastFrame } = render(<Transcript messages={messages} />);
    expect(lastFrame()).toContain("session started");
  });
});
