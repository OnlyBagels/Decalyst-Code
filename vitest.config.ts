import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    testTimeout: 30000,
    pool: "forks",
    poolOptions: {
      forks: {
        execArgv: ["--max-old-space-size=1024"],
      },
    },
    server: {
      deps: {
        external: ["gpt-tokenizer"],
      },
    },
  },
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "react",
  },
});
