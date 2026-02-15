import { describe, expect, it, beforeEach } from "vitest";

import {
  LLM_PROVIDERS,
  LLM_MODELS,
  type LlmConfig,
  type LlmProvider,
  formatApiKeyDisplay,
  getDefaultModelForProvider,
  getLlmConfig,
  getLlmConnectionStatus,
  getLlmUsageStats,
  getModelsForProvider,
  isValidProvider,
  resetLlmUsageStats,
  storeLlmConfig,
  updateLlmUsageStats,
  clearLlmCredentials,
  setLlmConnectionStatus,
} from "../src/lib/llm-config.js";

type ChromeMock = ReturnType<typeof import("../../__tests__/mocks/chrome.js").createChromeMock>;

const getChromeMock = (): ChromeMock => {
  return (globalThis as unknown as { chrome: unknown }).chrome as ChromeMock;
};

describe("llm-config", () => {
  beforeEach(() => {
    const chromeMock = getChromeMock();
    chromeMock.storage.local.get.mockImplementation(async () => ({}));
    chromeMock.storage.local.set.mockImplementation(async () => undefined);
    chromeMock.storage.local.remove.mockImplementation(async () => undefined);
  });

  describe("Provider and Model Constants", () => {
    it("has correct provider definitions", () => {
      expect(LLM_PROVIDERS).toHaveLength(6);
      expect(LLM_PROVIDERS.map((p) => p.id)).toContain("openai");
      expect(LLM_PROVIDERS.map((p) => p.id)).toContain("anthropic");
      expect(LLM_PROVIDERS.map((p) => p.id)).toContain("perplexity");
      expect(LLM_PROVIDERS.map((p) => p.id)).toContain("google");
      expect(LLM_PROVIDERS.map((p) => p.id)).toContain("custom");
      expect(LLM_PROVIDERS.map((p) => p.id)).toContain("internal");
    });

    it("correctly identifies providers requiring API keys", () => {
      const requiringKey = LLM_PROVIDERS.filter((p) => p.requiresApiKey).map((p) => p.id);
      expect(requiringKey).toContain("openai");
      expect(requiringKey).toContain("anthropic");
      expect(requiringKey).toContain("perplexity");
      expect(requiringKey).toContain("google");
      expect(requiringKey).toContain("custom");
      expect(requiringKey).not.toContain("internal");
    });

    it("has models defined for OpenAI", () => {
      expect(LLM_MODELS.openai).toHaveLength(3);
      expect(LLM_MODELS.openai.map((m) => m.id)).toContain("gpt-4o");
      expect(LLM_MODELS.openai[0]?.provider).toBe("openai");
    });

    it("has models defined for Anthropic", () => {
      expect(LLM_MODELS.anthropic).toHaveLength(3);
      expect(LLM_MODELS.anthropic.map((m) => m.id)).toContain("claude-3-5-sonnet-20241022");
    });

    it("has models defined for Google", () => {
      expect(LLM_MODELS.google).toHaveLength(3);
      expect(LLM_MODELS.google.map((m) => m.id)).toContain("gemini-2.0-flash");
    });

    it("has models defined for Perplexity", () => {
      expect(LLM_MODELS.perplexity).toHaveLength(2);
    });
  });

  describe("isValidProvider", () => {
    it("returns true for valid providers", () => {
      expect(isValidProvider("openai")).toBe(true);
      expect(isValidProvider("anthropic")).toBe(true);
      expect(isValidProvider("internal")).toBe(true);
    });

    it("returns false for invalid providers", () => {
      expect(isValidProvider("invalid")).toBe(false);
      expect(isValidProvider("")).toBe(false);
      expect(isValidProvider("openai2")).toBe(false);
    });
  });

  describe("getModelsForProvider", () => {
    it("returns models for OpenAI", () => {
      const models = getModelsForProvider("openai");
      expect(models).toHaveLength(3);
      expect(models[0]?.id).toBe("gpt-4o");
    });

    it("returns models for Anthropic", () => {
      const models = getModelsForProvider("anthropic");
      expect(models).toHaveLength(3);
    });

    it("returns empty array for internal provider", () => {
      expect(getModelsForProvider("internal")).toHaveLength(0);
    });

    it("returns empty array for custom provider", () => {
      expect(getModelsForProvider("custom")).toHaveLength(0);
    });
  });

  describe("getDefaultModelForProvider", () => {
    it("returns first model for OpenAI", () => {
      expect(getDefaultModelForProvider("openai")).toBe("gpt-4o");
    });

    it("returns empty string for internal provider", () => {
      expect(getDefaultModelForProvider("internal")).toBe("");
    });
  });

  describe("formatApiKeyDisplay", () => {
    it("obfuscates long API keys", () => {
      const key = "testkey-abcdefghijklmnopqrstuvwxyz1234567890";
      const display = formatApiKeyDisplay(key);
      expect(display.startsWith("test")).toBe(true);
      expect(display.endsWith("7890")).toBe(true);
      expect(display).not.toContain("bcdefghijklmnopqrstuvwxyz123456");
    });

    it("returns empty string for undefined", () => {
      expect(formatApiKeyDisplay(undefined)).toBe("");
    });

    it("returns short keys as-is", () => {
      expect(formatApiKeyDisplay("short")).toBe("short");
    });
  });

  describe("storeLlmConfig", () => {
    it("stores config with API key", async () => {
      const chromeMock = getChromeMock();
      const config: LlmConfig = {
        provider: "openai",
        model: "gpt-4o",
        apiKey: "test-key-123",
        customBaseUrl: undefined,
        useFallback: true,
      };

      await storeLlmConfig(config);

      expect(chromeMock.storage.local.set).toHaveBeenCalledWith({
        llmProvider: "openai",
        llmModel: "gpt-4o",
        llmApiKey: "test-key-123",
        llmUseFallback: true,
      });
    });

    it("does not store API key for internal provider", async () => {
      const chromeMock = getChromeMock();
      const config: LlmConfig = {
        provider: "internal",
        model: "",
        apiKey: undefined,
        customBaseUrl: undefined,
        useFallback: true,
      };

      await storeLlmConfig(config);

      expect(chromeMock.storage.local.set).toHaveBeenCalledWith({
        llmProvider: "internal",
        llmModel: "",
        llmUseFallback: true,
      });
    });

    it("stores custom URL for custom provider", async () => {
      const chromeMock = getChromeMock();
      const config: LlmConfig = {
        provider: "custom",
        model: "custom-model",
        apiKey: "custom-key",
        customBaseUrl: "https://api.custom.com/v1",
        useFallback: false,
      };

      await storeLlmConfig(config);

      expect(chromeMock.storage.local.set).toHaveBeenCalledWith({
        llmProvider: "custom",
        llmModel: "custom-model",
        llmApiKey: "custom-key",
        llmCustomUrl: "https://api.custom.com/v1",
        llmUseFallback: false,
      });
    });
  });

  describe("getLlmConfig", () => {
    it("returns stored config", async () => {
      const chromeMock = getChromeMock();
      chromeMock.storage.local.get.mockImplementation(async () => ({
        llmProvider: "anthropic",
        llmModel: "claude-3-opus-20240229",
        llmApiKey: "anthropic-test-key",
        llmUseFallback: false,
      }));

      const config = await getLlmConfig();

      expect(config.provider).toBe("anthropic");
      expect(config.model).toBe("claude-3-opus-20240229");
      expect(config.apiKey).toBe("anthropic-test-key");
      expect(config.useFallback).toBe(false);
    });

    it("returns default values when nothing stored", async () => {
      const config = await getLlmConfig();

      expect(config.provider).toBe("internal");
      expect(config.model).toBe("");
      expect(config.apiKey).toBeUndefined();
      expect(config.useFallback).toBe(true);
    });
  });

  describe("clearLlmCredentials", () => {
    it("removes credential keys from storage", async () => {
      const chromeMock = getChromeMock();
      await clearLlmCredentials();

      expect(chromeMock.storage.local.remove).toHaveBeenCalledWith([
        "llmApiKey",
        "llmCustomUrl",
        "llmModel",
      ]);
    });
  });

  describe("Usage Stats", () => {
    it("returns default stats when nothing stored", async () => {
      const stats = await getLlmUsageStats();

      expect(stats.totalRequests).toBe(0);
      expect(stats.totalTokens).toBe(0);
      expect(stats.estimatedCost).toBe(0);
      expect(stats.lastResetDate).toBeDefined();
    });

    it("updates usage stats correctly", async () => {
      const chromeMock = getChromeMock();
      const model = {
        id: "gpt-4o",
        name: "GPT-4o",
        provider: "openai" as LlmProvider,
        maxTokens: 4096,
        estimatedCostPer1kTokens: 0.005,
      };

      await updateLlmUsageStats(2000, model);

      expect(chromeMock.storage.local.set).toHaveBeenCalledWith({
        llmUsageStats: expect.objectContaining({
          totalRequests: 1,
          totalTokens: 2000,
          estimatedCost: 0.01,
        }),
      });
    });

    it("resets usage stats", async () => {
      const chromeMock = getChromeMock();
      await resetLlmUsageStats();

      expect(chromeMock.storage.local.set).toHaveBeenCalledWith({
        llmUsageStats: expect.objectContaining({
          totalRequests: 0,
          totalTokens: 0,
          estimatedCost: 0,
        }),
      });
    });
  });

  describe("Connection Status", () => {
    it("returns untested status when nothing stored", async () => {
      const status = await getLlmConnectionStatus();
      expect(status.status).toBe("untested");
    });

    it("stores and retrieves connection status", async () => {
      const chromeMock = getChromeMock();
      const testDate = new Date("2026-02-15T10:00:00Z");

      await setLlmConnectionStatus({
        status: "connected",
        message: "Success",
        lastTested: testDate,
      });

      expect(chromeMock.storage.local.set).toHaveBeenCalledWith({
        llmConnectionStatus: {
          status: "connected",
          message: "Success",
          lastTested: "2026-02-15T10:00:00.000Z",
        },
      });
    });
  });
});
