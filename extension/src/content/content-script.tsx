import {
  MESSAGE_TYPES,
  isExtensionMessage,
  type AnalyzeResultMessage,
  type InterventionTriggerMessage,
  type MessageAck,
} from "../messaging/protocol.js";
import { sendTweetDetected, sendSiteConfigRequest } from "../messaging/runtime.js";
import { isExtensionActiveOnUrl, type SiteConfiguration } from "../lib/site-config.js";
import React from "react";
import { createRoot } from "react-dom/client";
import { InterventionPopup, type InterventionLevel } from "../components/InterventionPopup";

const TWEET_SELECTOR = 'article[data-testid="tweet"]';
const URL_CHECK_INTERVAL_MS = 500;

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
  selector: string
): TElement[] => {
  const candidates = Array.from(tweetElement.querySelectorAll<TElement>(selector));

  return candidates.filter((candidate) => {
    const closestTweet = candidate.closest(TWEET_SELECTOR);
    return closestTweet === tweetElement;
  });
};

const getFirstElementWithinTweet = <TElement extends Element>(
  tweetElement: HTMLElement,
  selector: string
): TElement | null => {
  const matches = getElementsWithinTweet<TElement>(tweetElement, selector);
  return matches[0] ?? null;
};

const getStatusUrlPath = (tweetElement: HTMLElement): string => {
  const timeElement = getFirstElementWithinTweet<HTMLTimeElement>(tweetElement, "time");
  const timeAnchor = timeElement?.closest("a");

  if (timeAnchor?.getAttribute("href")) {
    return timeAnchor.getAttribute("href") ?? "";
  }

  const allAnchors = getElementsWithinTweet<HTMLAnchorElement>(tweetElement, "a[href]");

  for (const anchor of allAnchors) {
    const href = anchor.getAttribute("href");
    if (href && /\/status\/(\d+)/.test(href)) {
      return href;
    }
  }

  return "";
};

const getTweetId = (tweetElement: HTMLElement): string => {
  const statusPath = getStatusUrlPath(tweetElement);
  const match = statusPath.match(/\/status\/(\d+)/);
  return match?.[1] ?? "";
};

