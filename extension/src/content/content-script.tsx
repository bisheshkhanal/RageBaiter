import {
  MESSAGE_TYPES,
  isExtensionMessage,
  type AnalyzeResultMessage,
  type InterventionTriggerMessage,
  type MessageAck,
} from "../messaging/protocol.js";
import {
  sendFeedbackSubmitted,
  sendTweetDetected,
  sendSiteConfigRequest,
} from "../messaging/runtime.js";
import { isExtensionActiveOnUrl, type SiteConfiguration } from "../lib/site-config.js";
import { createRoot } from "react-dom/client";
import { InterventionPopup, type InterventionLevel } from "../components/InterventionPopup.js";

const LEGACY_TWEET_SELECTOR = 'article[data-testid="tweet"]';
const FALLBACK_TWEET_SELECTOR = 'article[role="article"]';
const URL_CHECK_INTERVAL_MS = 500;

type SelectorFeatureFlags = {
  legacyTweetSelectorEnabled: boolean;
  fallbackTweetSelectorEnabled: boolean;
};

const DEFAULT_SELECTOR_FEATURE_FLAGS: SelectorFeatureFlags = {
  legacyTweetSelectorEnabled: true,
  fallbackTweetSelectorEnabled: true,
};

const buildTweetSelectorChain = (flags: SelectorFeatureFlags): string[] => {
  const selectors: string[] = [];

  if (flags.legacyTweetSelectorEnabled) {
    selectors.push(LEGACY_TWEET_SELECTOR);
  }

  if (flags.fallbackTweetSelectorEnabled) {
    selectors.push(FALLBACK_TWEET_SELECTOR);
  }

  return selectors;
};

const DEFAULT_TWEET_SELECTORS = buildTweetSelectorChain(DEFAULT_SELECTOR_FEATURE_FLAGS);

const resolveSelectorFeatureFlags = (): SelectorFeatureFlags => {
  if (typeof window === "undefined") {
    return DEFAULT_SELECTOR_FEATURE_FLAGS;
  }

  const rawFlags = window.__ragebaiterSelectorFeatureFlags;

  return {
    legacyTweetSelectorEnabled:
      rawFlags?.legacyTweetSelectorEnabled ??
      DEFAULT_SELECTOR_FEATURE_FLAGS.legacyTweetSelectorEnabled,
    fallbackTweetSelectorEnabled:
      rawFlags?.fallbackTweetSelectorEnabled ??
      DEFAULT_SELECTOR_FEATURE_FLAGS.fallbackTweetSelectorEnabled,
  };
};

const getCombinedSelector = (selectors: string[]): string => selectors.join(", ");

const isDebugEnvironment = (): boolean => {
  if (typeof window === "undefined") {
    return false;
  }

  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    return true;
  }

  const testGlobal = globalThis as { __vitest_worker__?: unknown; vitest?: unknown };
  return Boolean(testGlobal.__vitest_worker__ || testGlobal.vitest);
};

const emitSelectorMissTelemetry = (tweetSelectors: string[], reason: string): void => {
  console.warn("[RageBaiter] Tweet selector miss", {
    reason,
    selectors: tweetSelectors,
  });
};

const setScraperDisabledDebugFlag = (disabled: boolean): void => {
  if (!isDebugEnvironment()) {
    return;
  }

  window.__RAGEBAITER_SCRAPER_DISABLED__ = disabled;
};

export type EngagementMetrics = {
  likes: number;
  retweets: number;
  replies: number;
};

export type TweetScrapePayload = {
  tweetId: string;
  tweetText: string;
  authorHandle: string;
  timestamp: string;
  engagementMetrics: EngagementMetrics;
};

type ScraperController = {
  stop: () => void;
};

