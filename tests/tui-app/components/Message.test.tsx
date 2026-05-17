import React from "react";
import { describe, it, expect } from "vitest";
import { render } from "ink-testing-library";
import { Message } from "../../../src/tui-app/components/Message.js";
import { theme } from "../../../src/tui-app/theme.js";

describe("Message", () => {
  it("renders user message", () => {
    const msg = { kind: "user" as const, text: "hello world", ts: "2024-01-01" };
    const { lastFrame } = render(<Message msg={msg} />);
    expect(lastFrame()).toContain("> hello world");
  });

  it("renders agent message", () => {
    const msg = { kind: "agent" as const, text: "planning done", ts: "2024-01-01" };
    const { lastFrame } = render(<Message msg={msg} />);
    expect(lastFrame()).toContain("planning done");
  });

  it("renders build message", () => {
    const msg = { kind: "build" as const, line: "scaffold-writer ok", ts: "2024-01-01" };
    const { lastFrame } = render(<Message msg={msg} />);
    expect(lastFrame()).toContain("[build]");
    expect(lastFrame()).toContain("scaffold-writer ok");
  });

  it("renders system message", () => {
    const msg = { kind: "system" as const, text: "run aborted", ts: "2024-01-01" };
    const { lastFrame } = render(<Message msg={msg} />);
    expect(lastFrame()).toContain("[system]");
    expect(lastFrame()).toContain("run aborted");
  });

  it("mixes kinds — user prefix distinct from agent", () => {
    const user = { kind: "user" as const, text: "my input", ts: "t1" };
    const agent = { kind: "agent" as const, text: "response", ts: "t2" };
    const u = render(<Message msg={user} />);
    const a = render(<Message msg={agent} />);
    expect(u.lastFrame()).toContain("> my input");
    expect(a.lastFrame()).not.toContain(">");
  });
});
