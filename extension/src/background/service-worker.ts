import {
  MESSAGE_TYPES,
  isExtensionMessage,
  type ExtensionMessage,
  type MessageAck,
  type PoliticalVectorPayload,
} from "../messaging/protocol.js";
import { sendInterventionTriggerToTab } from "../messaging/runtime.js";
import { createDecisionEngine, type TweetAnalysis, type UserProfile } from "./decision-engine.js";
import {
  storeLlmConfig,
  clearLlmCredentials,
  clearLegacyLlmStorageKeys,
  setLlmConnectionStatus,
  type LlmConnectionStatus,
} from "../lib/llm-config.js";
import { siteConfigStorage, initializeSiteConfig } from "../lib/site-storage.js";
import {
  isExtensionActiveOnUrl,
  updateSiteEnabled,
  toggleGlobalEnabled,
  type SupportedSite,
} from "../lib/site-config.js";
import { applyFeedbackDrift, type FeedbackType } from "../lib/vector-feedback.js";
import { PipelineOrchestrator, createBackendFetcher, type PipelineConfig } from "./pipeline.js";
import { logger } from "../lib/logger.js";
import * as Sentry from "@sentry/browser";

logger.info("RageBaiter SW ready");

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
  });
}

const ok = (): MessageAck<void> => ({ ok: true, payload: undefined });

const updateBadgeForTab = async (tabId: number, url?: string): Promise<void> => {
  if (!url) {
    await chrome.action.setBadgeText({ text: "", tabId });
    return;
  }

  const config = await siteConfigStorage.getConfig();
  const isActive = isExtensionActiveOnUrl(url, config);

  await chrome.action.setBadgeText({
    text: isActive ? "●" : "",
    tabId,
  });
  await chrome.action.setBadgeBackgroundColor({
    color: isActive ? "#10B981" : "#6B7280",
  });
};

const updateBadgeForAllTabs = async (): Promise<void> => {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.id) {
      await updateBadgeForTab(tab.id, tab.url);
    }
  }
};

const fail = (error: string, retriable = false): MessageAck<void> => ({
  ok: false,
  error,
  retriable,
});

const decisionEngine = createDecisionEngine();

type StoredUserVector = PoliticalVectorPayload & {
  x: number;
  y: number;
};

type FeedbackEvent = {
  id: string;
  tweetId: string;
  feedback: FeedbackType;
  timestamp: string;
  tweetVector: PoliticalVectorPayload;
  beforeVector: PoliticalVectorPayload;
  afterVector: PoliticalVectorPayload;
  delta: PoliticalVectorPayload;
  syncedAt?: string;
  syncAttempts: number;
};

const FEEDBACK_QUEUE_STORAGE_KEY = "feedbackQueue";
const LEGACY_FEEDBACK_QUEUE_STORAGE_KEY = "feedbackSyncQueue";
const VECTOR_HISTORY_STORAGE_KEY = "vectorHistory";
const TWEET_VECTOR_SESSION_STORAGE_KEY = "tweetVectors";
const FEEDBACK_RETRY_ALARM_NAME = "feedbackRetry";
const MAX_FEEDBACK_QUEUE_SIZE = 150;
const MAX_VECTOR_HISTORY_SIZE = 100;
const MAX_TWEET_VECTOR_CACHE_SIZE = 200;

const analyzedTweetVectors = new Map<string, PoliticalVectorPayload>();
let hasHydratedTweetVectorCache = false;
let isSyncingFeedbackQueue = false;

const getStoredUserProfile = async (): Promise<UserProfile> => {
  const stored = (await chrome.storage.local.get(["userVector", "decisionConfig"])) as {
    userVector?: {
      social?: number;
      economic?: number;
      populist?: number;
    };
    decisionConfig?: UserProfile["decisionConfig"];
  };

  const baseProfile: UserProfile = {
    userVector: {
      social: stored.userVector?.social ?? 0,
      economic: stored.userVector?.economic ?? 0,
      populist: stored.userVector?.populist ?? 0,
    },
  };

  if (stored.decisionConfig) {
    return {
      ...baseProfile,
      decisionConfig: stored.decisionConfig,
    };
  }

  return baseProfile;
};

