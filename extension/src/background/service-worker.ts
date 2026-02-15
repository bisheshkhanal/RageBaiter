import {
  MESSAGE_TYPES,
  isExtensionMessage,
  type ExtensionMessage,
  type LlmConnectionTestPayload,
  type LlmConnectionTestResult,
  type MessageAck,
} from "../messaging/protocol.js";
import { sendInterventionTriggerToTab } from "../messaging/runtime.js";
import { createDecisionEngine, type TweetAnalysis, type UserProfile } from "./decision-engine.js";
import { clearLlmCredentials, storeLlmConfig } from "../lib/llm-config.js";
import { siteConfigStorage, initializeSiteConfig } from "../lib/site-storage.js";
import {
  isExtensionActiveOnUrl,
  updateSiteEnabled,
  toggleGlobalEnabled,
  type SupportedSite,
} from "../lib/site-config.js";

console.log("RageBaiter SW ready");

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

const testLlmConnection = async (
  payload: LlmConnectionTestPayload
): Promise<LlmConnectionTestResult> => {
  const startTime = Date.now();

  try {
    switch (payload.provider) {
      case "openai": {
        const response = await fetch("https://api.openai.com/v1/models", {
          method: "GET",
          headers: { Authorization: `Bearer ${payload.apiKey ?? ""}` },
        });
        if (!response.ok) {
          const errorData = (await response
            .json()
            .catch(() => ({ error: { message: "Unknown error" } }))) as {
            error?: { message?: string };
          };
          return {
            success: false,
            message: errorData.error?.message || `HTTP ${response.status}`,
            latencyMs: Date.now() - startTime,
          };
        }
        return {
          success: true,
          message: "Successfully connected to OpenAI API",
          latencyMs: Date.now() - startTime,
        };
      }
      case "anthropic": {
        const response = await fetch("https://api.anthropic.com/v1/models", {
          method: "GET",
          headers: { "x-api-key": payload.apiKey ?? "", "anthropic-version": "2023-06-01" },
        });
        if (!response.ok) {
          const errorData = (await response
            .json()
            .catch(() => ({ error: { message: "Unknown error" } }))) as {
            error?: { message?: string };
          };
          return {
            success: false,
            message: errorData.error?.message || `HTTP ${response.status}`,
            latencyMs: Date.now() - startTime,
          };
        }
        return {
          success: true,
          message: "Successfully connected to Anthropic API",
          latencyMs: Date.now() - startTime,
        };
      }
      case "google": {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${payload.apiKey ?? ""}`,
          { method: "GET" }
        );
        if (!response.ok) {
          const errorData = (await response
            .json()
            .catch(() => ({ error: { message: "Unknown error" } }))) as {
            error?: { message?: string };
          };
          return {
            success: false,
            message: errorData.error?.message || `HTTP ${response.status}`,
            latencyMs: Date.now() - startTime,
          };
        }
        return {
          success: true,
          message: "Successfully connected to Google AI Studio API",
          latencyMs: Date.now() - startTime,
        };
      }
      case "perplexity": {
        const response = await fetch("https://api.perplexity.ai/models", {
          method: "GET",
          headers: { Authorization: `Bearer ${payload.apiKey ?? ""}` },
        });
        if (!response.ok) {
          return {
            success: false,
            message: `HTTP ${response.status}: Perplexity API error`,
            latencyMs: Date.now() - startTime,
          };
        }
        return {
          success: true,
          message: "Successfully connected to Perplexity API",
          latencyMs: Date.now() - startTime,
        };
      }
      case "custom": {
        if (!payload.customBaseUrl) {
          return {
            success: false,
            message: "Custom base URL is required",
            latencyMs: Date.now() - startTime,
          };
        }
        const response = await fetch(`${payload.customBaseUrl}/models`, {
          method: "GET",
          headers: { Authorization: `Bearer ${payload.apiKey ?? ""}` },
        });
        if (!response.ok) {
          return {
            success: false,
            message: `HTTP ${response.status}: Custom endpoint error`,
            latencyMs: Date.now() - startTime,
          };
        }
        return {
          success: true,
          message: "Successfully connected to custom endpoint",
          latencyMs: Date.now() - startTime,
        };
      }
      default:
        return {
          success: false,
          message: `Provider ${payload.provider} not yet implemented`,
          latencyMs: Date.now() - startTime,
        };
    }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Connection failed",
      latencyMs: Date.now() - startTime,
    };
  }
};

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

const routeMessage = async (
  message: ExtensionMessage,
  sender: chrome.runtime.MessageSender
): Promise<MessageAck<unknown>> => {
  switch (message.type) {
    case MESSAGE_TYPES.TWEET_DETECTED: {
      console.log("[RageBaiter] Tweet detected", message.payload.tweetId);
      return ok();
    }

    case MESSAGE_TYPES.ANALYZE_RESULT: {
      console.log("[RageBaiter] Analyze result received", message.payload.tweetId);

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

      if (sender.tab.url) {
        const currentConfig = await siteConfigStorage.getConfig();
        if (!isExtensionActiveOnUrl(sender.tab.url, currentConfig)) {
          console.log("[RageBaiter] Intervention blocked: site or extension disabled");
          return ok();
        }
      }

      const userProfile = await getStoredUserProfile();
      const decision = decisionEngine.evaluateTweet(tweetAnalysis, userProfile);

      console.debug("[RageBaiter][DecisionTree]", decision.log.tree, decision.log.fields);

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
          },
          message.id
        );
      } catch (error) {
        const details = error instanceof Error ? error.message : String(error);
        return fail(details, true);
      }

      return ok();
    }

    case MESSAGE_TYPES.FEEDBACK_SUBMITTED:
      console.log(
        "[RageBaiter] Feedback submitted",
        message.payload.tweetId,
        message.payload.feedback
      );
      return ok();

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
      console.log("[RageBaiter] LLM config updated", message.payload.provider);
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
      console.log("[RageBaiter] Testing LLM connection", message.payload.provider);
      const result = await testLlmConnection(message.payload);
      return { ok: true, payload: result };
    }

    case MESSAGE_TYPES.LLM_CREDENTIALS_CLEARED: {
      console.log("[RageBaiter] LLM credentials cleared");
      await clearLlmCredentials();
      await chrome.storage.local.set({
        llmProvider: "internal",
        llmModel: "",
        llmUseFallback: true,
      });
      return ok();
    }

    case MESSAGE_TYPES.SITE_CONFIG_UPDATED: {
      console.log(
        "[RageBaiter] Site config updated",
        message.payload.siteId,
        message.payload.enabled
      );
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
      console.log("[RageBaiter] Global pause toggled", message.payload.paused);
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

chrome.runtime.onInstalled.addListener(async () => {
  console.log("[RageBaiter] Extension installed");
  await initializeSiteConfig();
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
    .catch((error) => {
      const details = error instanceof Error ? error.message : String(error);
      sendResponse(fail(details, true));
    });

  return true;
});

void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });

export {};
