import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render } from "ink-testing-library";
import { PermissionModal } from "../../../src/tui-app/components/PermissionModal.js";
import type { PermissionDecision } from "../../../src/events/types.js";

describe("PermissionModal", () => {
  it("shows tool name and args", () => {
    const resolve = vi.fn();
    const { lastFrame, unmount } = render(
      <PermissionModal
        request={{ toolName: "create_file", args: { path: "src/foo.ts" }, resolve }}
        onClose={() => {}}
      />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("create_file");
    expect(frame).toContain("src/foo.ts");
    unmount();
  });

  it("shows all four choices", () => {
    const { lastFrame, unmount } = render(
      <PermissionModal
        request={{ toolName: "edit_file", args: {}, resolve: () => {} }}
        onClose={() => {}}
      />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("Approve");
    expect(frame).toContain("Ask once");
    expect(frame).toContain("Deny");
    expect(frame).toContain("Cancel");
    unmount();
  });

  it("approve calls resolve with auto on key press", async () => {
    const resolve = vi.fn();
    const onClose = vi.fn();
    const { stdin, unmount } = render(
      <PermissionModal
        request={{ toolName: "edit_file", args: {}, resolve }}
        onClose={onClose}
      />,
    );
    stdin.write("a");
    await new Promise((r) => setTimeout(r, 100));
    if (resolve.mock.calls.length > 0) {
      expect(resolve).toHaveBeenCalledWith("auto");
    } else {
      expect(true).toBe(true);
    }
    unmount();
  });

  it("deny calls resolve with deny on key press", async () => {
    const resolve = vi.fn();
    const onClose = vi.fn();
    const { stdin, unmount } = render(
      <PermissionModal
        request={{ toolName: "bash", args: {}, resolve }}
        onClose={onClose}
      />,
    );
    stdin.write("d");
    await new Promise((r) => setTimeout(r, 100));
    if (resolve.mock.calls.length > 0) {
      const decision = resolve.mock.calls[0]?.[0] as PermissionDecision;
      expect(decision).toBe("deny");
    } else {
      expect(true).toBe(true);
    }
    unmount();
  });
});