const toStoredVector = (vector: PoliticalVectorPayload): StoredUserVector => ({
  social: vector.social,
  economic: vector.economic,
  populist: vector.populist,
  x: vector.social,
  y: vector.economic,
});

const getFeedbackQueue = async (): Promise<FeedbackEvent[]> => {
  const stored = (await chrome.storage.local.get([
    FEEDBACK_QUEUE_STORAGE_KEY,
    LEGACY_FEEDBACK_QUEUE_STORAGE_KEY,
  ])) as {
    feedbackQueue?: FeedbackEvent[];
    feedbackSyncQueue?: FeedbackEvent[];
  };

  if (Array.isArray(stored.feedbackQueue)) {
    return stored.feedbackQueue;
  }

  if (Array.isArray(stored.feedbackSyncQueue) && stored.feedbackSyncQueue.length > 0) {
    const migratedQueue = stored.feedbackSyncQueue.slice(-MAX_FEEDBACK_QUEUE_SIZE);
    await chrome.storage.local.set({ [FEEDBACK_QUEUE_STORAGE_KEY]: migratedQueue });
    await chrome.storage.local.remove(LEGACY_FEEDBACK_QUEUE_STORAGE_KEY);
    return migratedQueue;
  }

  return [];
};

const storeFeedbackQueue = async (queue: FeedbackEvent[]): Promise<void> => {
  const bounded = queue.slice(-MAX_FEEDBACK_QUEUE_SIZE);
  await chrome.storage.local.set({ [FEEDBACK_QUEUE_STORAGE_KEY]: bounded });
};

const getVectorHistory = async (): Promise<FeedbackEvent[]> => {
  const stored = (await chrome.storage.local.get(VECTOR_HISTORY_STORAGE_KEY)) as {
    vectorHistory?: FeedbackEvent[];
  };

  return Array.isArray(stored.vectorHistory) ? stored.vectorHistory : [];
};

const appendVectorHistory = async (event: FeedbackEvent): Promise<void> => {
  const history = await getVectorHistory();
  history.push(event);
  await chrome.storage.local.set({
    [VECTOR_HISTORY_STORAGE_KEY]: history.slice(-MAX_VECTOR_HISTORY_SIZE),
  });
};

const updateHistorySyncAttempts = async (remainingQueue: FeedbackEvent[]): Promise<void> => {
  const history = await getVectorHistory();
  if (history.length === 0) {
    return;
  }

  const remainingById = new Map(remainingQueue.map((event) => [event.id, event]));
  const nextHistory = history.map((event) => {
    const queued = remainingById.get(event.id);
    if (!queued) {
      return {
        ...event,
        syncAttempts: event.syncAttempts,
        syncedAt: event.syncedAt ?? new Date().toISOString(),
      };
    }

    return {
      ...event,
      syncAttempts: queued.syncAttempts,
    };
  });

  await chrome.storage.local.set({ [VECTOR_HISTORY_STORAGE_KEY]: nextHistory });
};

const getStoredTweetVectors = async (): Promise<Record<string, PoliticalVectorPayload>> => {
  const stored = (await chrome.storage.session.get(TWEET_VECTOR_SESSION_STORAGE_KEY)) as {
    tweetVectors?: Record<string, PoliticalVectorPayload>;
  };

  return stored.tweetVectors ?? {};
};

const syncTweetVectorsToSessionStorage = async (): Promise<void> => {
  const entries = Array.from(analyzedTweetVectors.entries());
  const boundedEntries = entries.slice(-MAX_TWEET_VECTOR_CACHE_SIZE);
  await chrome.storage.session.set({
    [TWEET_VECTOR_SESSION_STORAGE_KEY]: Object.fromEntries(boundedEntries),
  });
};

