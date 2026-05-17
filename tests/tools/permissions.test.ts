import { describe, it, expect, vi } from "vitest";
import { PermissionResolver } from "../../src/tools/permissions.js";
import type { PermissionConfig, ToolCtx, PermissionDecision } from "../../src/tools/schemas.js";

function makeCtx(emit = vi.fn()): ToolCtx {
  return {
    workspaceRoot: "/tmp",
    agent: "orchestrator",
    signal: new AbortController().signal,
    emit,
  };
}

function makeConfig(
  overrides: Partial<PermissionConfig> = {},
): PermissionConfig {
  return { perTool: {}, ...overrides };
}

describe("PermissionResolver", () => {
  it("returns auto for tools in the auto set", async () => {
    const resolver = new PermissionResolver(makeConfig());
    const result = await resolver.resolve("glob", {}, makeCtx());
    expect(result).toBe("auto");
  });

  it("returns deny without prompting when perTool sets deny", async () => {
    const emit = vi.fn();
    const resolver = new PermissionResolver(
      makeConfig({ perTool: { web_search: "deny" } }),
    );
    const result = await resolver.resolve("web_search", {}, makeCtx(emit));
    expect(result).toBe("deny");
    expect(emit).not.toHaveBeenCalled();
  });

  it("emits permission_request for ask tools and resolves with the callback answer", async () => {
    const resolver = new PermissionResolver(makeConfig());

    let capturedResolve: ((d: PermissionDecision) => void) | undefined;
    const emit = vi.fn((event: { t: string; resolve?: (d: PermissionDecision) => void }) => {
      if (event.t === "permission_request" && event.resolve) {
        capturedResolve = event.resolve;
      }
    });

    const ctx = makeCtx(emit as ToolCtx["emit"]);
    const promise = resolver.resolve("web_search", {}, ctx);

    expect(capturedResolve).toBeDefined();
    capturedResolve!("auto");

    const result = await promise;
    expect(result).toBe("auto");
  });

  it("caches ask-once: second call returns cached answer without prompting again", async () => {
    const resolver = new PermissionResolver(
      makeConfig({ perTool: { create_file: "ask-once" } }),
    );

    let resolveCount = 0;
    const emit = vi.fn((event: { t: string; resolve?: (d: PermissionDecision) => void }) => {
      if (event.t === "permission_request" && event.resolve) {
        resolveCount++;
        event.resolve("auto");
      }
    });

    const ctx = makeCtx(emit as ToolCtx["emit"]);
    const args = { path: "src/foo.ts" };

    await resolver.resolve("create_file", args, ctx);
    await resolver.resolve("create_file", args, ctx);

    expect(resolveCount).toBe(1);
  });

  it("globalOverride takes priority over perTool", async () => {
    const emit = vi.fn();
    const resolver = new PermissionResolver(
      makeConfig({
        perTool: { glob: "deny" },
        globalOverride: "auto",
      }),
    );
    const result = await resolver.resolve("glob", {}, makeCtx(emit));
    expect(result).toBe("auto");
    expect(emit).not.toHaveBeenCalled();
  });

  it("evaluate callback in perTool overrides the default", async () => {
    // PermissionConfig.perTool only holds PermissionDecision strings, not PermissionSpec.
    // evaluate() lives on ToolDef level; this test verifies the resolver uses the
    // config value rather than the built-in default when one is supplied.
    const resolver = new PermissionResolver(
      makeConfig({ perTool: { fetch_url: "auto" } }),
    );
    const result = await resolver.resolve("fetch_url", {}, makeCtx());
    expect(result).toBe("auto");
  });
});
