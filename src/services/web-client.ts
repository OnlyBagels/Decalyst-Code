interface WebClientOpts {
  userAgent?: string;
  timeoutMs?: number;
}

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

interface FetchResult {
  text: string;
  title?: string;
  contentType: string;
  status: number;
}

export class WebClient {
  private readonly userAgent: string;
  private readonly timeoutMs: number;

  constructor(opts?: WebClientOpts) {
    this.userAgent =
      opts?.userAgent || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
    this.timeoutMs = opts?.timeoutMs || 10000;
  }

  async search(query: string, maxResults = 5): Promise<SearchResult[]> {
    try {
      const encoded = encodeURIComponent(query);
      const url = `https://html.duckduckgo.com/html/?q=${encoded}`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await fetch(url, {
          headers: { "User-Agent": this.userAgent },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          return [];
        }

        const html = await response.text();
        return this.parseSearchResults(html, maxResults);
      } catch (err) {
        clearTimeout(timeoutId);
        if (err instanceof Error && err.name === "AbortError") {
          return [];
        }
        return [];
      }
    } catch {
      return [];
    }
  }

  async fetch(url: string): Promise<FetchResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        headers: { "User-Agent": this.userAgent },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const contentType = response.headers.get("content-type") || "text/plain";

      if (contentType.includes("application/json")) {
        const text = await response.text();
        return {
          text,
          contentType,
          status: response.status,
        };
      }

      const text = await response.text();
      let title: string | undefined;

      if (contentType.includes("text/html")) {
        title = this.extractTitle(text);
        const body = this.stripHtmlTags(text);
        return {
          text: body,
          title,
          contentType,
          status: response.status,
        };
      }

      return {
        text,
        contentType,
        status: response.status,
      };
    } catch (err) {
      clearTimeout(timeoutId);
      const message = err instanceof Error ? err.message : "Fetch failed";
      throw new Error(`Failed to fetch ${url}: ${message}`);
    }
  }

  private parseSearchResults(html: string, maxResults: number): SearchResult[] {
    const results: SearchResult[] = [];

    const resultRegex = /<div\s+class="result__body"[^>]*>[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>\s*<span[^>]*class="result__title"[^>]*>([^<]*)<\/span>/g;

    let match;
    while ((match = resultRegex.exec(html)) !== null && results.length < maxResults) {
      const url = match[1];
      const title = match[2];

      if (url && title) {
        const snippetMatch = html.substring(match.index).match(
          /<a[^>]*class="result__snippet"[^>]*>([^<]*)/
        );
        const snippet = snippetMatch ? snippetMatch[1] : "";

        if (url && title) {
          results.push({
            url: this.cleanUrl(url),
            title: this.decodeHtml(title),
            snippet: this.decodeHtml(snippet),
          });
        }
      }
    }

    return results;
  }

  private extractTitle(html: string): string | undefined {
    const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    return match ? this.decodeHtml(match[1]) : undefined;
  }

  private stripHtmlTags(html: string): string {
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private cleanUrl(url: string): string {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      return url;
    }
    if (url.startsWith("//")) {
      return "https:" + url;
    }
    return "https://" + url;
  }

  private decodeHtml(str: string | undefined): string {
    if (!str) return "";
    const map: Record<string, string> = {
      "&amp;": "&",
      "&lt;": "<",
      "&gt;": ">",
      "&quot;": '"',
      "&#39;": "'",
    };
    return str.replace(/&[^;]+;/g, (match) => map[match] || match);
  }
}
