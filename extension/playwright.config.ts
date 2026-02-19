import path from "node:path";
import { defineConfig } from "@playwright/test";

const extensionPath = path.resolve(import.meta.dirname, "dist");

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 30_000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    channel: "chromium",
    headless: false,
    baseURL: "http://127.0.0.1:4173",
    launchOptions: {
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    },
    trace: "retain-on-failure",
    video: "off",
  },
  webServer: {
    command: "python3 -m http.server 4173 --directory e2e/fixtures",
    url: "http://127.0.0.1:4173/demo-page.html",
    reuseExistingServer: !process.env.CI,
    cwd: path.resolve(import.meta.dirname),
  },
});
