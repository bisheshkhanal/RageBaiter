import path from "node:path";
import {
  test,
  expect,
  chromium,
  type BrowserContext,
  type Page,
  type Worker,
} from "@playwright/test";

const extensionRoot = path.resolve(import.meta.dirname, "..");
const extensionPath = path.resolve(extensionRoot, "dist");
const demoTweetId = "1729382256910270464";

const triggerIntervention = async (serviceWorker: Worker, page: Page): Promise<void> => {
  await serviceWorker.evaluate(
    async ({ tabUrl, tweetId }) => {
      type BrowserTab = { id?: number };
      type BrowserChrome = {
        tabs: {
          query: (queryInfo: { url: string }) => Promise<BrowserTab[]>;
          sendMessage: (tabId: number, message: unknown) => Promise<unknown>;
        };
      };

      const browserGlobal = globalThis as { chrome?: BrowserChrome; crypto: Crypto };
      const tabsApi = browserGlobal.chrome?.tabs;

      if (!tabsApi) {
        throw new Error("Chrome tabs API unavailable in service worker context");
      }

      const [tab] = await tabsApi.query({ url: tabUrl });
      if (!tab?.id) {
        throw new Error(`Tab not found for URL ${tabUrl}`);
      }

      await tabsApi.sendMessage(tab.id, {
        type: "INTERVENTION_TRIGGER",
        id: browserGlobal.crypto.randomUUID(),
        payload: {
          tweetId,
          level: "medium",
          reason: "Election policy outrage bait",
          tweetVector: {
            social: 0.65,
            economic: -0.25,
            populist: 0.4,
          },
          logicFailure: "False Dichotomy",
          claim: "Only one political side can save the nation.",
          mechanism: "Frames complex policy as a binary moral choice.",
          dataCheck: "Look for cross-partisan voting records and policy outcomes.",
          socraticChallenge: "What evidence would falsify this binary framing?",
        },
      });
    },
    { tabUrl: page.url(), tweetId: demoTweetId }
  );
};

test.describe("Intervention flow on demo tweet", () => {
  test.describe.configure({ mode: "serial" });

  let context: BrowserContext;
  let serviceWorker: Worker;
  let page: Page;

  test.beforeAll(async () => {
    context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      headless: false,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    });

    serviceWorker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  });

  test.afterAll(async () => {
    if (context) {
      await context.close();
    }
  });

  test.beforeEach(async () => {
    page = await context.newPage();
    await page.goto("/demo-page.html");

    const tweet = page.locator('article[data-testid="tweet"]');
    await expect(tweet).toBeVisible();
    await expect.poll(async () => tweet.getAttribute("data-ragebaiter-processed")).toBe("true");
    await expect(tweet).toHaveAttribute("data-ragebaiter-level", "none");
  });

  test.afterEach(async () => {
    await page.close();
  });

  test("extension loads and registers MV3 service worker", async () => {
    expect(serviceWorker.url()).toContain("chrome-extension://");
  });

  test("detects demo tweet and renders intervention popup in shadow DOM", async () => {
    await triggerIntervention(serviceWorker, page);

    const popup = page.locator("pierce/.rb-popup");
    await expect(popup).toBeVisible();
    await expect(page.locator('article[data-testid="tweet"]')).toHaveAttribute(
      "data-ragebaiter-level",
      "medium"
    );
  });

  test("submits Agree feedback and stores agreed state", async () => {
    await triggerIntervention(serviceWorker, page);
    await page.locator('pierce/[data-testid="feedback-agree-button"]').click();

    const tweet = page.locator('article[data-testid="tweet"]');
    await expect.poll(async () => tweet.getAttribute("data-ragebaiter-ui")).toBe("agreed");
  });

  test("dismiss action closes popup and stores acknowledged state", async () => {
    await triggerIntervention(serviceWorker, page);
    await page.locator("pierce/.rb-proceed-btn").click();

    const tweet = page.locator('article[data-testid="tweet"]');
    await expect.poll(async () => tweet.getAttribute("data-ragebaiter-ui")).toBe("acknowledged");
    await expect(page.locator("pierce/.rb-popup")).toHaveCount(0);
  });
});