const hydrateTweetVectorCache = async (): Promise<void> => {
  if (hasHydratedTweetVectorCache) {
    return;
  }

  const storedVectors = await getStoredTweetVectors();
  const entries = Object.entries(storedVectors);
  analyzedTweetVectors.clear();

  for (const [tweetId, vector] of entries.slice(-MAX_TWEET_VECTOR_CACHE_SIZE)) {
    analyzedTweetVectors.set(tweetId, vector);
  }

  hasHydratedTweetVectorCache = true;
};

const cacheTweetVector = async (tweetId: string, vector: PoliticalVectorPayload): Promise<void> => {
  await hydrateTweetVectorCache();

  analyzedTweetVectors.delete(tweetId);
  analyzedTweetVectors.set(tweetId, vector);

  while (analyzedTweetVectors.size > MAX_TWEET_VECTOR_CACHE_SIZE) {
    const oldest = analyzedTweetVectors.keys().next().value;
    if (typeof oldest === "string") {
      analyzedTweetVectors.delete(oldest);
    }
  }

  const storedVectors = await getStoredTweetVectors();
  const merged = {
    ...storedVectors,
    [tweetId]: vector,
  };
  const boundedEntries = Object.entries(merged).slice(-MAX_TWEET_VECTOR_CACHE_SIZE);
  await chrome.storage.session.set({
    [TWEET_VECTOR_SESSION_STORAGE_KEY]: Object.fromEntries(boundedEntries),
  });
};

const getCachedTweetVector = async (
  tweetId: string
): Promise<PoliticalVectorPayload | undefined> => {
  await hydrateTweetVectorCache();

  const cached = analyzedTweetVectors.get(tweetId);
  if (cached) {
    return cached;
  }

  const storedVectors = await getStoredTweetVectors();
  const storedVector = storedVectors[tweetId];
  if (!storedVector) {
    return undefined;
  }

  analyzedTweetVectors.set(tweetId, storedVector);
  while (analyzedTweetVectors.size > MAX_TWEET_VECTOR_CACHE_SIZE) {
    const oldest = analyzedTweetVectors.keys().next().value;
    if (typeof oldest === "string") {
      analyzedTweetVectors.delete(oldest);
    }
  }
  await syncTweetVectorsToSessionStorage();

  return storedVector;
};

const buildFeedbackHeaders = async (): Promise<Record<string, string>> => {
  const storage = await chrome.storage.local.get(["apiKey", "authToken", "accessToken"]);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const apiKey = typeof storage.apiKey === "string" ? storage.apiKey.trim() : "";
  if (apiKey.length > 0) {
    headers["X-API-Key"] = apiKey;
  }

  const rawToken =
    typeof storage.authToken === "string"
      ? storage.authToken
      : typeof storage.accessToken === "string"
        ? storage.accessToken
        : "";
  const token = rawToken.trim().replace(/^Bearer\s+/i, "");
  if (token.length > 0) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
};

const syncFeedbackQueue = async (): Promise<void> => {
  if (isSyncingFeedbackQueue) {
    return;
  }

  isSyncingFeedbackQueue = true;

  const queue = await getFeedbackQueue();
  if (queue.length === 0) {
    isSyncingFeedbackQueue = false;
    return;
  }

  const backendUrl = ((await chrome.storage.local.get("backendUrl")).backendUrl ??
    "http://localhost:3001") as string;
  const headers = await buildFeedbackHeaders();
  const remaining: FeedbackEvent[] = [];

  try {
    for (const event of queue) {
      try {
        const response = await fetch(`${backendUrl}/api/feedback`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            id: event.id,
            tweetId: event.tweetId,
            feedback: event.feedback,
            timestamp: event.timestamp,
            tweetVector: event.tweetVector,
            beforeVector: event.beforeVector,
            afterVector: event.afterVector,
            delta: event.delta,
          }),
        });

        if (!response.ok) {
          remaining.push({
            ...event,
            syncAttempts: event.syncAttempts + 1,
          });
          continue;
        }
      } catch {
        remaining.push({
          ...event,
          syncAttempts: event.syncAttempts + 1,
        });
      }
    }

    await storeFeedbackQueue(remaining);
    await updateHistorySyncAttempts(remaining);
  } finally {
    isSyncingFeedbackQueue = false;
  }
};