const parseMetricCount = (rawValue: string | null | undefined): number => {
  if (!rawValue) {
    return 0;
  }

  const normalized = rawValue.trim().toLowerCase().replace(/,/g, "");
  const match = normalized.match(/(\d+(?:\.\d+)?)([kmb])?/i);

  if (!match) {
    return 0;
  }

  const numericValue = Number.parseFloat(match[1] ?? "0");
  const suffix = match[2] ?? "";

  if (!Number.isFinite(numericValue)) {
    return 0;
  }

  if (suffix === "k") {
    return Math.round(numericValue * 1_000);
  }

  if (suffix === "m") {
    return Math.round(numericValue * 1_000_000);
  }

  if (suffix === "b") {
    return Math.round(numericValue * 1_000_000_000);
  }

  return Math.round(numericValue);
};

const getElementsWithinTweet = <TElement extends Element>(
  tweetElement: HTMLElement,
  selector: string,
  tweetSelectors: string[] = DEFAULT_TWEET_SELECTORS
): TElement[] => {
  const candidates = Array.from(tweetElement.querySelectorAll<TElement>(selector));
  const combinedTweetSelector = getCombinedSelector(tweetSelectors);

  return candidates.filter((candidate) => {
    const closestTweet = candidate.closest(combinedTweetSelector);
    return closestTweet === tweetElement;
  });
};

const getFirstElementWithinTweet = <TElement extends Element>(
  tweetElement: HTMLElement,
  selector: string,
  tweetSelectors: string[] = DEFAULT_TWEET_SELECTORS
): TElement | null => {
  const matches = getElementsWithinTweet<TElement>(tweetElement, selector, tweetSelectors);
  return matches[0] ?? null;
};

const getStatusUrlPath = (tweetElement: HTMLElement, tweetSelectors: string[]): string => {
  const timeElement = getFirstElementWithinTweet<HTMLTimeElement>(
    tweetElement,
    "time",
    tweetSelectors
  );
  const timeAnchor = timeElement?.closest("a");

  if (timeAnchor?.getAttribute("href")) {
    return timeAnchor.getAttribute("href") ?? "";
  }

  const allAnchors = getElementsWithinTweet<HTMLAnchorElement>(
    tweetElement,
    "a[href]",
    tweetSelectors
  );

  for (const anchor of allAnchors) {
    const href = anchor.getAttribute("href");
    if (href && /\/status\/(\d+)/.test(href)) {
      return href;
    }
  }

  return "";
};

const getTweetId = (tweetElement: HTMLElement, tweetSelectors: string[]): string => {
  const statusPath = getStatusUrlPath(tweetElement, tweetSelectors);
  const match = statusPath.match(/\/status\/(\d+)/);
  return match?.[1] ?? "";
};

