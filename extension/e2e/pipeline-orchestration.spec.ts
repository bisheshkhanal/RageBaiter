import { test, expect } from "@playwright/test";

import { getExtensionLaunchArgs, resolveUnpackedExtensionPath } from "./extension-harness.js";

test.fixme("TASK-20: full pipeline processes political tweet and injects intervention UI on mock twitter page", async ({
  playwright,
}) => {
  test.skip(
    !process.env.RUN_EXTENSION_BROWSER_E2E,
    "Set RUN_EXTENSION_BROWSER_E2E=1 to enable browser launch checks."
  );

  const extensionPath = resolveUnpackedExtensionPath();
  const context = await playwright.chromium.launchPersistentContext("", {
    channel: "chromium",
    args: getExtensionLaunchArgs(extensionPath),
    headless: false,
  });

  const page = await context.newPage();

  await page.setContent(`
      <html>
        <head><title>Mock Twitter</title></head>
        <body>
          <article data-testid="tweet">
            <a href="/user/status/12345">
              <time datetime="2026-02-15T12:00:00.000Z">Feb 15</time>
            </a>
            <div data-testid="tweetText">
              The president signed new legislation on immigration policy and tax reform
            </div>
          </article>
        </body>
      </html>
    `);

  const serviceWorkers = context.serviceWorkers();
  if (serviceWorkers.length === 0) {
    await context.waitForEvent("serviceworker", { timeout: 15_000 });
  }

  await page.waitForTimeout(3_000);

  const tweetArticle = page.locator('article[data-testid="tweet"]');
  const processed = await tweetArticle.getAttribute("data-ragebaiter-processed");
  expect(processed).toBe("true");

  const level = await tweetArticle.getAttribute("data-ragebaiter-level");
  expect(level).toBeDefined();

  await context.close();
});
