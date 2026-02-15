export type LlmProvider = "openai" | "anthropic" | "perplexity" | "google" | "custom" | "internal";

export type LlmModel = {
  id: string;
  name: string;
  provider: LlmProvider;
  maxTokens: number;
  estimatedCostPer1kTokens: number;
};

export const LLM_PROVIDERS: {
  id: LlmProvider;
  name: string;
  requiresApiKey: boolean;
  baseUrl?: string;
}[] = [
  { id: "openai", name: "OpenAI", requiresApiKey: true },
  { id: "anthropic", name: "Anthropic", requiresApiKey: true },
  { id: "perplexity", name: "Perplexity", requiresApiKey: true },
  { id: "google", name: "Google AI Studio", requiresApiKey: true },
  { id: "custom", name: "Custom Endpoint", requiresApiKey: true },
  { id: "internal", name: "Internal API (Fallback)", requiresApiKey: false },
];

export const LLM_MODELS: Record<Exclude<LlmProvider, "internal" | "custom">, LlmModel[]> = {
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
  perplexity: [
    {
      id: "llama-3.1-sonar-large-128k-online",
      name: "Llama 3.1 Sonar Large",
      provider: "perplexity",
      maxTokens: 4096,
      estimatedCostPer1kTokens: 0.001,
    },
    {
      id: "llama-3.1-sonar-small-128k-online",
      name: "Llama 3.1 Sonar Small",
      provider: "perplexity",
      maxTokens: 4096,
      estimatedCostPer1kTokens: 0.0002,
    },
  ],
  google: [
    {
      id: "gemini-2.0-flash",
      name: "Gemini 2.0 Flash",
      provider: "google",
      maxTokens: 8192,
      estimatedCostPer1kTokens: 0.000075,
    },
    {
      id: "gemini-1.5-pro",
      name: "Gemini 1.5 Pro",
      provider: "google",
      maxTokens: 8192,
      estimatedCostPer1kTokens: 0.00125,
    },
    {
      id: "gemini-1.5-flash",
      name: "Gemini 1.5 Flash",
      provider: "google",
      maxTokens: 8192,
      estimatedCostPer1kTokens: 0.000075,
    },
  ],
};

export type LlmConfig = {
  provider: LlmProvider;
  model: string;
  apiKey: string | undefined;
  customBaseUrl: string | undefined;
  useFallback: boolean;
};

export type LlmConnectionStatus = {
  status: "untested" | "testing" | "connected" | "error";
  message?: string;
  lastTested?: Date;
};

export type LlmUsageStats = {
  totalRequests: number;
  totalTokens: number;
  estimatedCost: number;
  lastResetDate: string;
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

const obfuscate = (value: string): string => {
  if (!value || value.length < 8) return value;
  const prefix = value.slice(0, 4);
  const suffix = value.slice(-4);
  return `${prefix}${"*".repeat(value.length - 8)}${suffix}`;
};

export const storeLlmConfig = async (config: LlmConfig): Promise<void> => {
  const data: Record<string, unknown> = {
    [STORAGE_KEYS.LLM_PROVIDER]: config.provider,
    [STORAGE_KEYS.LLM_MODEL]: config.model,
    [STORAGE_KEYS.LLM_USE_FALLBACK]: config.useFallback,
  };

  if (config.apiKey && config.provider !== "internal") {
    data[STORAGE_KEYS.LLM_API_KEY] = config.apiKey;
  }

  if (config.customBaseUrl && config.provider === "custom") {
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

  return {
    provider: (data[STORAGE_KEYS.LLM_PROVIDER] as LlmProvider) || "internal",
    model: (data[STORAGE_KEYS.LLM_MODEL] as string) || "",
    apiKey: (data[STORAGE_KEYS.LLM_API_KEY] as string) || undefined,
    customBaseUrl: (data[STORAGE_KEYS.LLM_CUSTOM_URL] as string) || undefined,
    useFallback: (data[STORAGE_KEYS.LLM_USE_FALLBACK] as boolean) ?? true,
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
  const data = await chrome.storage.local.get(STORAGE_KEYS.LLM_USAGE_STATS);
  const stats = data[STORAGE_KEYS.LLM_USAGE_STATS];

  if (!stats) {
    return {
      totalRequests: 0,
      totalTokens: 0,
      estimatedCost: 0,
      lastResetDate: new Date().toISOString(),
    };
  }

  return stats as LlmUsageStats;
};

export const updateLlmUsageStats = async (tokens: number, model: LlmModel): Promise<void> => {
  const stats = await getLlmUsageStats();
  const cost = (tokens / 1000) * model.estimatedCostPer1kTokens;

  const updated: LlmUsageStats = {
    totalRequests: stats.totalRequests + 1,
    totalTokens: stats.totalTokens + tokens,
    estimatedCost: stats.estimatedCost + cost,
    lastResetDate: stats.lastResetDate,
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
  const data = await chrome.storage.local.get(STORAGE_KEYS.LLM_CONNECTION_STATUS);
  const status = data[STORAGE_KEYS.LLM_CONNECTION_STATUS];

  if (!status) {
    return { status: "untested" };
  }

  return {
    ...status,
    lastTested: status.lastTested ? new Date(status.lastTested) : undefined,
  } as LlmConnectionStatus;
};

export const setLlmConnectionStatus = async (status: LlmConnectionStatus): Promise<void> => {
  const serializable = {
    ...status,
    lastTested: status.lastTested?.toISOString(),
  };
  await chrome.storage.local.set({ [STORAGE_KEYS.LLM_CONNECTION_STATUS]: serializable });
};

export const formatApiKeyDisplay = (apiKey?: string): string => {
  if (!apiKey) return "";
  return obfuscate(apiKey);
};

export const isValidProvider = (provider: string): provider is LlmProvider => {
  return LLM_PROVIDERS.some((p) => p.id === provider);
};

export const getModelsForProvider = (provider: LlmProvider): LlmModel[] => {
  if (provider === "internal" || provider === "custom") return [];
  return LLM_MODELS[provider] || [];
};

export const getDefaultModelForProvider = (provider: LlmProvider): string => {
  const models = getModelsForProvider(provider);
  return models[0]?.id || "";
};
