import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "extension",
    environment: "jsdom",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    setupFiles: ["../__tests__/setup/extension.setup.ts"],
  },
});
