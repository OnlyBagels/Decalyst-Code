import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
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
});
