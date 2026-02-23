export type LlmProvider = "openai" | "anthropic" | "perplexity" | "google" | "custom" | "internal";

export type LlmProviderDefinition = {
  id: LlmProvider;
  name: string;
  requiresApiKey: boolean;
};

export type LlmModel = {
  id: string;
  name: string;
  provider: LlmProvider;
  maxTokens: number;
  estimatedCostPer1kTokens: number;
};

export type LlmConfig = {
  provider: LlmProvider;
  model: string;
  apiKey: string | undefined;
  customBaseUrl: string | undefined;
  useFallback: boolean;
};

export type LlmUsageStats = {
  totalRequests: number;
  totalTokens: number;
  estimatedCost: number;
  lastResetDate: string;
};

export type LlmConnectionStatus = {
  status: "untested" | "connected" | "failed";
  message?: string;
  lastTested?: Date;
};

export const LLM_PROVIDERS: LlmProviderDefinition[] = [
  { id: "openai", name: "OpenAI", requiresApiKey: true },
  { id: "anthropic", name: "Anthropic", requiresApiKey: true },
  { id: "perplexity", name: "Perplexity", requiresApiKey: true },
  { id: "google", name: "Google", requiresApiKey: true },
  { id: "custom", name: "Custom", requiresApiKey: true },
  { id: "internal", name: "Internal (RageBaiter)", requiresApiKey: false },
];

export const LLM_MODELS: Record<string, LlmModel[]> = {
  openai: [
    {
      id: "gpt-4o",
      name: "GPT-4o",
      provider: "openai",
      maxTokens: 4096,
      estimatedCostPer1kTokens: 0.005,
    },
    {
      id: "gpt-4o-mini",
      name: "GPT-4o Mini",
      provider: "openai",
      maxTokens: 4096,
      estimatedCostPer1kTokens: 0.00015,
    },
    {
      id: "gpt-4-turbo",
      name: "GPT-4 Turbo",
      provider: "openai",
      maxTokens: 4096,
      estimatedCostPer1kTokens: 0.01,
    },
  ],
  anthropic: [
    {
      id: "claude-3-5-sonnet-20241022",
      name: "Claude 3.5 Sonnet",
      provider: "anthropic",
      maxTokens: 4096,
      estimatedCostPer1kTokens: 0.003,
    },
    {
      id: "claude-3-opus-20240229",
      name: "Claude 3 Opus",
      provider: "anthropic",
      maxTokens: 4096,
      estimatedCostPer1kTokens: 0.015,
    },
    {
      id: "claude-3-haiku-20240307",
      name: "Claude 3 Haiku",
      provider: "anthropic",
      maxTokens: 4096,
      estimatedCostPer1kTokens: 0.00025,
    },
  ],
  google: [
    {
      id: "gemini-2.0-flash",
      name: "Gemini 2.0 Flash",
      provider: "google",
      maxTokens: 4096,
      estimatedCostPer1kTokens: 0.0001,
    },
    {
      id: "gemini-1.5-pro",
      name: "Gemini 1.5 Pro",
      provider: "google",
      maxTokens: 4096,
      estimatedCostPer1kTokens: 0.00125,
    },
    {
      id: "gemini-1.5-flash",
      name: "Gemini 1.5 Flash",
      provider: "google",
      maxTokens: 4096,
      estimatedCostPer1kTokens: 0.000075,
    },
  ],
  perplexity: [
    {
      id: "llama-3.1-sonar-small-128k-online",
      name: "Sonar Small Online",
      provider: "perplexity",
      maxTokens: 4096,
      estimatedCostPer1kTokens: 0.0002,
    },
    {
      id: "llama-3.1-sonar-large-128k-online",
      name: "Sonar Large Online",
      provider: "perplexity",
      maxTokens: 4096,
      estimatedCostPer1kTokens: 0.001,
    },
  ],
  custom: [],
  internal: [],
};

const STORAGE_KEYS = {
  LLM_PROVIDER: "llmProvider",
  LLM_MODEL: "llmModel",
  LLM_API_KEY: "llmApiKey",
  LLM_CUSTOM_URL: "llmCustomUrl",
  LLM_USE_FALLBACK: "llmUseFallback",
  LLM_USAGE_STATS: "llmUsageStats",
  LLM_CONNECTION_STATUS: "llmConnectionStatus",
  BYOK_OPENAI_KEY: "byokOpenaiKey",
  BYOK_ANTHROPIC_KEY: "byokAnthropicKey",
  BYOK_GOOGLE_KEY: "byokGoogleKey",
  BYOK_PRIMARY_PROVIDER: "byokPrimaryProvider",
} as const;

