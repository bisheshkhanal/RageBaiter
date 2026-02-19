export type LlmProvider = "internal";

export type LlmConfig = {
  provider: LlmProvider;
};

const STORAGE_KEYS = {
  LLM_PROVIDER: "llmProvider",
  LLM_MODEL: "llmModel",
  LLM_API_KEY: "llmApiKey",
  LLM_CUSTOM_URL: "llmCustomUrl",
  LLM_USE_FALLBACK: "llmUseFallback",
  LLM_USAGE_STATS: "llmUsageStats",
  LLM_CONNECTION_STATUS: "llmConnectionStatus",
} as const;

export const getDefaultLlmConfig = (): LlmConfig => {
  return {
    provider: "internal",
  };
};

export const clearLegacyLlmStorageKeys = async (): Promise<void> => {
  await chrome.storage.local.remove([
    STORAGE_KEYS.LLM_API_KEY,
    STORAGE_KEYS.LLM_PROVIDER,
    STORAGE_KEYS.LLM_MODEL,
    STORAGE_KEYS.LLM_CUSTOM_URL,
    STORAGE_KEYS.LLM_USE_FALLBACK,
    STORAGE_KEYS.LLM_USAGE_STATS,
    STORAGE_KEYS.LLM_CONNECTION_STATUS,
  ]);
};

export const storeLlmConfig = async (config: LlmConfig): Promise<void> => {
  const data: Record<string, unknown> = {
    [STORAGE_KEYS.LLM_PROVIDER]: config.provider,
  };
  await chrome.storage.local.set(data);
};

export const getLlmConfig = async (): Promise<LlmConfig> => {
  const data = await chrome.storage.local.get([STORAGE_KEYS.LLM_PROVIDER]);
  return {
    provider: (data[STORAGE_KEYS.LLM_PROVIDER] as LlmProvider) || "internal",
  };
};
