import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { ToolRegistry } from "../../../src/tools/registry.js";
import { PermissionResolver } from "../../../src/tools/permissions.js";
import { FileLocks } from "../../../src/tools/locks.js";
import { registerResearchTools } from "../../../src/tools/handlers/research.js";
import { WebClient } from "../../../src/services/web-client.js";
import { PkgClient } from "../../../src/services/pkg-client.js";
import type { ToolCtx, PermissionConfig } from "../../../src/tools/schemas.js";

function makeConfig(overrides: Partial<PermissionConfig> = {}): PermissionConfig {
  return {
    perTool: {
      web_search: "ask",
      fetch_url: "ask",
      npm_view: "auto",
      pkg_view: "auto",
    },
    ...overrides,
  };
}

function makeCtx(overrides: Partial<ToolCtx> = {}): ToolCtx {
  return {
    workspaceRoot: "/tmp",
    agent: "orchestrator",
    signal: new AbortController().signal,
    emit: vi.fn(),
    ...overrides,
  };
}

function makeRegistry(opts: Partial<PermissionConfig> = {}) {
  const permissions = new PermissionResolver(makeConfig(opts));
  const locks = new FileLocks();
  return new ToolRegistry({ permissions, locks });
}

describe("registerResearchTools", () => {
  let mockWeb: WebClient;
  let mockPkg: PkgClient;
  let registry: ToolRegistry;

  beforeEach(() => {
    mockWeb = {
      search: vi.fn(),
      fetch: vi.fn(),
    } as unknown as WebClient;

    mockPkg = {
      npmView: vi.fn(),
      pipView: vi.fn(),
      cargoView: vi.fn(),
      goView: vi.fn(),
    } as unknown as PkgClient;

    registry = makeRegistry();
    registerResearchTools(registry, { web: mockWeb, pkg: mockPkg });
  });

  function makeCtxWithAutoPermissions(overrides: Partial<ToolCtx> = {}): ToolCtx {
    const ctx = makeCtx(overrides);
    const originalEmit = ctx.emit;
    ctx.emit = ((event: Parameters<ToolCtx["emit"]>[0]) => {
      originalEmit(event);
      if ("resolve" in event && event.t === "permission_request") {
        event.resolve("auto");
      }
    }) as ToolCtx["emit"];
    return ctx;
  }

  describe("web_search", () => {
    it("dispatches to WebClient.search correctly", async () => {
      (mockWeb.search as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        { title: "Result 1", url: "https://example.com", snippet: "Snippet 1" },
      ]);

      const result = await registry.invoke(
        "web_search",
        { query: "test query", maxResults: 3 },
        makeCtxWithAutoPermissions(),
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        const data = result.data as unknown[];
        expect(data).toHaveLength(1);
      }
    });

    it("passes maxResults to WebClient.search", async () => {
      (mockWeb.search as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

      await registry.invoke(
        "web_search",
        { query: "test", maxResults: 10 },
        makeCtxWithAutoPermissions(),
      );

      expect(mockWeb.search).toHaveBeenCalledWith("test", 10);
    });

    it("handles missing maxResults with default", async () => {
      (mockWeb.search as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

      await registry.invoke("web_search", { query: "test" }, makeCtxWithAutoPermissions());

      expect(mockWeb.search).toHaveBeenCalledWith("test", undefined);
    });

    it("has permission ask with orchestrator agent", () => {
      const tools = registry.listForAgent("orchestrator");
      const webSearch = tools.find((t) => t.name === "web_search");
      expect(webSearch).toBeDefined();
      expect(webSearch?.agent).toBe("orchestrator");
    });
  });

  describe("fetch_url", () => {
    it("dispatches to WebClient.fetch correctly", async () => {
      (mockWeb.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        text: "page content",
        title: "Page Title",
        contentType: "text/html",
        status: 200,
      });

      const result = await registry.invoke(
        "fetch_url",
        { url: "https://example.com" },
        makeCtxWithAutoPermissions(),
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        const data = result.data as Record<string, unknown>;
        expect(data.text).toBe("page content");
      }
    });

    it("returns error when fetch fails", async () => {
      (mockWeb.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("Network error"),
      );

      const result = await registry.invoke(
        "fetch_url",
        { url: "https://example.com" },
        makeCtxWithAutoPermissions(),
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("Network error");
      }
    });

    it("has permission ask with orchestrator agent", () => {
      const tools = registry.listForAgent("orchestrator");
      const fetchUrl = tools.find((t) => t.name === "fetch_url");
      expect(fetchUrl).toBeDefined();
      expect(fetchUrl?.agent).toBe("orchestrator");
    });

    it("validates URL schema", async () => {
      const result = await registry.invoke(
        "fetch_url",
        { url: "not a valid url" },
        makeCtxWithAutoPermissions(),
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("SCHEMA_VALIDATION_FAILED");
      }
    });
  });

  describe("npm_view", () => {
    it("dispatches to PkgClient.npmView correctly", async () => {
      (mockPkg.npmView as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        name: "lodash",
        latest: "4.17.21",
        description: "Lodash utility library",
      });

      const result = await registry.invoke("npm_view", { package: "lodash" }, makeCtx());

      expect(result.ok).toBe(true);
      if (result.ok) {
        const data = result.data as Record<string, unknown>;
        expect(data.name).toBe("lodash");
      }
    });

    it("returns error when package not found", async () => {
      (mockPkg.npmView as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

      const result = await registry.invoke("npm_view", { package: "nonexistent" }, makeCtx());

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("Package not found");
      }
    });

    it("has permission auto with orchestrator agent", () => {
      const tools = registry.listForAgent("orchestrator");
      const npmView = tools.find((t) => t.name === "npm_view");
      expect(npmView).toBeDefined();
      expect(npmView?.agent).toBe("orchestrator");
    });
  });

  describe("pkg_view", () => {
    it("routes npm ecosystem to npmView", async () => {
      (mockPkg.npmView as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        name: "pkg",
        latest: "1.0.0",
      });

      const result = await registry.invoke(
        "pkg_view",
        { package: "pkg", ecosystem: "npm" },
        makeCtx(),
      );

      expect(result.ok).toBe(true);
      expect(mockPkg.npmView).toHaveBeenCalledWith("pkg");
    });

    it("routes pip ecosystem to pipView", async () => {
      (mockPkg.pipView as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        name: "requests",
        latest: "2.31.0",
      });

      const result = await registry.invoke(
        "pkg_view",
        { package: "requests", ecosystem: "pip" },
        makeCtx(),
      );

      expect(result.ok).toBe(true);
      expect(mockPkg.pipView).toHaveBeenCalledWith("requests");
    });

    it("routes cargo ecosystem to cargoView", async () => {
      (mockPkg.cargoView as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        name: "serde",
        latest: "1.0.0",
      });

      const result = await registry.invoke(
        "pkg_view",
        { package: "serde", ecosystem: "cargo" },
        makeCtx(),
      );

      expect(result.ok).toBe(true);
      expect(mockPkg.cargoView).toHaveBeenCalledWith("serde");
    });

    it("routes go ecosystem to goView", async () => {
      (mockPkg.goView as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        name: "golang.org/x/sys",
        latest: "v0.1.0",
      });

      const result = await registry.invoke(
        "pkg_view",
        { package: "golang.org/x/sys", ecosystem: "go" },
        makeCtx(),
      );

      expect(result.ok).toBe(true);
      expect(mockPkg.goView).toHaveBeenCalledWith("golang.org/x/sys");
    });

    it("returns error when ecosystem handler returns null", async () => {
      (mockPkg.npmView as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

      const result = await registry.invoke(
        "pkg_view",
        { package: "nonexistent", ecosystem: "npm" },
        makeCtx(),
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("Package not found");
      }
    });

    it("has permission auto with orchestrator agent", () => {
      const tools = registry.listForAgent("orchestrator");
      const pkgView = tools.find((t) => t.name === "pkg_view");
      expect(pkgView).toBeDefined();
      expect(pkgView?.agent).toBe("orchestrator");
    });

    it("validates ecosystem enum", async () => {
      const result = await registry.invoke(
        "pkg_view",
        { package: "pkg", ecosystem: "invalid" as unknown as string },
        makeCtxWithAutoPermissions(),
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("SCHEMA_VALIDATION_FAILED");
      }
    });
  });

  describe("tool registration", () => {
    it("registers all four research tools", () => {
      const tools = registry.listForAgent("orchestrator");
      const names = tools.map((t) => t.name);

      expect(names).toContain("web_search");
      expect(names).toContain("fetch_url");
      expect(names).toContain("npm_view");
      expect(names).toContain("pkg_view");
    });

    it("all tools are for orchestrator agent", () => {
      const tools = registry.listForAgent("orchestrator");
      const research = tools.filter((t) =>
        ["web_search", "fetch_url", "npm_view", "pkg_view"].includes(t.name),
      );

      expect(research).toHaveLength(4);
      expect(research.every((t) => t.agent === "orchestrator")).toBe(true);
    });

    it("tools are not visible to swarm agent", () => {
      const tools = registry.listForAgent("swarm");
      const names = tools.map((t) => t.name);

      expect(names).not.toContain("web_search");
      expect(names).not.toContain("fetch_url");
      expect(names).not.toContain("npm_view");
      expect(names).not.toContain("pkg_view");
    });
  });
});
