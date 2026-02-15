import {
  createMessageEnvelope,
  MESSAGE_TYPES,
  type ExtensionMessage,
  type GlobalPauseToggledPayload,
  type InterventionTriggerPayload,
  type LlmConfigPayload,
  type LlmConnectionTestPayload,
  type LlmConnectionTestResult,
  type LlmCredentialsClearedPayload,
  type MessageAck,
  type MessageEnvelope,
  type MessageType,
  type QuizCompletedPayload,
  type SettingsUpdatedPayload,
  type SiteConfigRequestPayload,
  type SiteConfigResponsePayload,
  type SiteConfigUpdatedPayload,
} from "./protocol.js";
import type { TweetScrapePayload } from "../content/content-script.js";

type RetryOptions = {
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
};

const DEFAULT_TIMEOUT_MS = 500;
const DEFAULT_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 100;

type RuntimeSender = (message: ExtensionMessage, callback: (response: unknown) => void) => void;

const isRetriableError = (error: string): boolean => {
  const normalized = error.toLowerCase();
  return (
    normalized.includes("receiving end does not exist") ||
    normalized.includes("message port closed") ||
    normalized.includes("could not establish connection") ||
    normalized.includes("timed out")
  );
};

const wait = (ms: number): Promise<void> => {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
};

const callSenderWithTimeout = <TResponse>(
  sender: RuntimeSender,
  message: ExtensionMessage,
  timeoutMs: number
): Promise<TResponse> => {
  return new Promise((resolve, reject) => {
    let done = false;
    const timeout = globalThis.setTimeout(() => {
      if (done) {
        return;
      }

      done = true;
      reject(new Error(`Message ${message.type} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    const finish = (handler: () => void): void => {
      if (done) {
        return;
      }

      done = true;
      globalThis.clearTimeout(timeout);
      handler();
    };

    try {
      sender(message, (response) => {
        finish(() => {
          const runtimeError = chrome.runtime.lastError?.message;

          if (runtimeError) {
            reject(new Error(runtimeError));
            return;
          }

          resolve(response as TResponse);
        });
      });
    } catch (error) {
      finish(() => {
        reject(error instanceof Error ? error : new Error(String(error)));
      });
    }
  });
};

const sendWithRetry = async <TResponse>(
  sender: RuntimeSender,
  message: ExtensionMessage,
  options?: RetryOptions
): Promise<TResponse> => {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = options?.retries ?? DEFAULT_RETRIES;
  const retryDelayMs = options?.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;

  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt <= retries) {
    try {
      return await callSenderWithTimeout<TResponse>(sender, message, timeoutMs);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const retryable = isRetriableError(lastError.message);

      if (!retryable || attempt === retries) {
        throw lastError;
      }

      attempt += 1;
      await wait(retryDelayMs * attempt);
    }
  }

  throw lastError ?? new Error("Unknown messaging error");
};

export const sendRuntimeRequest = <
  TType extends MessageType,
  TPayload,
  TResponse = MessageAck<void>,
>(
  type: TType,
  payload: TPayload,
  options?: RetryOptions
): Promise<TResponse> => {
  const message = createMessageEnvelope(type, payload) as ExtensionMessage;

  return sendWithRetry<TResponse>(
    (nextMessage, callback) => {
      chrome.runtime.sendMessage(nextMessage, callback);
    },
    message,
    options
  );
};

export const sendTabRequest = <TType extends MessageType, TPayload, TResponse = MessageAck<void>>(
  tabId: number,
  type: TType,
  payload: TPayload,
  options?: RetryOptions
): Promise<TResponse> => {
  const message = createMessageEnvelope(type, payload) as ExtensionMessage;

  return sendWithRetry<TResponse>(
    (nextMessage, callback) => {
      chrome.tabs.sendMessage(tabId, nextMessage, callback);
    },
    message,
    options
  );
};

export const sendTweetDetected = (
  payload: TweetScrapePayload,
  options?: RetryOptions
): Promise<MessageAck<void>> => {
  return sendRuntimeRequest(MESSAGE_TYPES.TWEET_DETECTED, payload, options);
};

export const sendSettingsUpdated = (
  payload: SettingsUpdatedPayload,
  options?: RetryOptions
): Promise<MessageAck<void>> => {
  return sendRuntimeRequest(MESSAGE_TYPES.SETTINGS_UPDATED, payload, options);
};

export const sendQuizCompleted = (
  payload: QuizCompletedPayload,
  options?: RetryOptions
): Promise<MessageAck<void>> => {
  return sendRuntimeRequest(MESSAGE_TYPES.QUIZ_COMPLETED, payload, options);
};

export const sendInterventionTriggerToTab = (
  tabId: number,
  payload: InterventionTriggerPayload,
  id?: string,
  options?: RetryOptions
): Promise<MessageAck<void>> => {
  const message: MessageEnvelope<
    typeof MESSAGE_TYPES.INTERVENTION_TRIGGER,
    InterventionTriggerPayload
  > = createMessageEnvelope(MESSAGE_TYPES.INTERVENTION_TRIGGER, payload, id);

  return sendWithRetry<MessageAck<void>>(
    (nextMessage, callback) => {
      chrome.tabs.sendMessage(tabId, nextMessage, callback);
    },
    message,
    options
  );
};

export const sendLlmConfigUpdated = (
  payload: LlmConfigPayload,
  options?: RetryOptions
): Promise<MessageAck<void>> => {
  return sendRuntimeRequest(MESSAGE_TYPES.LLM_CONFIG_UPDATED, payload, options);
};

export const sendLlmConnectionTest = (
  payload: LlmConnectionTestPayload,
  options?: RetryOptions
): Promise<MessageAck<LlmConnectionTestResult>> => {
  return sendRuntimeRequest<
    typeof MESSAGE_TYPES.LLM_CONNECTION_TEST,
    LlmConnectionTestPayload,
    MessageAck<LlmConnectionTestResult>
  >(MESSAGE_TYPES.LLM_CONNECTION_TEST, payload, options);
};

export const sendLlmCredentialsCleared = (options?: RetryOptions): Promise<MessageAck<void>> => {
  return sendRuntimeRequest(
    MESSAGE_TYPES.LLM_CREDENTIALS_CLEARED,
    {} as LlmCredentialsClearedPayload,
    options
  );
};

export const sendSiteConfigUpdated = (
  payload: SiteConfigUpdatedPayload,
  options?: RetryOptions
): Promise<MessageAck<void>> => {
  return sendRuntimeRequest(MESSAGE_TYPES.SITE_CONFIG_UPDATED, payload, options);
};

export const sendSiteConfigRequest = (
  options?: RetryOptions
): Promise<MessageAck<SiteConfigResponsePayload>> => {
  return sendRuntimeRequest<
    typeof MESSAGE_TYPES.SITE_CONFIG_REQUEST,
    SiteConfigRequestPayload,
    MessageAck<SiteConfigResponsePayload>
  >(MESSAGE_TYPES.SITE_CONFIG_REQUEST, {} as SiteConfigRequestPayload, options);
};

export const sendGlobalPauseToggled = (
  payload: GlobalPauseToggledPayload,
  options?: RetryOptions
): Promise<MessageAck<void>> => {
  return sendRuntimeRequest(MESSAGE_TYPES.GLOBAL_PAUSE_TOGGLED, payload, options);
};
