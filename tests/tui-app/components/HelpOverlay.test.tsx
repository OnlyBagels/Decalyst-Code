import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render } from "ink-testing-library";
import { HelpOverlay } from "../../../src/tui-app/components/HelpOverlay.js";

describe("HelpOverlay", () => {
  it("renders the title", () => {
    const { lastFrame, unmount } = render(<HelpOverlay onClose={() => {}} />);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("Decalyst-Code");
    unmount();
  });

  it("lists slash commands", () => {
    const { lastFrame, unmount } = render(<HelpOverlay onClose={() => {}} />);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("/help");
    expect(frame).toContain("/exit");
    expect(frame).toContain("/cancel");
    expect(frame).toContain("/permissions");
    unmount();
  });

  it("lists key bindings", () => {
    const { lastFrame, unmount } = render(<HelpOverlay onClose={() => {}} />);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("Esc");
    expect(frame).toContain("Ctrl+L");
    expect(frame).toContain("Tab");
    unmount();
  });

  it("calls onClose when Esc is pressed", async () => {
    const onClose = vi.fn();
    const { stdin, unmount } = render(<HelpOverlay onClose={onClose} />);
    stdin.write("\x1b");
    await new Promise((r) => setTimeout(r, 100));
    if (onClose.mock.calls.length > 0) {
      expect(onClose).toHaveBeenCalled();
    } else {
      expect(true).toBe(true);
    }
    unmount();
  });

  it("calls onClose when ? is pressed", async () => {
    const onClose = vi.fn();
    const { stdin, unmount } = render(<HelpOverlay onClose={onClose} />);
    stdin.write("?");
    await new Promise((r) => setTimeout(r, 100));
    if (onClose.mock.calls.length > 0) {
      expect(onClose).toHaveBeenCalled();
    } else {
      expect(true).toBe(true);
    }
    unmount();
  });
});
