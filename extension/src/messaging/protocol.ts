import type { TweetScrapePayload } from "../content/content-script.js";

export const MESSAGE_TYPES = {
  TWEET_DETECTED: "TWEET_DETECTED",
  ANALYZE_RESULT: "ANALYZE_RESULT",
  INTERVENTION_TRIGGER: "INTERVENTION_TRIGGER",
  FEEDBACK_SUBMITTED: "FEEDBACK_SUBMITTED",
  SETTINGS_UPDATED: "SETTINGS_UPDATED",
  QUIZ_COMPLETED: "QUIZ_COMPLETED",
  LLM_CONFIG_UPDATED: "LLM_CONFIG_UPDATED",
  LLM_CONNECTION_TEST: "LLM_CONNECTION_TEST",
  LLM_CREDENTIALS_CLEARED: "LLM_CREDENTIALS_CLEARED",
  SITE_CONFIG_UPDATED: "SITE_CONFIG_UPDATED",
  SITE_CONFIG_REQUEST: "SITE_CONFIG_REQUEST",
  SITE_CONFIG_RESPONSE: "SITE_CONFIG_RESPONSE",
  GLOBAL_PAUSE_TOGGLED: "GLOBAL_PAUSE_TOGGLED",
} as const;

export type MessageType = (typeof MESSAGE_TYPES)[keyof typeof MESSAGE_TYPES];

export type MessageEnvelope<TType extends MessageType, TPayload> = {
  type: TType;
  payload: TPayload;
  id: string;
};

export type InterventionLevel = "none" | "low" | "medium" | "critical";

export type PoliticalVectorPayload = {
  social: number;
  economic: number;
  populist: number;
};

export type AnalyzeResultPayload = {
  tweetId: string;
  topic: string;
  confidence: number;
  tweetVector: PoliticalVectorPayload;
  fallacies: string[];
  level?: InterventionLevel;
};

export type InterventionTriggerPayload = {
  tweetId: string;
  level: InterventionLevel;
  reason: string;
};

export type FeedbackSubmittedPayload = {
  tweetId: string;
  feedback: "acknowledged" | "agreed" | "dismissed";
};

export type SettingsUpdatedPayload = {
  isEnabled: boolean;
  sensitivity: "low" | "medium" | "high";
};

export type QuizCompletedPayload = {
  social: number;
  economic: number;
  populist: number;
};

export type TweetDetectedMessage = MessageEnvelope<
  typeof MESSAGE_TYPES.TWEET_DETECTED,
  TweetScrapePayload
>;

export type AnalyzeResultMessage = MessageEnvelope<
  typeof MESSAGE_TYPES.ANALYZE_RESULT,
  AnalyzeResultPayload
>;

export type InterventionTriggerMessage = MessageEnvelope<
  typeof MESSAGE_TYPES.INTERVENTION_TRIGGER,
  InterventionTriggerPayload
>;

export type FeedbackSubmittedMessage = MessageEnvelope<
  typeof MESSAGE_TYPES.FEEDBACK_SUBMITTED,
  FeedbackSubmittedPayload
>;

export type SettingsUpdatedMessage = MessageEnvelope<
  typeof MESSAGE_TYPES.SETTINGS_UPDATED,
  SettingsUpdatedPayload
>;

export type QuizCompletedMessage = MessageEnvelope<
  typeof MESSAGE_TYPES.QUIZ_COMPLETED,
  QuizCompletedPayload
>;

export type LlmProvider = "openai" | "anthropic" | "perplexity" | "google" | "custom" | "internal";

export type LlmConfigPayload = {
  provider: LlmProvider;
  model: string;
  apiKey: string | undefined;
  customBaseUrl: string | undefined;
  useFallback: boolean;
};

export type LlmConnectionTestPayload = {
  provider: LlmProvider;
  model: string;
  apiKey: string | undefined;
  customBaseUrl: string | undefined;
};

export type LlmConnectionTestResult = {
  success: boolean;
  message: string;
  latencyMs: number;
};

export type LlmCredentialsClearedPayload = Record<string, never>;

export type SiteConfigUpdatedPayload = {
  siteId: "twitter" | "reddit" | "facebook" | "youtube";
  enabled: boolean;
};

export type SiteConfigRequestPayload = Record<string, never>;

export type SiteConfigResponsePayload = {
  config: {
    sites: Record<
      string,
      {
        id: string;
        name: string;
        enabled: boolean;
        urlPatterns: string[];
        description: string;
      }
    >;
    globalEnabled: boolean;
    lastUpdated: string;
  };
};

export type GlobalPauseToggledPayload = {
  paused: boolean;
};

export type LlmConfigUpdatedMessage = MessageEnvelope<
  typeof MESSAGE_TYPES.LLM_CONFIG_UPDATED,
  LlmConfigPayload
>;

export type LlmConnectionTestMessage = MessageEnvelope<
  typeof MESSAGE_TYPES.LLM_CONNECTION_TEST,
  LlmConnectionTestPayload
>;

export type LlmCredentialsClearedMessage = MessageEnvelope<
  typeof MESSAGE_TYPES.LLM_CREDENTIALS_CLEARED,
  LlmCredentialsClearedPayload
>;

export type SiteConfigUpdatedMessage = MessageEnvelope<
  typeof MESSAGE_TYPES.SITE_CONFIG_UPDATED,
  SiteConfigUpdatedPayload
>;

export type SiteConfigRequestMessage = MessageEnvelope<
  typeof MESSAGE_TYPES.SITE_CONFIG_REQUEST,
  SiteConfigRequestPayload
>;

export type SiteConfigResponseMessage = MessageEnvelope<
  typeof MESSAGE_TYPES.SITE_CONFIG_RESPONSE,
  SiteConfigResponsePayload
>;

export type GlobalPauseToggledMessage = MessageEnvelope<
  typeof MESSAGE_TYPES.GLOBAL_PAUSE_TOGGLED,
  GlobalPauseToggledPayload
>;

export type ExtensionMessage =
  | TweetDetectedMessage
  | AnalyzeResultMessage
  | InterventionTriggerMessage
  | FeedbackSubmittedMessage
  | SettingsUpdatedMessage
  | QuizCompletedMessage
  | LlmConfigUpdatedMessage
  | LlmConnectionTestMessage
  | LlmCredentialsClearedMessage
  | SiteConfigUpdatedMessage
  | SiteConfigRequestMessage
  | SiteConfigResponseMessage
  | GlobalPauseToggledMessage;

export type MessageAck<TPayload = undefined> =
  | {
      ok: true;
      payload: TPayload;
    }
  | {
      ok: false;
      error: string;
      retriable?: boolean;
    };

export const isMessageType = (value: unknown): value is MessageType => {
  return typeof value === "string" && Object.values(MESSAGE_TYPES).includes(value as MessageType);
};

export const isExtensionMessage = (value: unknown): value is ExtensionMessage => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const maybeMessage = value as Partial<ExtensionMessage>;

  if (!isMessageType(maybeMessage.type)) {
    return false;
  }

  if (typeof maybeMessage.id !== "string" || maybeMessage.id.length === 0) {
    return false;
  }

  return "payload" in maybeMessage;
};

export const createMessageEnvelope = <TType extends MessageType, TPayload>(
  type: TType,
  payload: TPayload,
  id?: string
): MessageEnvelope<TType, TPayload> => {
  const resolvedId =
    id ??
    (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

  return {
    type,
    payload,
    id: resolvedId,
  };
};