const getAuthorHandle = (tweetElement: HTMLElement): string => {
  const statusPath = getStatusUrlPath(tweetElement);
  const statusPathMatch = statusPath.match(/^\/?([^/]+)\/status\/\d+/);

  if (statusPathMatch?.[1]) {
    return statusPathMatch[1].replace(/^@/, "");
  }

  const authorAnchor = getFirstElementWithinTweet<HTMLAnchorElement>(
    tweetElement,
    '[data-testid="User-Name"] a[href^="/"]'
  );

  if (!authorAnchor) {
    return "";
  }

  const href = authorAnchor.getAttribute("href") ?? "";
  const handle = href.replace(/^\//, "").split("/")[0] ?? "";
  return handle.replace(/^@/, "");
};

const getTimestamp = (tweetElement: HTMLElement): string => {
  const timeElement = getFirstElementWithinTweet<HTMLTimeElement>(tweetElement, "time");
  return timeElement?.getAttribute("datetime") ?? "";
};

const getTweetText = (tweetElement: HTMLElement): string => {
  const textElement =
    getFirstElementWithinTweet<HTMLElement>(tweetElement, '[data-testid="tweetText"]') ??
    getFirstElementWithinTweet<HTMLElement>(tweetElement, "div[lang]");

  return textElement?.textContent?.trim() ?? "";
};

const findMetricByDataTestIds = (tweetElement: HTMLElement, testIds: string[]): number => {
  for (const testId of testIds) {
    const button = getFirstElementWithinTweet<HTMLElement>(
      tweetElement,
      `[data-testid="${testId}"]`
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

const findMetricByAriaLabel = (tweetElement: HTMLElement, keywords: string[]): number => {
  const buttons = getElementsWithinTweet<HTMLElement>(tweetElement, '[role="button"][aria-label]');

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

const getEngagementMetrics = (tweetElement: HTMLElement): EngagementMetrics => {
  const replies =
    findMetricByDataTestIds(tweetElement, ["reply"]) ||
    findMetricByAriaLabel(tweetElement, ["repl", "antwort"]);
  const retweets =
    findMetricByDataTestIds(tweetElement, ["retweet", "unretweet"]) ||
    findMetricByAriaLabel(tweetElement, ["repost", "retweet"]);
  const likes =
    findMetricByDataTestIds(tweetElement, ["like", "unlike"]) ||
    findMetricByAriaLabel(tweetElement, ["like", "gefallt"]);

  return {
    likes,
    retweets,
    replies,
  };
};

export const extractTweetPayload = (tweetElement: HTMLElement): TweetScrapePayload | null => {
  const tweetId = getTweetId(tweetElement);

  if (!tweetId) {
    return null;
  }

  return {
    tweetId,
    tweetText: getTweetText(tweetElement),
    authorHandle: getAuthorHandle(tweetElement),
    timestamp: getTimestamp(tweetElement),
    engagementMetrics: getEngagementMetrics(tweetElement),
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

const injectInterventionUI = (tweetElement: HTMLElement, level: string, reason: string): void => {
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
        container.remove();
        tweetElement.dataset.ragebaiterUi = "dismissed";
      }}
      onProceed={() => {
        container.remove();
        tweetElement.dataset.ragebaiterUi = "acknowledged";
      }}
    />
  );
};

const applyInterventionLevel = (
  message: InterventionTriggerMessage | AnalyzeResultMessage
): MessageAck<void> => {
  const tweetElement = document
    .querySelector<HTMLElement>(`${TWEET_SELECTOR} a[href*="/status/${message.payload.tweetId}"]`)
    ?.closest(TWEET_SELECTOR) as HTMLElement | null;

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
    injectInterventionUI(tweetElement, message.payload.level, message.payload.reason);
  }

  if (message.type === MESSAGE_TYPES.ANALYZE_RESULT) {
    const level = message.payload.level ?? "none";
    tweetElement.dataset.ragebaiterLevel = level;
    tweetElement.dataset.ragebaiterReason = message.payload.topic;
    injectInterventionUI(tweetElement, level, message.payload.topic);
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

const findTweetElementsInNode = (node: Node): HTMLElement[] => {
  if (!isElementNode(node)) {
    return [];
  }

  if (node.matches(TWEET_SELECTOR)) {
    return [node as HTMLElement];
  }

  return Array.from(node.querySelectorAll<HTMLElement>(TWEET_SELECTOR));
};

export const startTwitterScraper = (): ScraperController => {
  if (document.documentElement) {
    document.documentElement.dataset.ragebaiterLoaded = "true";
  }

  const processedTweetIds = new Set<string>();
  const observedTweetElements = new Set<HTMLElement>();
  let active = true;
  let currentUrl = window.location.href;

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
    intersectionObserver.observe(tweetElement);
  };

  const processTweetElement = (tweetElement: HTMLElement): void => {
    if (!active) {
      return;
    }

    const payload = extractTweetPayload(tweetElement);

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
        const tweets = findTweetElementsInNode(node);

        for (const tweetElement of tweets) {
          observeTweetElement(tweetElement);
        }
      }

      for (const node of mutation.removedNodes) {
        const tweets = findTweetElementsInNode(node);

        for (const tweetElement of tweets) {
          intersectionObserver.unobserve(tweetElement);
          observedTweetElements.delete(tweetElement);
        }
      }
    }
  });

  const scanExistingTweets = (): void => {
    const tweets = document.querySelectorAll<HTMLElement>(TWEET_SELECTOR);

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

  const stop = (): void => {
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
  };

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

if (
  typeof window !== "undefined" &&
  typeof document !== "undefined" &&
  /(^|\.)x\.com$|(^|\.)twitter\.com$/.test(window.location.hostname)
) {
  void checkAndInitialize();
}

export {};
