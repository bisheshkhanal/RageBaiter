import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "backend-integration",
    environment: "node",
    include: ["src/**/*.integration.test.ts"],
    setupFiles: ["src/test-helpers/setup.ts"],
    fileParallelism: false,
  },
});