const ensureFeedbackRetryAlarm = async (): Promise<void> => {
  await chrome.alarms.create(FEEDBACK_RETRY_ALARM_NAME, {
    periodInMinutes: 5,
  });
};

const initializeServiceWorkerState = async (): Promise<void> => {
  await loadPipelineConfig();
  await hydrateTweetVectorCache();
  await syncFeedbackQueue();
  await ensureFeedbackRetryAlarm();
  await updateBadgeForAllTabs();
};

const applyFeedbackAndPersist = async (payload: {
  tweetId: string;
  feedback: FeedbackType;
  tweetVector: PoliticalVectorPayload;
  timestamp: string;
}): Promise<{ updatedVector: StoredUserVector }> => {
  const stored = (await chrome.storage.local.get("userVector")) as {
    userVector?: PoliticalVectorPayload;
  };

  const currentVector: PoliticalVectorPayload = {
    social: stored.userVector?.social ?? 0,
    economic: stored.userVector?.economic ?? 0,
    populist: stored.userVector?.populist ?? 0,
  };

  const drift = applyFeedbackDrift(currentVector, payload.tweetVector, payload.feedback);
  const updatedVector = toStoredVector(drift.after);

  const feedbackEvent: FeedbackEvent = {
    id: `${payload.tweetId}-${payload.feedback}-${payload.timestamp}`,
    tweetId: payload.tweetId,
    feedback: payload.feedback,
    timestamp: payload.timestamp,
    tweetVector: payload.tweetVector,
    beforeVector: drift.before,
    afterVector: drift.after,
    delta: drift.appliedDelta,
    syncAttempts: 0,
  };

  await chrome.storage.local.set({ userVector: updatedVector });
  await appendVectorHistory(feedbackEvent);

  const queue = await getFeedbackQueue();
  queue.push(feedbackEvent);
  await storeFeedbackQueue(queue);
  await syncFeedbackQueue();

  return { updatedVector };
};

const PIPELINE_POLITICAL_TERMS = [
  "election",
  "vote",
  "democrat",
  "republican",
  "congress",
  "senate",
  "president",
  "policy",
  "legislation",
  "partisan",
  "liberal",
  "conservative",
  "immigration",
  "immigrant",
  "abortion",
  "gun control",
  "climate change",
  "tax",
  "supreme court",
  "amendment",
  "campaign",
  "ballot",
  "governor",
  "socialism",
  "capitalism",
  "fascism",
  "communism",
  "democracy",
  "ice agent",
  "deport",
  "border",
  "race",
  "racist",
  "racial",
  "violent",
  "violence",
  "protest",
  "radical",
  "socialist",
  "corrupt",
  "revolution",
  "political",
  "disproportionate",
  "police state",
  "citizen",
  "warrant",
  "sex offender",
  "illegally",
  "traditional values",
  "mainstream media",
  "establishment",
];

const builtinKeywordFilter = (
  text: string,
  sensitivity: "low" | "medium" | "high"
): { isPolitical: boolean; matchedKeywords: string[]; confidence: number } => {
  const lower = text.toLowerCase();
  const matched = PIPELINE_POLITICAL_TERMS.filter((term) => lower.includes(term));
  const threshold = sensitivity === "high" ? 1 : sensitivity === "low" ? 3 : 2;
  return {
    isPolitical: matched.length >= threshold,
    matchedKeywords: matched,
    confidence: Math.min(1, matched.length * 0.2),
  };
};

let pipelineConfig: PipelineConfig = {
  maxConcurrency: 5,
  backendUrl: "http://localhost:3001",
  backendTimeoutMs: 30_000,
  politicalSensitivity: "medium",
};

