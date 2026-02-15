import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "./backend/vitest.config.ts",
  "./shared/vitest.config.ts",
  "./extension/vitest.config.ts",
]);
