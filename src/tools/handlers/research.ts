import { z } from "zod";
import type { ToolRegistry } from "../registry.js";
import type { ToolCtx } from "../schemas.js";
import { WebClient } from "../../services/web-client.js";
import { PkgClient } from "../../services/pkg-client.js";

const webSearchSchema = z.object({
  query: z.string().describe("Search query"),
  maxResults: z.number().int().positive().optional().describe("Maximum results (default 5)"),
});

const fetchUrlSchema = z.object({
  url: z.string().url().describe("URL to fetch"),
});

const npmViewSchema = z.object({
  package: z.string().describe("NPM package name"),
});

const pkgViewSchema = z.object({
  package: z.string().describe("Package name"),
  ecosystem: z
    .enum(["npm", "pip", "cargo", "go"])
    .describe("Package ecosystem"),
});

interface Deps {
  web: WebClient;
  pkg: PkgClient;
}

export function registerResearchTools(registry: ToolRegistry, deps: Deps): void {
  registry.register({
    name: "web_search",
    description: "Search the web using DuckDuckGo",
    agent: "orchestrator",
    schema: webSearchSchema,
    handler: async (args, _ctx): Promise<unknown> => {
      const results = await deps.web.search(args.query, args.maxResults);
      return results;
    },
  });

  registry.register({
    name: "fetch_url",
    description: "Fetch and parse content from a URL",
    agent: "orchestrator",
    schema: fetchUrlSchema,
    handler: async (args, _ctx): Promise<unknown> => {
      const result = await deps.web.fetch(args.url);
      return result;
    },
  });

  registry.register({
    name: "npm_view",
    description: "Get metadata for an NPM package",
    agent: "orchestrator",
    schema: npmViewSchema,
    handler: async (args, _ctx): Promise<unknown> => {
      const result = await deps.pkg.npmView(args.package);
      if (result === null) {
        throw new Error(`Package not found: ${args.package}`);
      }
      return result;
    },
  });

  registry.register({
    name: "pkg_view",
    description: "Get metadata for a package in any supported ecosystem",
    agent: "orchestrator",
    schema: pkgViewSchema,
    handler: async (args, _ctx): Promise<unknown> => {
      let result;

      switch (args.ecosystem) {
        case "npm":
          result = await deps.pkg.npmView(args.package);
          break;
        case "pip":
          result = await deps.pkg.pipView(args.package);
          break;
        case "cargo":
          result = await deps.pkg.cargoView(args.package);
          break;
        case "go":
          result = await deps.pkg.goView(args.package);
          break;
      }

      if (result === null) {
        throw new Error(`Package not found: ${args.package} (${args.ecosystem})`);
      }

      return result;
    },
  });
}