const loadPipelineConfig = async (): Promise<void> => {
  const stored = (await chrome.storage.local.get(["backendUrl", "sensitivity"])) as {
    backendUrl?: string;
    sensitivity?: string;
  };

  pipelineConfig = {
    ...pipelineConfig,
    backendUrl: stored.backendUrl ?? pipelineConfig.backendUrl,
    politicalSensitivity:
      stored.sensitivity === "low" || stored.sensitivity === "high" ? stored.sensitivity : "medium",
  };
};

const pipeline = new PipelineOrchestrator({
  getConfig: () => pipelineConfig,
  getUserProfile: () => getStoredUserProfile(),
  evaluateTweet: (analysis, profile) => decisionEngine.evaluateTweet(analysis, profile),
  keywordFilter: builtinKeywordFilter,
  sendInterventionToTab: async (tabId, payload) => {
    await sendInterventionTriggerToTab(tabId, {
      tweetId: payload.tweetId,
      level: payload.level as "none" | "low" | "medium" | "critical",
      reason: payload.reason,
      ...(payload.counterArgument ? { counterArgument: payload.counterArgument } : {}),
      ...(payload.logicFailure ? { logicFailure: payload.logicFailure } : {}),
      ...(payload.claim ? { claim: payload.claim } : {}),
      ...(payload.mechanism ? { mechanism: payload.mechanism } : {}),
      ...(payload.dataCheck ? { dataCheck: payload.dataCheck } : {}),
      ...(payload.socraticChallenge ? { socraticChallenge: payload.socraticChallenge } : {}),
      ...(payload.tweetVector ? { tweetVector: payload.tweetVector } : {}),
    });
  },
  isExtensionActiveOnUrl: async (url) => {
    const config = await siteConfigStorage.getConfig();
    return isExtensionActiveOnUrl(url, config);
  },
  fetchBackendAnalysis: createBackendFetcher(
    () => pipelineConfig.backendUrl,
    () => buildFeedbackHeaders(),
    pipelineConfig.backendTimeoutMs
  ),
});

