interface PkgInfo {
  name: string;
  latest: string;
  description?: string;
  homepage?: string;
  repository?: string;
  dependencies?: Record<string, string>;
}

export class PkgClient {
  private readonly timeoutMs: number;

  constructor(timeoutMs = 10000) {
    this.timeoutMs = timeoutMs;
  }

  async npmView(pkg: string): Promise<PkgInfo | null> {
    try {
      const url = `https://registry.npmjs.org/${encodeURIComponent(pkg)}`;
      const response = await this.fetchWithTimeout(url);

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as Record<string, unknown>;

      const latest = this.getLatestVersion(data);
      if (!latest) {
        return null;
      }

      const distTags = data["dist-tags"] as Record<string, string> | undefined;
      const latestVersion = distTags?.["latest"] || latest;

      const versionsObj = data["versions"] as Record<string, unknown> | undefined;
      const latestMeta = versionsObj?.[latestVersion] as Record<string, unknown> | undefined;

      return {
        name: String(data["name"] || pkg),
        latest: latestVersion,
        description: latestMeta?.["description"] as string | undefined,
        homepage: (latestMeta?.["homepage"] || data["homepage"]) as string | undefined,
        repository: this.extractRepository(latestMeta || data),
        dependencies: (latestMeta?.["dependencies"] || data["dependencies"]) as
          | Record<string, string>
          | undefined,
      };
    } catch {
      return null;
    }
  }

  async pipView(pkg: string): Promise<PkgInfo | null> {
    try {
      const url = `https://pypi.org/pypi/${encodeURIComponent(pkg)}/json`;
      const response = await this.fetchWithTimeout(url);

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as Record<string, unknown>;
      const info = data["info"] as Record<string, unknown> | undefined;

      if (!info) {
        return null;
      }

      return {
        name: String(info["name"] || pkg),
        latest: String(info["version"] || "unknown"),
        description: info["summary"] as string | undefined,
        homepage: info["home_page"] as string | undefined,
      };
    } catch {
      return null;
    }
  }

  async cargoView(pkg: string): Promise<PkgInfo | null> {
    try {
      const url = `https://crates.io/api/v1/crates/${encodeURIComponent(pkg)}`;
      const response = await this.fetchWithTimeout(url);

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as Record<string, unknown>;
      const crate_data = data["crate"] as Record<string, unknown> | undefined;

      if (!crate_data) {
        return null;
      }

      return {
        name: String(crate_data["name"] || pkg),
        latest: String(crate_data["max_version"] || "unknown"),
        description: crate_data["description"] as string | undefined,
        repository: crate_data["repository"] as string | undefined,
      };
    } catch {
      return null;
    }
  }

  async goView(pkg: string): Promise<PkgInfo | null> {
    try {
      const url = `https://proxy.golang.org/${encodeURIComponent(pkg)}/@v/list`;
      const response = await this.fetchWithTimeout(url);

      if (!response.ok) {
        return null;
      }

      const text = await response.text();
      const versions = text
        .trim()
        .split("\n")
        .filter((v) => v.length > 0);

      if (versions.length === 0) {
        return null;
      }

      const latest = this.pickHighestVersion(versions);

      return {
        name: pkg,
        latest,
      };
    } catch {
      return null;
    }
  }

  private async fetchWithTimeout(url: string): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      return await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private getLatestVersion(data: Record<string, unknown>): string | null {
    const versions = data["versions"] as Record<string, unknown> | undefined;
    if (!versions || typeof versions !== "object") {
      return null;
    }

    const keys = Object.keys(versions)
      .filter((v) => !v.includes("pre") && !v.includes("beta") && !v.includes("alpha"))
      .sort()
      .reverse();

    return keys[0] || null;
  }

  private pickHighestVersion(versions: string[]): string {
    return versions
      .sort((a, b) => {
        const aParts = a.replace("v", "").split(".").map(Number);
        const bParts = b.replace("v", "").split(".").map(Number);

        for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
          const aVal = aParts[i] || 0;
          const bVal = bParts[i] || 0;
          if (aVal !== bVal) return bVal - aVal;
        }

        return 0;
      })
      .at(0) || versions[0] || "unknown";
  }

  private extractRepository(obj: Record<string, unknown>): string | undefined {
    const repo = obj["repository"] as string | Record<string, unknown> | undefined;

    if (typeof repo === "string") {
      return repo;
    }

    if (repo && typeof repo === "object") {
      const url = (repo as Record<string, unknown>)["url"] as string | undefined;
      return url?.replace("git+", "").replace(".git", "");
    }

    return undefined;
  }
}
