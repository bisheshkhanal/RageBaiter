import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "backend",
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.integration.test.ts"],
    setupFiles: ["src/test-helpers/setup.ts"],
    fileParallelism: false,
  },
});
