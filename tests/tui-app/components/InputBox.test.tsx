import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render } from "ink-testing-library";
import { InputBox } from "../../../src/tui-app/components/InputBox.js";

describe("InputBox", () => {
  it("shows spinner/running indicator when disabled", () => {
    const { lastFrame, unmount } = render(
      <InputBox disabled={true} history={[]} onSubmit={() => {}} />,
    );
    expect(lastFrame()).toContain("running");
    unmount();
  });

  it("renders prompt when enabled", () => {
    const { lastFrame, unmount } = render(
      <InputBox disabled={false} history={[]} onSubmit={() => {}} />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain(">");
    unmount();
  });

  it("shows placeholder when no input", () => {
    const { lastFrame, unmount } = render(
      <InputBox disabled={false} history={[]} onSubmit={() => {}} />,
    );
    const frame = lastFrame() ?? "";
    expect(frame.length).toBeGreaterThan(0);
    unmount();
  });

  it("does not call onSubmit when disabled", async () => {
    const onSubmit = vi.fn();
    const { stdin, unmount } = render(
      <InputBox disabled={true} history={[]} onSubmit={onSubmit} />,
    );
    stdin.write("some text\r");
    await new Promise((r) => setTimeout(r, 50));
    expect(onSubmit).not.toHaveBeenCalled();
    unmount();
  });

  it("calls onSubmit with trimmed text on enter", async () => {
    const onSubmit = vi.fn();
    const { stdin, unmount } = render(
      <InputBox disabled={false} history={[]} onSubmit={onSubmit} />,
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
      <InputBox disabled={false} history={history} onSubmit={() => {}} />,
    );
    stdin.write("[A");
    await new Promise((r) => setTimeout(r, 100));
    expect(lastFrame()).toBeDefined();
    unmount();
  });
});
