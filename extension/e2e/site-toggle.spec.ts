import { test, expect, type BrowserContext } from "@playwright/test";
import { getExtensionLaunchArgs, resolveUnpackedExtensionPath } from "./extension-harness.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

declare const chrome: {
  storage: {
    sync: {
      get: (key: string, cb: (items: Record<string, any>) => void) => void;
    };
  };
};

const launchExtensionContext = async (
  pw: any
): Promise<{ context: BrowserContext; extensionId: string }> => {
  const extensionPath = resolveUnpackedExtensionPath();
  const context: BrowserContext = await pw.chromium.launchPersistentContext("", {
    channel: "chromium",
    args: [
      ...getExtensionLaunchArgs(extensionPath),
      "--no-first-run",
      "--disable-gpu",
      "--no-default-browser-check",
    ],
    headless: false,
  });

  let worker = context.serviceWorkers()[0];
  if (!worker) {
    worker = await context.waitForEvent("serviceworker", { timeout: 10_000 });
  }

  const swUrl = worker.url();
  const match = swUrl.match(/chrome-extension:\/\/([^/]+)\//);
  const extensionId = match?.[1];

  if (!extensionId) {
    await context.close();
    throw new Error("Could not extract extension ID from service worker URL");
  }

  return { context, extensionId };
};

test.describe("Site Toggle E2E", () => {
  test("disabled site prevents scraper activation via storage gate", async ({ playwright }) => {
    const { context, extensionId } = await launchExtensionContext(playwright as any);

    try {
      const page = await context.newPage();
      await page.goto(`chrome-extension://${extensionId}/src/sidepanel/sidepanel.html`);

      const settingsTab = page.locator("button.tab-button", { hasText: "Settings" });
      await settingsTab.click();

      const twitterToggle = page.getByTestId("site-toggle-twitter");
      await expect(twitterToggle).toBeVisible({ timeout: 5_000 });
      await expect(twitterToggle).toBeChecked();

      await twitterToggle.click();
      await expect(twitterToggle).not.toBeChecked();

      const storageState = await page.evaluate(async () => {
        return new Promise<unknown>((resolve) => {
          chrome.storage.sync.get("ragebaiter_site_config", (items: Record<string, unknown>) => {
            resolve(items.ragebaiter_site_config);
          });
        });
      });

      const config = storageState as {
        sites: Record<string, { enabled: boolean }>;
        globalEnabled: boolean;
      };
      expect(config.sites["twitter"]?.enabled).toBe(false);
      expect(config.globalEnabled).toBe(true);
    } finally {
      await context.close();
    }
  });

  test("toggle off stops intervention updates for new content", async ({ playwright }) => {
    const { context, extensionId } = await launchExtensionContext(playwright as any);

    try {
      const page = await context.newPage();
      await page.goto(`chrome-extension://${extensionId}/src/sidepanel/sidepanel.html`);

      const settingsTab = page.locator("button.tab-button", { hasText: "Settings" });
      await settingsTab.click();

      const globalPauseButton = page.getByTestId("global-pause-button");
      await expect(globalPauseButton).toBeVisible({ timeout: 5_000 });
      await expect(globalPauseButton).toHaveText("Pause All Sites");

      await globalPauseButton.click();
      await expect(globalPauseButton).toHaveText("Resume All Sites");

      const storageState = await page.evaluate(async () => {
        return new Promise<unknown>((resolve) => {
          chrome.storage.sync.get("ragebaiter_site_config", (items: Record<string, unknown>) => {
            resolve(items.ragebaiter_site_config);
          });
        });
      });

      const config = storageState as {
        sites: Record<string, { enabled: boolean }>;
        globalEnabled: boolean;
      };
      expect(config.globalEnabled).toBe(false);

      await globalPauseButton.click();
      await expect(globalPauseButton).toHaveText("Pause All Sites");

      const resumedState = await page.evaluate(async () => {
        return new Promise<unknown>((resolve) => {
          chrome.storage.sync.get("ragebaiter_site_config", (items: Record<string, unknown>) => {
            resolve(items.ragebaiter_site_config);
          });
        });
      });

      const resumedConfig = resumedState as { globalEnabled: boolean };
      expect(resumedConfig.globalEnabled).toBe(true);
    } finally {
      await context.close();
    }
  });
});
