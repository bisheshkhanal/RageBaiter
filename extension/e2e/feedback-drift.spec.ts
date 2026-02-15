import { test, expect } from "@playwright/test";
import { getExtensionLaunchArgs, resolveUnpackedExtensionPath } from "./extension-harness.js";

declare const chrome: {
  storage: {
    local: {
      set: (items: Record<string, unknown>) => Promise<void>;
    };
  };
  runtime: {
    sendMessage: (message: unknown) => Promise<unknown>;
  };
};

test.describe("Feedback drift E2E", () => {
  test("feedback click updates sidepanel vector badge", async ({ playwright }) => {
    test.fixme(
      true,
      "TODO TASK-17: Requires stable x.com content-script runtime in CI; quarantined due external page dependency and service-worker messaging race."
    );

    const extensionPath = resolveUnpackedExtensionPath();
    const context = await playwright.chromium.launchPersistentContext("", {
      channel: "chromium",
      args: [
        ...getExtensionLaunchArgs(extensionPath),
        "--no-first-run",
        "--disable-gpu",
        "--no-default-browser-check",
      ],
      headless: false,
    });

    try {
      let worker = context.serviceWorkers()[0];
      if (!worker) {
        worker = await context.waitForEvent("serviceworker", { timeout: 10_000 });
      }

      const extensionIdMatch = worker.url().match(/chrome-extension:\/\/([^/]+)\//);
      expect(extensionIdMatch?.[1]).toBeTruthy();
      const extensionId = extensionIdMatch![1];

      const sidepanelPage = await context.newPage();
      await sidepanelPage.goto(`chrome-extension://${extensionId}/src/sidepanel/sidepanel.html`);

      await sidepanelPage.evaluate(async () => {
        await chrome.storage.local.set({
          userVector: {
            social: 0,
            economic: 0,
            populist: 0,
            x: 0,
            y: 0,
          },
        });
      });

      await sidepanelPage.reload();
      await expect(sidepanelPage.getByTestId("user-vector-badge")).toContainText("(0.00, 0.00)");

      await sidepanelPage.evaluate(async () => {
        await chrome.runtime.sendMessage({
          type: "FEEDBACK_SUBMITTED",
          id: `e2e-${Date.now()}`,
          payload: {
            tweetId: "task17-e2e",
            feedback: "agreed",
            timestamp: new Date().toISOString(),
            tweetVector: {
              social: 0.9,
              economic: -0.4,
              populist: 0.3,
            },
          },
        });
      });

      await expect(sidepanelPage.getByTestId("user-vector-badge")).not.toContainText(
        "(0.00, 0.00)"
      );
    } finally {
      await context.close();
    }
  });
});