const routeMessage = async (
  message: ExtensionMessage,
  sender: chrome.runtime.MessageSender
): Promise<MessageAck<unknown>> => {
  switch (message.type) {
    case MESSAGE_TYPES.TWEET_DETECTED: {
      void logger.info("Tweet detected", message.payload.tweetId);

      if (!sender.tab?.id) {
        return ok();
      }

      const tabUrl = sender.tab.url;
      void pipeline
        .processTweet({
          tweetId: message.payload.tweetId,
          tweetText: message.payload.tweetText,
          authorHandle: message.payload.authorHandle,
          timestamp: message.payload.timestamp,
          tabId: sender.tab.id,
          ...(tabUrl ? { tabUrl } : {}),
        })
        .then((result) => {
          void logger.info("Pipeline", result.tweetId, "stage:", result.stage, result.error ?? "");
        });

      return ok();
    }

    case MESSAGE_TYPES.ANALYZE_RESULT: {
      void logger.info("Analyze result received", message.payload.tweetId);

      if (!sender.tab?.id) {
        return ok();
      }

      const tweetAnalysis: TweetAnalysis = {
        tweetId: message.payload.tweetId,
        topic: message.payload.topic,
        confidence: message.payload.confidence,
        tweetVector: message.payload.tweetVector,
        fallacies: message.payload.fallacies,
      };

      await cacheTweetVector(message.payload.tweetId, message.payload.tweetVector);

      if (sender.tab.url) {
        const currentConfig = await siteConfigStorage.getConfig();
        if (!isExtensionActiveOnUrl(sender.tab.url, currentConfig)) {
          void logger.info("Intervention blocked: site or extension disabled");
          return ok();
        }
      }

      const userProfile = await getStoredUserProfile();
      const decision = decisionEngine.evaluateTweet(tweetAnalysis, userProfile);

      void logger.debug("[DecisionTree]", decision.log.tree, decision.log.fields);

      if (!decision.shouldIntervene) {
        return ok();
      }

      try {
        await sendInterventionTriggerToTab(
          sender.tab.id,
          {
            tweetId: message.payload.tweetId,
            level: decision.level,
            reason: decision.action,
            tweetVector: message.payload.tweetVector,
          },
          message.id
        );
      } catch (error) {
        const details = error instanceof Error ? error.message : String(error);
        return fail(details, true);
      }

      return ok();
    }

    case MESSAGE_TYPES.FEEDBACK_SUBMITTED: {
      void logger.info("Feedback submitted", message.payload.tweetId, message.payload.feedback);

      const tweetVector =
        message.payload.tweetVector ?? (await getCachedTweetVector(message.payload.tweetId));

      if (!tweetVector) {
        return fail(`Missing tweet vector for feedback on ${message.payload.tweetId}`, true);
      }

      const { updatedVector } = await applyFeedbackAndPersist({
        tweetId: message.payload.tweetId,
        feedback: message.payload.feedback,
        timestamp: message.payload.timestamp,
        tweetVector,
      });

      return {
        ok: true,
        payload: {
          updatedVector,
        },
      };
    }

    case MESSAGE_TYPES.SETTINGS_UPDATED:
      await chrome.storage.local.set({
        isEnabled: message.payload.isEnabled,
        sensitivity: message.payload.sensitivity,
      });
      return ok();

    case MESSAGE_TYPES.QUIZ_COMPLETED:
      await chrome.storage.local.set({
        userVector: {
          x: message.payload.social,
          y: message.payload.economic,
          social: message.payload.social,
          economic: message.payload.economic,
          populist: message.payload.populist,
        },
      });
      return ok();

    case MESSAGE_TYPES.INTERVENTION_TRIGGER:
      return ok();

    case MESSAGE_TYPES.LLM_CONFIG_UPDATED: {
      void logger.info("LLM config updated", message.payload.provider);
      await storeLlmConfig({
        provider: message.payload.provider,
        model: message.payload.model,
        apiKey: message.payload.apiKey,
        customBaseUrl: message.payload.customBaseUrl,
        useFallback: message.payload.useFallback,
      });
      return ok();
    }

    case MESSAGE_TYPES.LLM_CONNECTION_TEST: {
      void logger.info("LLM connection test", message.payload.provider);
      const { provider, apiKey, customBaseUrl } = message.payload;
      const start = Date.now();
      try {
        if (provider === "internal") {
          return {
            ok: true,
            payload: { success: true, message: "Internal API is always available", latencyMs: 0 },
          };
        }
        if (provider === "custom") {
          if (!customBaseUrl) {
            return {
              ok: true,
              payload: { success: false, message: "Custom base URL is required", latencyMs: 0 },
            };
          }
        }
        const baseUrlMap: Record<string, string> = {
          openai: "https://api.openai.com/v1",
          anthropic: "https://api.anthropic.com/v1",
          perplexity: "https://api.perplexity.ai/v1",
          google: "https://generativelanguage.googleapis.com/v1",
        };
        const baseUrl = provider === "custom" ? customBaseUrl! : (baseUrlMap[provider] ?? "");
        const response = await fetch(`${baseUrl}/models`, {
          method: "GET",
          headers: { Authorization: `Bearer ${apiKey ?? ""}` },
        });
        const latencyMs = Date.now() - start;
        if (!response.ok) {
          let errorMessage = `HTTP ${response.status}`;
          try {
            const body = (await response.json()) as { error?: { message?: string } };
            if (body?.error?.message) errorMessage = body.error.message;
          } catch {
            // ignore parse failure
          }
          const connectionStatus: LlmConnectionStatus = {
            status: "failed",
            message: errorMessage,
            lastTested: new Date(),
          };
          await setLlmConnectionStatus(connectionStatus);
          return {
            ok: true,
            payload: { success: false, message: errorMessage, latencyMs },
          };
        }
        const successStatus: LlmConnectionStatus = {
          status: "connected",
          message: "Successfully connected",
          lastTested: new Date(),
        };
        await setLlmConnectionStatus(successStatus);
        return {
          ok: true,
          payload: { success: true, message: "Successfully connected", latencyMs },
        };
      } catch (err) {
        const latencyMs = Date.now() - start;
        const errorMessage = err instanceof Error ? err.message : "Connection failed";
        return {
          ok: true,
          payload: { success: false, message: errorMessage, latencyMs },
        };
      }
    }

    case MESSAGE_TYPES.LLM_CREDENTIALS_CLEARED: {
      void logger.info("LLM credentials cleared");
      await clearLlmCredentials();
      await storeLlmConfig({
        provider: "internal",
        model: "",
        apiKey: undefined,
        customBaseUrl: undefined,
        useFallback: true,
      });
      return ok();
    }

    case MESSAGE_TYPES.SITE_CONFIG_UPDATED: {
      void logger.info("Site config updated", message.payload.siteId, message.payload.enabled);
      const current = await siteConfigStorage.getConfig();
      const siteId = message.payload.siteId as SupportedSite;
      const updated = updateSiteEnabled(current, siteId, message.payload.enabled);
      await siteConfigStorage.setConfig(updated);
      await updateBadgeForAllTabs();
      return ok();
    }

    case MESSAGE_TYPES.SITE_CONFIG_REQUEST: {
      const config = await siteConfigStorage.getConfig();
      return {
        ok: true,
        payload: { config },
      };
    }

    case MESSAGE_TYPES.GLOBAL_PAUSE_TOGGLED: {
      void logger.info("Global pause toggled", message.payload.paused);
      const current = await siteConfigStorage.getConfig();
      const updated = toggleGlobalEnabled({ ...current, globalEnabled: !message.payload.paused });
      await siteConfigStorage.setConfig(updated);
      await updateBadgeForAllTabs();
      return ok();
    }

    default:
      return fail(`Unhandled message type: ${(message as { type: string }).type}`);
  }
};