const getAuthorHandle = (tweetElement: HTMLElement, tweetSelectors: string[]): string => {
  const statusPath = getStatusUrlPath(tweetElement, tweetSelectors);
  const statusPathMatch = statusPath.match(/^\/?([^/]+)\/status\/\d+/);

  if (statusPathMatch?.[1]) {
    return statusPathMatch[1].replace(/^@/, "");
  }

  const authorAnchor = getFirstElementWithinTweet<HTMLAnchorElement>(
    tweetElement,
    '[data-testid="User-Name"] a[href^="/"]',
    tweetSelectors
  );

  if (!authorAnchor) {
    return "";
  }

  const href = authorAnchor.getAttribute("href") ?? "";
  const handle = href.replace(/^\//, "").split("/")[0] ?? "";
  return handle.replace(/^@/, "");
};

const getTimestamp = (tweetElement: HTMLElement, tweetSelectors: string[]): string => {
  const timeElement = getFirstElementWithinTweet<HTMLTimeElement>(
    tweetElement,
    "time",
    tweetSelectors
  );
  return timeElement?.getAttribute("datetime") ?? "";
};

const getTweetText = (tweetElement: HTMLElement, tweetSelectors: string[]): string => {
  const textElement =
    getFirstElementWithinTweet<HTMLElement>(
      tweetElement,
      '[data-testid="tweetText"]',
      tweetSelectors
    ) ?? getFirstElementWithinTweet<HTMLElement>(tweetElement, "div[lang]", tweetSelectors);

  return textElement?.textContent?.trim() ?? "";
};

const findMetricByDataTestIds = (
  tweetElement: HTMLElement,
  testIds: string[],
  tweetSelectors: string[]
): number => {
  for (const testId of testIds) {
    const button = getFirstElementWithinTweet<HTMLElement>(
      tweetElement,
      `[data-testid="${testId}"]`,
      tweetSelectors
    );

    if (!button) {
      continue;
    }

    const metricElement = button.querySelector('[data-testid="app-text-transition-container"]');

    if (metricElement?.textContent?.trim()) {
      return parseMetricCount(metricElement.textContent);
    }

    if (button.getAttribute("aria-label")) {
      return parseMetricCount(button.getAttribute("aria-label"));
    }
  }

  return 0;
};

const findMetricByAriaLabel = (
  tweetElement: HTMLElement,
  keywords: string[],
  tweetSelectors: string[]
): number => {
  const buttons = getElementsWithinTweet<HTMLElement>(
    tweetElement,
    '[role="button"][aria-label]',
    tweetSelectors
  );

  for (const button of buttons) {
    const ariaLabel = button.getAttribute("aria-label")?.toLowerCase() ?? "";
    const matchesKeyword = keywords.some((keyword) => ariaLabel.includes(keyword));

    if (!matchesKeyword) {
      continue;
    }

    return parseMetricCount(ariaLabel);
  }

  return 0;
};

const getEngagementMetrics = (
  tweetElement: HTMLElement,
  tweetSelectors: string[]
): EngagementMetrics => {
  const replies =
    findMetricByDataTestIds(tweetElement, ["reply"], tweetSelectors) ||
    findMetricByAriaLabel(tweetElement, ["repl", "antwort"], tweetSelectors);
  const retweets =
    findMetricByDataTestIds(tweetElement, ["retweet", "unretweet"], tweetSelectors) ||
    findMetricByAriaLabel(tweetElement, ["repost", "retweet"], tweetSelectors);
  const likes =
    findMetricByDataTestIds(tweetElement, ["like", "unlike"], tweetSelectors) ||
    findMetricByAriaLabel(tweetElement, ["like", "gefallt"], tweetSelectors);

  return {
    likes,
    retweets,
    replies,
  };
};

const deriveFallbackTweetId = (tweetElement: HTMLElement, tweetSelectors: string[]): string => {
  const text = getTweetText(tweetElement, tweetSelectors);
  const author = getAuthorHandle(tweetElement, tweetSelectors);
  const timestamp = getTimestamp(tweetElement, tweetSelectors);

  const parts = [author, timestamp, text.slice(0, 50)].filter(Boolean);

  if (parts.length === 0) {
    return "";
  }

  const composite = parts.join("|");
  let hash = 0;
  for (let i = 0; i < composite.length; i++) {
    const char = composite.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }

  return `fallback_${Math.abs(hash)}`;
};

export const extractTweetPayload = (
  tweetElement: HTMLElement,
  tweetSelectors: string[] = DEFAULT_TWEET_SELECTORS
): TweetScrapePayload | null => {
  let tweetId = getTweetId(tweetElement, tweetSelectors);

  if (!tweetId) {
    tweetId = deriveFallbackTweetId(tweetElement, tweetSelectors);
  }

  if (!tweetId) {
    return null;
  }

  return {
    tweetId,
    tweetText: getTweetText(tweetElement, tweetSelectors),
    authorHandle: getAuthorHandle(tweetElement, tweetSelectors),
    timestamp: getTimestamp(tweetElement, tweetSelectors),
    engagementMetrics: getEngagementMetrics(tweetElement, tweetSelectors),
  };
};

const sendTweetToServiceWorker = (payload: TweetScrapePayload): void => {
  if (!chrome?.runtime?.sendMessage) {
    return;
  }

  void sendTweetDetected(payload).catch((error) => {
    console.warn("[RageBaiter] Failed to send TWEET_DETECTED", error);
  });
};

const injectInterventionUI = (
  tweetElement: HTMLElement,
  level: string,
  reason: string,
  tweetId: string,
  tweetVector?: { social: number; economic: number; populist: number }
): void => {
  if (tweetElement.dataset.ragebaiterUi === "true") {
    return;
  }

  if (level === "none") {
    return;
  }

  const container = document.createElement("div");
  container.className = "ragebaiter-intervention-container";
  tweetElement.prepend(container);
  tweetElement.dataset.ragebaiterUi = "true";

  const root = createRoot(container);

  const safeLevel = (
    ["low", "medium", "high"].includes(level) ? level : "low"
  ) as InterventionLevel;

  root.render(
    <InterventionPopup
      level={safeLevel}
      reason={reason}
      onDismiss={() => {
        if (tweetVector) {
          void sendFeedbackSubmitted({
            tweetId,
            feedback: "dismissed",
            tweetVector,
            timestamp: new Date().toISOString(),
          }).catch((error) => {
            console.warn("[RageBaiter] Failed to send FEEDBACK_SUBMITTED dismissed", error);
          });
        }
        container.remove();
        tweetElement.dataset.ragebaiterUi = "dismissed";
      }}
      onProceed={() => {
        if (tweetVector) {
          void sendFeedbackSubmitted({
            tweetId,
            feedback: "acknowledged",
            tweetVector,
            timestamp: new Date().toISOString(),
          }).catch((error) => {
            console.warn("[RageBaiter] Failed to send FEEDBACK_SUBMITTED acknowledged", error);
          });
        }
        container.remove();
        tweetElement.dataset.ragebaiterUi = "acknowledged";
      }}
      onAgree={() => {
        if (!tweetVector) {
          return;
        }

        void sendFeedbackSubmitted({
          tweetId,
          feedback: "agreed",
          tweetVector,
          timestamp: new Date().toISOString(),
        }).catch((error) => {
          console.warn("[RageBaiter] Failed to send FEEDBACK_SUBMITTED agreed", error);
        });

        tweetElement.dataset.ragebaiterUi = "agreed";
      }}
      onDisagree={() => {
        if (!tweetVector) {
          return;
        }

        void sendFeedbackSubmitted({
          tweetId,
          feedback: "dismissed",
          tweetVector,
          timestamp: new Date().toISOString(),
        }).catch((error) => {
          console.warn("[RageBaiter] Failed to send FEEDBACK_SUBMITTED dismissed", error);
        });

        tweetElement.dataset.ragebaiterUi = "dismissed";
      }}
    />
  );
};

const applyInterventionLevel = (
  message: InterventionTriggerMessage | AnalyzeResultMessage
): MessageAck<void> => {
  const tweetSelectors = buildTweetSelectorChain(resolveSelectorFeatureFlags());
  const combinedSelector = getCombinedSelector(tweetSelectors);

  if (!combinedSelector) {
    return {
      ok: false,
      error: "No tweet selectors enabled",
      retriable: false,
    };
  }

  const tweetElement = document
    .querySelector<HTMLElement>(`${combinedSelector} a[href*="/status/${message.payload.tweetId}"]`)
    ?.closest(combinedSelector) as HTMLElement | null;

  if (!tweetElement) {
    return {
      ok: false,
      error: `Tweet ${message.payload.tweetId} not found in DOM`,
      retriable: true,
    };
  }

  if (message.type === MESSAGE_TYPES.INTERVENTION_TRIGGER) {
    tweetElement.dataset.ragebaiterLevel = message.payload.level;
    tweetElement.dataset.ragebaiterReason = message.payload.reason;
    injectInterventionUI(
      tweetElement,
      message.payload.level,
      message.payload.reason,
      message.payload.tweetId,
      message.payload.tweetVector
    );
  }

  if (message.type === MESSAGE_TYPES.ANALYZE_RESULT) {
    const level = message.payload.level ?? "none";
    tweetElement.dataset.ragebaiterLevel = level;
    tweetElement.dataset.ragebaiterReason = message.payload.topic;
    injectInterventionUI(
      tweetElement,
      level,
      message.payload.topic,
      message.payload.tweetId,
      message.payload.tweetVector
    );
  }

  return {
    ok: true,
    payload: undefined,
  };
};

const registerMessageListener = (): void => {
  if (!chrome?.runtime?.onMessage?.addListener) {
    return;
  }

  chrome.runtime.onMessage.addListener((incomingMessage, _sender, sendResponse) => {
    if (!isExtensionMessage(incomingMessage)) {
      return false;
    }

    if (
      incomingMessage.type !== MESSAGE_TYPES.INTERVENTION_TRIGGER &&
      incomingMessage.type !== MESSAGE_TYPES.ANALYZE_RESULT
    ) {
      return false;
    }

    const response = applyInterventionLevel(incomingMessage);
    sendResponse(response);
    return true;
  });
};

const isElementNode = (node: Node | EventTarget | null | undefined): node is Element => {
  return !!node && "nodeType" in node && node.nodeType === Node.ELEMENT_NODE;
};

const findTweetElementsInNode = (node: Node, tweetSelectors: string[]): HTMLElement[] => {
  if (!isElementNode(node)) {
    return [];
  }

  const combinedSelector = getCombinedSelector(tweetSelectors);

  if (!combinedSelector) {
    return [];
  }

  const matchesSelector = tweetSelectors.some((selector) => node.matches(selector));
  const descendants = Array.from(node.querySelectorAll<HTMLElement>(combinedSelector));

  if (!matchesSelector) {
    return descendants;
  }

  return [node as HTMLElement, ...descendants];
};

export const startTwitterScraper = (): ScraperController => {
  if (document.documentElement) {
    document.documentElement.dataset.ragebaiterLoaded = "true";
  }

  const processedTweetIds = new Set<string>();
  const observedTweetElements = new Set<HTMLElement>();
  let active = true;
  let currentUrl = window.location.href;
  const tweetSelectors = buildTweetSelectorChain(resolveSelectorFeatureFlags());
  const combinedTweetSelector = getCombinedSelector(tweetSelectors);

  setScraperDisabledDebugFlag(false);

  if (!combinedTweetSelector) {
    emitSelectorMissTelemetry(tweetSelectors, "no-selectors-enabled");
    setScraperDisabledDebugFlag(true);
    return {
      stop: () => undefined,
    };
  }

  if (!document.body) {
    emitSelectorMissTelemetry(tweetSelectors, "missing-document-body");
    setScraperDisabledDebugFlag(true);
    return {
      stop: () => undefined,
    };
  }

  const observeTweetElement = (tweetElement: HTMLElement): void => {
    if (!active) {
      return;
    }

    if (tweetElement.dataset.ragebaiterProcessed === "true") {
      return;
    }

    if (observedTweetElements.has(tweetElement)) {
      return;
    }

    observedTweetElements.add(tweetElement);

    // Immediate-processing fallback: attempt to process right away
    // in case IntersectionObserver callback does not fire promptly.
    // Dedupe guards (processedTweetIds, dataset.ragebaiterProcessed) prevent duplicates.
    processTweetElement(tweetElement);

    // Keep IntersectionObserver path for current architecture compatibility.
    intersectionObserver.observe(tweetElement);
  };

  const processTweetElement = (tweetElement: HTMLElement): void => {
    if (!active) {
      return;
    }

    const payload = extractTweetPayload(tweetElement, tweetSelectors);

    if (!payload) {
      return;
    }

    if (processedTweetIds.has(payload.tweetId)) {
      tweetElement.dataset.ragebaiterProcessed = "true";
      tweetElement.dataset.ragebaiterLevel = "none";
      return;
    }

    processedTweetIds.add(payload.tweetId);
    tweetElement.dataset.ragebaiterProcessed = "true";
    tweetElement.dataset.ragebaiterLevel = "none";
    sendTweetToServiceWorker(payload);
  };

  const intersectionObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!isElementNode(entry.target)) {
        continue;
      }

      if (!entry.isIntersecting) {
        continue;
      }

      const tweetElement = entry.target as HTMLElement;
      processTweetElement(tweetElement);
      intersectionObserver.unobserve(tweetElement);
      observedTweetElements.delete(tweetElement);
    }
  });

  const mutationObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        const tweets = findTweetElementsInNode(node, tweetSelectors);

        for (const tweetElement of tweets) {
          observeTweetElement(tweetElement);
        }
      }

      for (const node of mutation.removedNodes) {
        const tweets = findTweetElementsInNode(node, tweetSelectors);

        for (const tweetElement of tweets) {
          intersectionObserver.unobserve(tweetElement);
          observedTweetElements.delete(tweetElement);
        }
      }
    }
  });

  const scanExistingTweets = (): void => {
    const tweets = document.querySelectorAll<HTMLElement>(combinedTweetSelector);

    if (tweets.length === 0) {
      emitSelectorMissTelemetry(tweetSelectors, "initial-scan-no-match");
      return;
    }

    for (const tweetElement of tweets) {
      observeTweetElement(tweetElement);
    }
  };

  const handleRouteChange = (): void => {
    if (!active || window.location.href === currentUrl) {
      return;
    }

    currentUrl = window.location.href;
    observedTweetElements.clear();
    processedTweetIds.clear();
    intersectionObserver.disconnect();
    scanExistingTweets();
  };

  const nativePushState = window.history.pushState.bind(window.history);
  const nativeReplaceState = window.history.replaceState.bind(window.history);

  window.history.pushState = ((...args: Parameters<History["pushState"]>) => {
    nativePushState(...args);
    handleRouteChange();
  }) as History["pushState"];

  window.history.replaceState = ((...args: Parameters<History["replaceState"]>) => {
    nativeReplaceState(...args);
    handleRouteChange();
  }) as History["replaceState"];

  window.addEventListener("popstate", handleRouteChange);
  window.addEventListener("hashchange", handleRouteChange);
  const routeCheckInterval = window.setInterval(handleRouteChange, URL_CHECK_INTERVAL_MS);

  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });

  scanExistingTweets();

  function stop(): void {
    if (!active) {
      return;
    }

    active = false;
    mutationObserver.disconnect();
    intersectionObserver.disconnect();
    observedTweetElements.clear();
    processedTweetIds.clear();
    window.clearInterval(routeCheckInterval);
    window.removeEventListener("popstate", handleRouteChange);
    window.removeEventListener("hashchange", handleRouteChange);
    window.history.pushState = nativePushState;
    window.history.replaceState = nativeReplaceState;
  }

  window.addEventListener("pagehide", stop, { once: true });
  window.addEventListener("beforeunload", stop, { once: true });

  return {
    stop,
  };
};

declare global {
  interface Window {
    __ragebaiterScraperController?: ScraperController;
    __ragebaiterSiteConfig?: SiteConfiguration;
    __ragebaiterSelectorFeatureFlags?: Partial<SelectorFeatureFlags>;
    __RAGEBAITER_SCRAPER_DISABLED__?: boolean;
  }
}

const checkAndInitialize = async (): Promise<void> => {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  try {
    const response = await sendSiteConfigRequest();
    if (!response.ok || !response.payload) {
      return;
    }

    const config = response.payload.config as SiteConfiguration;
    window.__ragebaiterSiteConfig = config;

    const shouldActivate = isExtensionActiveOnUrl(window.location.href, config);

    if (!shouldActivate) {
      return;
    }

    registerMessageListener();

    if (!window.__ragebaiterScraperController) {
      window.__ragebaiterScraperController = startTwitterScraper();
    }
  } catch {
    return;
  }
};

if (typeof window !== "undefined" && typeof document !== "undefined") {
  void checkAndInitialize();
}

export {};
