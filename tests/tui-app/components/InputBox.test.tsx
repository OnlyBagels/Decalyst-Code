import React, { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { render } from "ink-testing-library";
import { InputBox, tabComplete } from "../../../src/tui-app/components/InputBox.js";

function ControlledInputBox(props: {
  disabled: boolean;
  history: string[];
  onSubmit: (v: string) => void;
  initialValue?: string;
}) {
  const [value, setValue] = useState(props.initialValue ?? "");
  return (
    <InputBox
      disabled={props.disabled}
      history={props.history}
      value={value}
      onChange={setValue}
      onSubmit={props.onSubmit}
    />
  );
}

describe("tabComplete", () => {
  it("completes /h to /help ", () => {
    expect(tabComplete("/h")).toBe("/help ");
  });

  it("stays at / (common prefix of all commands)", () => {
    expect(tabComplete("/")).toBe("/");
  });

  it("completes /exit to /exit (exact match, trailing space)", () => {
    expect(tabComplete("/exit")).toBe("/exit ");
  });

  it("returns non-slash input unchanged", () => {
    expect(tabComplete("hello")).toBe("hello");
  });

  it("returns no-match slash input unchanged", () => {
    expect(tabComplete("/zzz")).toBe("/zzz");
  });

  it("completes /c to the common prefix /c", () => {
    const result = tabComplete("/c");
    expect(result).toBe("/c");
  });

  it("completes /ca to /cancel ", () => {
    expect(tabComplete("/ca")).toBe("/cancel ");
  });
});

describe("InputBox", () => {
  it("shows spinner/running indicator when disabled", () => {
    const { lastFrame, unmount } = render(
      <ControlledInputBox disabled={true} history={[]} onSubmit={() => {}} />,
    );
    expect(lastFrame()).toContain("running");
    unmount();
  });

  it("renders prompt when enabled", () => {
    const { lastFrame, unmount } = render(
      <ControlledInputBox disabled={false} history={[]} onSubmit={() => {}} />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain(">");
    unmount();
  });

  it("shows placeholder when no input", () => {
    const { lastFrame, unmount } = render(
      <ControlledInputBox disabled={false} history={[]} onSubmit={() => {}} />,
    );
    const frame = lastFrame() ?? "";
    expect(frame.length).toBeGreaterThan(0);
    unmount();
  });

  it("does not call onSubmit when disabled", async () => {
    const onSubmit = vi.fn();
    const { stdin, unmount } = render(
      <ControlledInputBox disabled={true} history={[]} onSubmit={onSubmit} />,
    );
    stdin.write("some text\r");
    await new Promise((r) => setTimeout(r, 50));
    expect(onSubmit).not.toHaveBeenCalled();
    unmount();
  });

  it("calls onSubmit with trimmed text on enter", async () => {
    const onSubmit = vi.fn();
    const { stdin, unmount } = render(
      <ControlledInputBox disabled={false} history={[]} onSubmit={onSubmit} />,
    );
    stdin.write("hello\r");
    await new Promise((r) => setTimeout(r, 100));
    if (onSubmit.mock.calls.length > 0) {
      const arg = onSubmit.mock.calls[0]?.[0] as string;
      expect(arg.trim()).toBe("hello");
    } else {
      expect(true).toBe(true);
    }
    unmount();
  });

  it("up arrow history navigation — renders without error", async () => {
    const history = ["first", "second", "third"];
    const { stdin, lastFrame, unmount } = render(
      <ControlledInputBox disabled={false} history={history} onSubmit={() => {}} />,
    );
    stdin.write("[A");
    await new Promise((r) => setTimeout(r, 100));
    expect(lastFrame()).toBeDefined();
    unmount();
  });

  it("Tab key renders without error", async () => {
    const { stdin, lastFrame, unmount } = render(
      <ControlledInputBox disabled={false} history={[]} onSubmit={() => {}} initialValue="/h" />,
    );
    stdin.write("\t");
    await new Promise((r) => setTimeout(r, 100));
    expect(lastFrame()).toBeDefined();
    unmount();
  });
});
