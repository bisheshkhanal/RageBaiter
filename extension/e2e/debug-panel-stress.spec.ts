import { test, expect, chromium } from "@playwright/test";
import { getExtensionLaunchArgs, resolveUnpackedExtensionPath } from "./extension-harness.js";

test.describe("Debug Panel Stress Test", () => {
  test("renders high volume of logs without lag", async () => {
    const extensionPath = resolveUnpackedExtensionPath();
    const userDataDir = "/tmp/test-user-data-" + Date.now();

    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: true,
      args: [...getExtensionLaunchArgs(extensionPath), "--headless=new"],
    });

    let extensionId = "";
    await expect
      .poll(async () => {
        const workers = context.serviceWorkers();
        if (workers.length > 0) {
          const url = workers[0]?.url();
          if (!url) return false;
          const parts = url.split("/");
          const id = parts[2];
          if (id) {
            extensionId = id;
            return true;
          }
        }
        return false;
      })
      .toBeTruthy();

    console.log(`Extension ID: ${extensionId}`);

    const page = await context.newPage();

    let loaded = false;
    const paths = ["sidepanel.html", "src/sidepanel/sidepanel.html"];

    for (const p of paths) {
      try {
        await page.goto(`chrome-extension://${extensionId}/${p}`);

        const hasRoot = await page.evaluate(() => !!document.getElementById("root"));
        if (hasRoot) {
          loaded = true;
          break;
        }
      } catch {
        continue;
      }
    }

    if (!loaded) {
      throw new Error("Could not load sidepanel.html");
    }

    await page.getByText("Debug Panel").click();
    await expect(page.getByText("No logs to display")).toBeVisible();

    const senderPage = await context.newPage();
    let senderLoaded = false;
    const senderPaths = ["popup.html", "src/popup/popup.html"];

    for (const p of senderPaths) {
      try {
        await senderPage.goto(`chrome-extension://${extensionId}/${p}`);
        const hasBody = await senderPage.evaluate(() => !!document.body);
        if (hasBody) {
          senderLoaded = true;
          break;
        }
      } catch {
        continue;
      }
    }

    if (!senderLoaded) {
      await senderPage.goto(page.url());
    }

    const startTime = Date.now();
    const LOG_COUNT = 100;

    await senderPage.evaluate(async (count) => {
      // @ts-ignore
      const runtime = (window as any).chrome.runtime;

      for (let i = 0; i < count; i++) {
        runtime.sendMessage({
          type: "ANALYZE_RESULT",
          id: `stress-${i}`,
          payload: {
            tweetId: `tweet-${i}`,
            topic: `Stress Test Log ${i}`,
            confidence: 0.9,
            tweetVector: { social: 0.1, economic: 0.1, populist: 0.1 },
            fallacies: [],
          },
        });
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    }, LOG_COUNT);

    await expect(page.getByText(`Stress Test Log ${LOG_COUNT - 1}`)).toBeVisible({
      timeout: 10000,
    });

    const duration = Date.now() - startTime;
    console.log(`Rendered ${LOG_COUNT} logs in ${duration}ms`);

    await context.close();
  });
});
