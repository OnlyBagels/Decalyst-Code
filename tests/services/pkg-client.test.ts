import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PkgClient } from "../../src/services/pkg-client.js";

describe("PkgClient", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("npmView", () => {
    it("parses registry.npmjs.org response correctly", async () => {
      const data = {
        name: "lodash",
        "dist-tags": { latest: "4.17.21" },
        versions: {
          "4.17.21": {
            description: "Lodash utility library",
            homepage: "https://lodash.com",
            dependencies: { "some-dep": "^1.0.0" },
          },
        },
        homepage: "https://lodash.com",
      };

      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValueOnce(data),
      });

      const client = new PkgClient();
      const result = await client.npmView("lodash");

      expect(result).not.toBeNull();
      expect(result?.name).toBe("lodash");
      expect(result?.latest).toBe("4.17.21");
      expect(result?.description).toBe("Lodash utility library");
      expect(result?.homepage).toBe("https://lodash.com");
    });

    it("returns null on 404", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
      });

      const client = new PkgClient();
      const result = await client.npmView("nonexistent-pkg-xyz");

      expect(result).toBeNull();
    });

    it("returns null on parse error", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockRejectedValueOnce(new Error("Invalid JSON")),
      });

      const client = new PkgClient();
      const result = await client.npmView("lodash");

      expect(result).toBeNull();
    });

    it("handles missing metadata fields", async () => {
      const data = {
        name: "minimal-pkg",
        "dist-tags": { latest: "1.0.0" },
        versions: {
          "1.0.0": {},
        },
      };

      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValueOnce(data),
      });

      const client = new PkgClient();
      const result = await client.npmView("minimal-pkg");

      expect(result).not.toBeNull();
      expect(result?.name).toBe("minimal-pkg");
      expect(result?.latest).toBe("1.0.0");
      expect(result?.description).toBeUndefined();
    });

    it("extracts dependencies from latest version", async () => {
      const data = {
        name: "pkg",
        "dist-tags": { latest: "2.0.0" },
        versions: {
          "2.0.0": {
            dependencies: { "dep-a": "^1.0.0", "dep-b": "~2.0.0" },
          },
        },
      };

      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValueOnce(data),
      });

      const client = new PkgClient();
      const result = await client.npmView("pkg");

      expect(result?.dependencies).toEqual({
        "dep-a": "^1.0.0",
        "dep-b": "~2.0.0",
      });
    });
  });

  describe("pipView", () => {
    it("parses PyPI JSON response correctly", async () => {
      const data = {
        info: {
          name: "requests",
          version: "2.31.0",
          summary: "HTTP library",
          home_page: "https://requests.readthedocs.io",
        },
      };

      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValueOnce(data),
      });

      const client = new PkgClient();
      const result = await client.pipView("requests");

      expect(result).not.toBeNull();
      expect(result?.name).toBe("requests");
      expect(result?.latest).toBe("2.31.0");
      expect(result?.description).toBe("HTTP library");
      expect(result?.homepage).toBe("https://requests.readthedocs.io");
    });

    it("returns null on 404", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
      });

      const client = new PkgClient();
      const result = await client.pipView("nonexistent-xyz");

      expect(result).toBeNull();
    });

    it("returns null on parse error", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockRejectedValueOnce(new Error("Bad JSON")),
      });

      const client = new PkgClient();
      const result = await client.pipView("requests");

      expect(result).toBeNull();
    });

    it("returns null if info field missing", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValueOnce({}),
      });

      const client = new PkgClient();
      const result = await client.pipView("requests");

      expect(result).toBeNull();
    });
  });

  describe("cargoView", () => {
    it("parses crates.io API response correctly", async () => {
      const data = {
        crate: {
          name: "serde",
          max_version: "1.0.197",
          description: "Serialization framework",
          repository: "https://github.com/serde-rs/serde",
        },
      };

      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValueOnce(data),
      });

      const client = new PkgClient();
      const result = await client.cargoView("serde");

      expect(result).not.toBeNull();
      expect(result?.name).toBe("serde");
      expect(result?.latest).toBe("1.0.197");
      expect(result?.description).toBe("Serialization framework");
      expect(result?.repository).toBe("https://github.com/serde-rs/serde");
    });

    it("returns null on 404", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
      });

      const client = new PkgClient();
      const result = await client.cargoView("nonexistent-crate-xyz");

      expect(result).toBeNull();
    });

    it("returns null if crate field missing", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValueOnce({}),
      });

      const client = new PkgClient();
      const result = await client.cargoView("serde");

      expect(result).toBeNull();
    });
  });

  describe("goView", () => {
    it("parses Go module version list and picks highest semver", async () => {
      const versionList = "v0.1.0\nv0.2.0\nv1.0.0\nv1.2.3";

      fetchSpy.mockResolvedValueOnce({
        ok: true,
        text: vi.fn().mockResolvedValueOnce(versionList),
      });

      const client = new PkgClient();
      const result = await client.goView("github.com/example/pkg");

      expect(result).not.toBeNull();
      expect(result?.latest).toBe("v1.2.3");
    });

    it("returns null on 404", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
      });

      const client = new PkgClient();
      const result = await client.goView("github.com/nonexistent/pkg");

      expect(result).toBeNull();
    });

    it("returns null on empty version list", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        text: vi.fn().mockResolvedValueOnce(""),
      });

      const client = new PkgClient();
      const result = await client.goView("github.com/example/pkg");

      expect(result).toBeNull();
    });

    it("handles multi-line version list with whitespace", async () => {
      const versionList = "v1.0.0\nv2.0.0\nv2.1.0\n";

      fetchSpy.mockResolvedValueOnce({
        ok: true,
        text: vi.fn().mockResolvedValueOnce(versionList),
      });

      const client = new PkgClient();
      const result = await client.goView("github.com/example/pkg");

      expect(result?.latest).toBe("v2.1.0");
    });
  });

  describe("timeout handling", () => {
    it("respects custom timeout", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValueOnce({ crate: { name: "pkg", max_version: "1.0.0" } }),
      });

      const client = new PkgClient(5000);
      const result = await client.cargoView("pkg");

      expect(result).not.toBeNull();
    });
  });
});