export type ByokProvider = "openai" | "anthropic" | "google";

export const isValidProvider = (value: string): value is LlmProvider => {
  return LLM_PROVIDERS.some((p) => p.id === value);
};

export const getModelsForProvider = (provider: LlmProvider): LlmModel[] => {
  return LLM_MODELS[provider] ?? [];
};

export const getDefaultModelForProvider = (provider: LlmProvider): string => {
  const models = getModelsForProvider(provider);
  return models[0]?.id ?? "";
};

export const formatApiKeyDisplay = (key: string | undefined): string => {
  if (!key) return "";
  if (key.length <= 8) return key;
  return key.slice(0, 4) + "•".repeat(key.length - 8) + key.slice(-4);
};

export const storeLlmConfig = async (config: LlmConfig): Promise<void> => {
  const data: Record<string, unknown> = {
    [STORAGE_KEYS.LLM_PROVIDER]: config.provider,
    [STORAGE_KEYS.LLM_MODEL]: config.model,
    [STORAGE_KEYS.LLM_USE_FALLBACK]: config.useFallback,
  };

  if (config.provider !== "internal" && config.apiKey !== undefined) {
    data[STORAGE_KEYS.LLM_API_KEY] = config.apiKey;
  }

  if (config.customBaseUrl !== undefined) {
    data[STORAGE_KEYS.LLM_CUSTOM_URL] = config.customBaseUrl;
  }

  await chrome.storage.local.set(data);
};

export const getLlmConfig = async (): Promise<LlmConfig> => {
  const data = await chrome.storage.local.get([
    STORAGE_KEYS.LLM_PROVIDER,
    STORAGE_KEYS.LLM_MODEL,
    STORAGE_KEYS.LLM_API_KEY,
    STORAGE_KEYS.LLM_CUSTOM_URL,
    STORAGE_KEYS.LLM_USE_FALLBACK,
  ]);

  const provider = (data[STORAGE_KEYS.LLM_PROVIDER] as LlmProvider | undefined) ?? "internal";
  const validProvider: LlmProvider = isValidProvider(provider) ? provider : "internal";

  return {
    provider: validProvider,
    model: (data[STORAGE_KEYS.LLM_MODEL] as string | undefined) ?? "",
    apiKey: data[STORAGE_KEYS.LLM_API_KEY] as string | undefined,
    customBaseUrl: data[STORAGE_KEYS.LLM_CUSTOM_URL] as string | undefined,
    useFallback: (data[STORAGE_KEYS.LLM_USE_FALLBACK] as boolean | undefined) ?? true,
  };
};

export const clearLlmCredentials = async (): Promise<void> => {
  await chrome.storage.local.remove([
    STORAGE_KEYS.LLM_API_KEY,
    STORAGE_KEYS.LLM_CUSTOM_URL,
    STORAGE_KEYS.LLM_MODEL,
  ]);
};

export const getLlmUsageStats = async (): Promise<LlmUsageStats> => {
  const data = await chrome.storage.local.get([STORAGE_KEYS.LLM_USAGE_STATS]);
  const stored = data[STORAGE_KEYS.LLM_USAGE_STATS] as LlmUsageStats | undefined;

  return (
    stored ?? {
      totalRequests: 0,
      totalTokens: 0,
      estimatedCost: 0,
      lastResetDate: new Date().toISOString(),
    }
  );
};

export const updateLlmUsageStats = async (tokens: number, model: LlmModel): Promise<void> => {
  const current = await getLlmUsageStats();
  const cost = (tokens / 1000) * model.estimatedCostPer1kTokens;

  const updated: LlmUsageStats = {
    totalRequests: current.totalRequests + 1,
    totalTokens: current.totalTokens + tokens,
    estimatedCost: current.estimatedCost + cost,
    lastResetDate: current.lastResetDate,
  };

  await chrome.storage.local.set({ [STORAGE_KEYS.LLM_USAGE_STATS]: updated });
};

export const resetLlmUsageStats = async (): Promise<void> => {
  const reset: LlmUsageStats = {
    totalRequests: 0,
    totalTokens: 0,
    estimatedCost: 0,
    lastResetDate: new Date().toISOString(),
  };

  await chrome.storage.local.set({ [STORAGE_KEYS.LLM_USAGE_STATS]: reset });
};

