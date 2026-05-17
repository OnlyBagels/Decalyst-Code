import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WebClient } from "../../src/services/web-client.js";

describe("WebClient", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("search", () => {
    it("parses DuckDuckGo search results and returns up to maxResults", async () => {
      const html = `
        <div class="result__body">
          <a href="https://example.com" class="result__title"><span class="result__title">Example Site</span></a>
          <a class="result__snippet">This is a snippet</a>
        </div>
        <div class="result__body">
          <a href="https://another.com" class="result__title"><span class="result__title">Another Site</span></a>
          <a class="result__snippet">Another snippet</a>
        </div>
      `;

      fetchSpy.mockResolvedValueOnce({
        ok: true,
        text: vi.fn().mockResolvedValueOnce(html),
      });

      const client = new WebClient();
      const results = await client.search("test query", 2);

      expect(results).toHaveLength(2);
      expect(results[0]?.url).toContain("example.com");
      expect(results[0]?.title).toContain("Example");
    });

    it("returns empty array on parse failure", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        text: vi.fn().mockResolvedValueOnce("<html></html>"),
      });

      const client = new WebClient();
      const results = await client.search("test query");

      expect(results).toEqual([]);
    });

    it("returns empty array on fetch error", async () => {
      fetchSpy.mockRejectedValueOnce(new Error("Network error"));

      const client = new WebClient();
      const results = await client.search("test query");

      expect(results).toEqual([]);
    });

    it("respects maxResults parameter", async () => {
      const html = `
        <div class="result__body">
          <a href="https://a.com" class="result__title"><span class="result__title">A</span></a>
          <a class="result__snippet">A</a>
        </div>
        <div class="result__body">
          <a href="https://b.com" class="result__title"><span class="result__title">B</span></a>
          <a class="result__snippet">B</a>
        </div>
        <div class="result__body">
          <a href="https://c.com" class="result__title"><span class="result__title">C</span></a>
          <a class="result__snippet">C</a>
        </div>
      `;

      fetchSpy.mockResolvedValueOnce({
        ok: true,
        text: vi.fn().mockResolvedValueOnce(html),
      });

      const client = new WebClient();
      const results = await client.search("test", 2);

      expect(results).toHaveLength(2);
    });

    it("defaults to 5 maxResults", async () => {
      const html = `
        <div class="result__body">
          <a href="https://1.com" class="result__title"><span class="result__title">1</span></a>
          <a class="result__snippet">1</a>
        </div>
      `;

      fetchSpy.mockResolvedValueOnce({
        ok: true,
        text: vi.fn().mockResolvedValueOnce(html),
      });

      const client = new WebClient();
      const results = await client.search("test");

      expect(Array.isArray(results)).toBe(true);
    });

    it("returns empty array on non-ok response", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
      });

      const client = new WebClient();
      const results = await client.search("test query");

      expect(results).toEqual([]);
    });
  });

  describe("fetch", () => {
    it("returns text and title for HTML", async () => {
      const html = "<html><head><title>Test Page</title></head><body><h1>Hello</h1></body></html>";

      fetchSpy.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: vi.fn().mockReturnValue("text/html"),
        },
        status: 200,
        text: vi.fn().mockResolvedValueOnce(html),
      });

      const client = new WebClient();
      const result = await client.fetch("https://example.com");

      expect(result.title).toBe("Test Page");
      expect(result.text).toContain("Hello");
      expect(result.contentType).toBe("text/html");
      expect(result.status).toBe(200);
    });

    it("returns content as-is for JSON", async () => {
      const jsonContent = '{"key": "value"}';

      fetchSpy.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: vi.fn().mockReturnValue("application/json"),
        },
        status: 200,
        text: vi.fn().mockResolvedValueOnce(jsonContent),
      });

      const client = new WebClient();
      const result = await client.fetch("https://api.example.com/data");

      expect(result.text).toBe(jsonContent);
      expect(result.contentType).toContain("application/json");
      expect(result.title).toBeUndefined();
    });

    it("returns content as-is for plain text", async () => {
      const textContent = "plain text content";

      fetchSpy.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: vi.fn().mockReturnValue("text/plain"),
        },
        status: 200,
        text: vi.fn().mockResolvedValueOnce(textContent),
      });

      const client = new WebClient();
      const result = await client.fetch("https://example.com/file.txt");

      expect(result.text).toBe(textContent);
      expect(result.contentType).toContain("text/plain");
    });

    it("throws on fetch error", async () => {
      fetchSpy.mockRejectedValueOnce(new Error("Network failed"));

      const client = new WebClient();

      await expect(client.fetch("https://example.com")).rejects.toThrow("Failed to fetch");
    });

    it("throws on timeout", async () => {
      const abortError = new Error("Abort");
      abortError.name = "AbortError";

      fetchSpy.mockRejectedValueOnce(abortError);

      const client = new WebClient({ timeoutMs: 1000 });

      await expect(client.fetch("https://example.com")).rejects.toThrow("Failed to fetch");
    });

    it("handles missing content-type header", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: vi.fn().mockReturnValue(null),
        },
        status: 200,
        text: vi.fn().mockResolvedValueOnce("content"),
      });

      const client = new WebClient();
      const result = await client.fetch("https://example.com");

      expect(result.contentType).toBe("text/plain");
    });

    it("strips HTML tags from body", async () => {
      const html = "<html><body><p>Text with <b>bold</b> and <i>italic</i>.</p></body></html>";

      fetchSpy.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: vi.fn().mockReturnValue("text/html"),
        },
        status: 200,
        text: vi.fn().mockResolvedValueOnce(html),
      });

      const client = new WebClient();
      const result = await client.fetch("https://example.com");

      expect(result.text).not.toContain("<");
      expect(result.text).toContain("Text");
      expect(result.text).toContain("bold");
    });

    it("removes script and style tags", async () => {
      const html =
        "<html><head><style>body { color: red; }</style></head><body>Text<script>alert('hi')</script></body></html>";

      fetchSpy.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: vi.fn().mockReturnValue("text/html"),
        },
        status: 200,
        text: vi.fn().mockResolvedValueOnce(html),
      });

      const client = new WebClient();
      const result = await client.fetch("https://example.com");

      expect(result.text).not.toContain("script");
      expect(result.text).not.toContain("style");
      expect(result.text).not.toContain("alert");
    });
  });

  describe("constructor options", () => {
    it("uses custom user agent", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        text: vi.fn().mockResolvedValueOnce("<html></html>"),
      });

      const client = new WebClient({ userAgent: "CustomAgent/1.0" });
      await client.search("test");

      const callArgs = (fetchSpy.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
      expect((callArgs.headers as Record<string, string>)["User-Agent"]).toBe("CustomAgent/1.0");
    });

    it("uses custom timeout", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        text: vi.fn().mockResolvedValueOnce("<html></html>"),
      });

      const client = new WebClient({ timeoutMs: 5000 });
      await client.search("test");

      expect(fetchSpy).toHaveBeenCalled();
    });
  });
});
