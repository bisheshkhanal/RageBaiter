import path from "node:path";
import { execSync } from "node:child_process";
import type { FullConfig } from "@playwright/test";

const globalSetup = async (_config: FullConfig): Promise<void> => {
  const extensionRoot = path.resolve(import.meta.dirname, "..");

  execSync("pnpm build", {
    cwd: extensionRoot,
    stdio: "inherit",
  });
};

export default globalSetup;