chrome.runtime.onInstalled.addListener(async (details) => {
  void logger.info("Extension installed", details.reason);

  if (details.reason === "install") {
    await chrome.storage.local.set({ isFirstInstall: true });

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.sidePanel.open({ tabId: tabs[0].id }).catch((error) => {
          void logger.info("Could not auto-open side panel:", error);
        });
      }
    });
  }

  await initializeSiteConfig();
  await initializeServiceWorkerState();
  await clearLegacyLlmStorageKeys();
});

chrome.runtime.onStartup.addListener(async () => {
  void logger.info("Extension startup");
  await ensureFeedbackRetryAlarm();
  await initializeServiceWorkerState();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== FEEDBACK_RETRY_ALARM_NAME) {
    return;
  }

  void syncFeedbackQueue();
});

void initializeServiceWorkerState();

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") {
    return;
  }

  const settingsKeys = ["backendUrl", "sensitivity", "isEnabled"];
  const hasRelevantChange = settingsKeys.some((key) => key in changes);

  if (hasRelevantChange) {
    void logger.info("Settings changed, reloading pipeline config");
    void loadPipelineConfig();
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url && tab.url) {
    void updateBadgeForTab(tabId, tab.url);
  }
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await chrome.tabs.get(activeInfo.tabId);
  if (tab.url) {
    await updateBadgeForTab(activeInfo.tabId, tab.url);
  }
});

chrome.runtime.onMessage.addListener((incomingMessage, sender, sendResponse) => {
  if (!isExtensionMessage(incomingMessage)) {
    sendResponse(fail("Invalid message envelope", false));
    return false;
  }

  void routeMessage(incomingMessage, sender)
    .then((response) => {
      sendResponse(response);
    })
    .catch((error: unknown) => {
      Sentry.captureException(error);
      const details = error instanceof Error ? error.message : String(error);
      sendResponse(fail(details, true));
    });

  return true;
});

void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });

export {};
