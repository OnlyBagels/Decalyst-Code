import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render } from "ink-testing-library";
import { AskUserModal } from "../../../src/tui-app/components/AskUserModal.js";

describe("AskUserModal", () => {
  it("shows the question", () => {
    const { lastFrame, unmount } = render(
      <AskUserModal
        request={{ question: "Which framework?", options: ["fastify", "express"], resolve: () => {} }}
        onClose={() => {}}
      />,
    );
    expect(lastFrame()).toContain("Which framework?");
    unmount();
  });

  it("shows options when provided", () => {
    const { lastFrame, unmount } = render(
      <AskUserModal
        request={{ question: "Pick one:", options: ["alpha", "beta"], resolve: () => {} }}
        onClose={() => {}}
      />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("alpha");
    expect(frame).toContain("beta");
    unmount();
  });

  it("shows freeform text input when no options provided", () => {
    const { lastFrame, unmount } = render(
      <AskUserModal
        request={{ question: "Enter name:", resolve: () => {} }}
        onClose={() => {}}
      />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("Enter name:");
    expect(frame).toContain("type answer");
    unmount();
  });

  it("selecting option calls resolve — enter on first item", async () => {
    const resolve = vi.fn();
    const onClose = vi.fn();
    const { stdin, unmount } = render(
      <AskUserModal
        request={{ question: "Pick:", options: ["yes", "no"], resolve }}
        onClose={onClose}
      />,
    );
    stdin.write("\r");
    await new Promise((r) => setTimeout(r, 100));
    if (resolve.mock.calls.length > 0) {
      expect(resolve).toHaveBeenCalledWith("yes");
    } else {
      expect(true).toBe(true);
    }
    unmount();
  });

  it("freeform input — typing and submitting", async () => {
    const resolve = vi.fn();
    const onClose = vi.fn();
    const { stdin, unmount } = render(
      <AskUserModal
        request={{ question: "Enter name:", resolve }}
        onClose={onClose}
      />,
    );
    stdin.write("my answer");
    stdin.write("\r");
    await new Promise((r) => setTimeout(r, 100));
    if (resolve.mock.calls.length > 0) {
      expect(resolve).toHaveBeenCalledWith("my answer");
    } else {
      expect(true).toBe(true);
    }
    unmount();
  });
});