export const getLlmConnectionStatus = async (): Promise<LlmConnectionStatus> => {
  const data = await chrome.storage.local.get([STORAGE_KEYS.LLM_CONNECTION_STATUS]);
  const stored = data[STORAGE_KEYS.LLM_CONNECTION_STATUS] as
    | { status: LlmConnectionStatus["status"]; message?: string; lastTested?: string }
    | undefined;

  if (!stored) {
    return { status: "untested" };
  }

  const result: LlmConnectionStatus = { status: stored.status };
  if (stored.message !== undefined) {
    result.message = stored.message;
  }
  if (stored.lastTested !== undefined) {
    result.lastTested = new Date(stored.lastTested);
  }
  return result;
};

export const setLlmConnectionStatus = async (status: LlmConnectionStatus): Promise<void> => {
  await chrome.storage.local.set({
    [STORAGE_KEYS.LLM_CONNECTION_STATUS]: {
      status: status.status,
      message: status.message,
      lastTested: status.lastTested?.toISOString(),
    },
  });
};

export const getDefaultLlmConfig = (): LlmConfig => {
  return {
    provider: "internal",
    model: "",
    apiKey: undefined,
    customBaseUrl: undefined,
    useFallback: true,
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

export const storeByokKey = async (provider: ByokProvider, apiKey: string): Promise<void> => {
  const keyMap: Record<ByokProvider, string> = {
    openai: STORAGE_KEYS.BYOK_OPENAI_KEY,
    anthropic: STORAGE_KEYS.BYOK_ANTHROPIC_KEY,
    google: STORAGE_KEYS.BYOK_GOOGLE_KEY,
  };
  await chrome.storage.local.set({ [keyMap[provider]]: apiKey });
};

export const getByokKey = async (provider: ByokProvider): Promise<string | undefined> => {
  const keyMap: Record<ByokProvider, string> = {
    openai: STORAGE_KEYS.BYOK_OPENAI_KEY,
    anthropic: STORAGE_KEYS.BYOK_ANTHROPIC_KEY,
    google: STORAGE_KEYS.BYOK_GOOGLE_KEY,
  };
  const data = await chrome.storage.local.get(keyMap[provider]);
  return data[keyMap[provider]] as string | undefined;
};

export const getAllByokKeys = async (): Promise<Record<ByokProvider, string | undefined>> => {
  const data = await chrome.storage.local.get([
    STORAGE_KEYS.BYOK_OPENAI_KEY,
    STORAGE_KEYS.BYOK_ANTHROPIC_KEY,
    STORAGE_KEYS.BYOK_GOOGLE_KEY,
  ]);
  return {
    openai: data[STORAGE_KEYS.BYOK_OPENAI_KEY] as string | undefined,
    anthropic: data[STORAGE_KEYS.BYOK_ANTHROPIC_KEY] as string | undefined,
    google: data[STORAGE_KEYS.BYOK_GOOGLE_KEY] as string | undefined,
  };
};

export const hasByokKey = async (): Promise<boolean> => {
  const keys = await getAllByokKeys();
  return Boolean(keys.openai || keys.anthropic || keys.google);
};

export const getPrimaryByokProvider = async (): Promise<ByokProvider | undefined> => {
  const data = await chrome.storage.local.get(STORAGE_KEYS.BYOK_PRIMARY_PROVIDER);
  const provider = data[STORAGE_KEYS.BYOK_PRIMARY_PROVIDER] as ByokProvider | undefined;
  if (provider && ["openai", "anthropic", "google"].includes(provider)) {
    return provider;
  }
  const keys = await getAllByokKeys();
  if (keys.openai) return "openai";
  if (keys.anthropic) return "anthropic";
  if (keys.google) return "google";
  return undefined;
};

export const setPrimaryByokProvider = async (provider: ByokProvider): Promise<void> => {
  await chrome.storage.local.set({ [STORAGE_KEYS.BYOK_PRIMARY_PROVIDER]: provider });
};

export const clearByokKey = async (provider: ByokProvider): Promise<void> => {
  const keyMap: Record<ByokProvider, string> = {
    openai: STORAGE_KEYS.BYOK_OPENAI_KEY,
    anthropic: STORAGE_KEYS.BYOK_ANTHROPIC_KEY,
    google: STORAGE_KEYS.BYOK_GOOGLE_KEY,
  };
  await chrome.storage.local.remove(keyMap[provider]);
};

export const clearAllByokKeys = async (): Promise<void> => {
  await chrome.storage.local.remove([
    STORAGE_KEYS.BYOK_OPENAI_KEY,
    STORAGE_KEYS.BYOK_ANTHROPIC_KEY,
    STORAGE_KEYS.BYOK_GOOGLE_KEY,
    STORAGE_KEYS.BYOK_PRIMARY_PROVIDER,
  ]);
};
