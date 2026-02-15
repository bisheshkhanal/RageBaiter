import { test, expect } from "@playwright/test";

import { getExtensionLaunchArgs, resolveUnpackedExtensionPath } from "./extension-harness.js";

test("resolves unpacked extension path and launch flags", async () => {
  const extensionPath = resolveUnpackedExtensionPath();
  const launchArgs = getExtensionLaunchArgs(extensionPath);

  expect(extensionPath.length).toBeGreaterThan(0);
  expect(launchArgs).toContain(`--disable-extensions-except=${extensionPath}`);
  expect(launchArgs).toContain(`--load-extension=${extensionPath}`);
});

test("placeholder MV3 browser launch flow", async ({ playwright }) => {
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

  await context.close();
});
