import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "extension",
    globals: true,
    environment: "jsdom",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    exclude: ["tests/**/*.integration.test.ts"],
    setupFiles: ["../__tests__/setup/extension.setup.ts"],
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    testTimeout: 15_000,
  },
});
