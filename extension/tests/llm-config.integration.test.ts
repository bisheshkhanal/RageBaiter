import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import {
  MESSAGE_TYPES,
  createMessageEnvelope,
  type LlmConfigPayload,
  type LlmConnectionTestPayload,
} from "../src/messaging/protocol.js";

type ChromeMock = ReturnType<typeof import("../../__tests__/mocks/chrome.js").createChromeMock>;

const getChromeMock = (): ChromeMock => {
  return (globalThis as unknown as { chrome: unknown }).chrome as ChromeMock;
};

const getMessageHandler = (chromeMock: ChromeMock) => {
  const listener = chromeMock.runtime.onMessage.listeners[0];
  if (!listener) {
    throw new Error("Expected service worker message listener to be registered");
  }
  return listener;
};

const sendToListener = async (
  listener: (message: unknown, sender: unknown, sendResponse: (response?: unknown) => void) => void,
  message: unknown,
  sender: unknown
) => {
  return await new Promise<unknown>((resolve) => {
    listener(message, sender, resolve);
  });
};

describe("LLM Configuration Integration", () => {
  beforeEach(() => {
    const chromeMock = getChromeMock();
    chromeMock.storage.local.get.mockImplementation(async () => ({}));
    chromeMock.storage.local.set.mockImplementation(async () => undefined);
    chromeMock.storage.local.remove.mockImplementation(async () => undefined);
  });

  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("handles full LLM config update flow", async () => {
    await import("../src/background/service-worker.js");

    const chromeMock = getChromeMock();
    const listener = getMessageHandler(chromeMock);

    const configPayload: LlmConfigPayload = {
      provider: "openai",
      model: "gpt-4o",
      apiKey: "test-key-123",
      customBaseUrl: undefined,
      useFallback: true,
    };

    const response = await sendToListener(
      listener,
      createMessageEnvelope(MESSAGE_TYPES.LLM_CONFIG_UPDATED, configPayload),
      {}
    );

    expect(response).toEqual({ ok: true, payload: undefined });

    expect(chromeMock.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({
        llmProvider: "openai",
        llmModel: "gpt-4o",
        llmApiKey: "test-key-123",
        llmUseFallback: true,
      })
    );
  });

  it("handles LLM credentials clear flow", async () => {
    await import("../src/background/service-worker.js");

    const chromeMock = getChromeMock();
    const listener = getMessageHandler(chromeMock);

    const response = await sendToListener(
      listener,
      createMessageEnvelope(MESSAGE_TYPES.LLM_CREDENTIALS_CLEARED, {}),
      {}
    );

    expect(response).toEqual({ ok: true, payload: undefined });

    expect(chromeMock.storage.local.remove).toHaveBeenCalledWith([
      "llmApiKey",
      "llmCustomUrl",
      "llmModel",
    ]);

    expect(chromeMock.storage.local.set).toHaveBeenCalledWith({
      llmProvider: "internal",
      llmModel: "",
      llmUseFallback: true,
    });
  });

  it("handles connection test for OpenAI provider", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [] }),
    }) as unknown as typeof fetch;

    await import("../src/background/service-worker.js");

    const chromeMock = getChromeMock();
    const listener = getMessageHandler(chromeMock);

    const testPayload: LlmConnectionTestPayload = {
      provider: "openai",
      model: "gpt-4o",
      apiKey: "test-key-123",
      customBaseUrl: undefined,
    };

    const response = await sendToListener(
      listener,
      createMessageEnvelope(MESSAGE_TYPES.LLM_CONNECTION_TEST, testPayload),
      {}
    );

    expect(response).toEqual(
      expect.objectContaining({
        ok: true,
        payload: expect.objectContaining({
          success: true,
          message: expect.stringContaining("Successfully connected"),
          latencyMs: expect.any(Number),
        }),
      })
    );

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.openai.com/v1/models",
      expect.objectContaining({
        method: "GET",
        headers: { Authorization: "Bearer test-key-123" },
      })
    );
  });

  it("handles connection test failure", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: "Invalid API key" } }),
    }) as unknown as typeof fetch;

    await import("../src/background/service-worker.js");

    const chromeMock = getChromeMock();
    const listener = getMessageHandler(chromeMock);

    const testPayload: LlmConnectionTestPayload = {
      provider: "openai",
      model: "gpt-4o",
      apiKey: "invalid-key",
      customBaseUrl: undefined,
    };

    const response = await sendToListener(
      listener,
      createMessageEnvelope(MESSAGE_TYPES.LLM_CONNECTION_TEST, testPayload),
      {}
    );

    expect(response).toEqual(
      expect.objectContaining({
        ok: true,
        payload: expect.objectContaining({
          success: false,
          message: expect.stringContaining("Invalid API key"),
          latencyMs: expect.any(Number),
        }),
      })
    );
  });

  it("handles provider switch from internal to OpenAI", async () => {
    await import("../src/background/service-worker.js");

    const chromeMock = getChromeMock();
    const listener = getMessageHandler(chromeMock);

    const internalConfig: LlmConfigPayload = {
      provider: "internal",
      model: "",
      apiKey: undefined,
      customBaseUrl: undefined,
      useFallback: true,
    };

    await sendToListener(
      listener,
      createMessageEnvelope(MESSAGE_TYPES.LLM_CONFIG_UPDATED, internalConfig),
      {}
    );

    const openaiConfig: LlmConfigPayload = {
      provider: "openai",
      model: "gpt-4o-mini",
      apiKey: "test-key-new",
      customBaseUrl: undefined,
      useFallback: false,
    };

    const response = await sendToListener(
      listener,
      createMessageEnvelope(MESSAGE_TYPES.LLM_CONFIG_UPDATED, openaiConfig),
      {}
    );

    expect(response).toEqual({ ok: true, payload: undefined });

    expect(chromeMock.storage.local.set).toHaveBeenLastCalledWith(
      expect.objectContaining({
        llmProvider: "openai",
        llmModel: "gpt-4o-mini",
        llmApiKey: "test-key-new",
        llmUseFallback: false,
      })
    );
  });

  it("preserves API key when only model changes", async () => {
    const chromeMock = getChromeMock();
    chromeMock.storage.local.get.mockImplementation(async () => ({
      llmProvider: "openai",
      llmModel: "gpt-4o",
      llmApiKey: "test-key-existing",
      llmUseFallback: true,
    }));

    await import("../src/background/service-worker.js");

    const listener = getMessageHandler(chromeMock);

    const configUpdate: LlmConfigPayload = {
      provider: "openai",
      model: "gpt-4-turbo",
      apiKey: "test-key-existing",
      customBaseUrl: undefined,
      useFallback: true,
    };

    await sendToListener(
      listener,
      createMessageEnvelope(MESSAGE_TYPES.LLM_CONFIG_UPDATED, configUpdate),
      {}
    );

    expect(chromeMock.storage.local.set).toHaveBeenLastCalledWith(
      expect.objectContaining({
        llmModel: "gpt-4-turbo",
        llmApiKey: "test-key-existing",
      })
    );
  });

  it("handles custom provider with base URL", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [] }),
    }) as unknown as typeof fetch;

    await import("../src/background/service-worker.js");

    const chromeMock = getChromeMock();
    const listener = getMessageHandler(chromeMock);

    const testPayload: LlmConnectionTestPayload = {
      provider: "custom",
      model: "custom-model",
      apiKey: "custom-key",
      customBaseUrl: "https://api.custom.com/v1",
    };

    const response = await sendToListener(
      listener,
      createMessageEnvelope(MESSAGE_TYPES.LLM_CONNECTION_TEST, testPayload),
      {}
    );

    expect(response).toEqual(
      expect.objectContaining({
        ok: true,
        payload: expect.objectContaining({ success: true }),
      })
    );

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.custom.com/v1/models",
      expect.any(Object)
    );
  });

  it("returns error for custom provider without base URL", async () => {
    await import("../src/background/service-worker.js");

    const chromeMock = getChromeMock();
    const listener = getMessageHandler(chromeMock);

    const testPayload: LlmConnectionTestPayload = {
      provider: "custom",
      model: "custom-model",
      apiKey: "custom-key",
      customBaseUrl: undefined,
    };

    const response = await sendToListener(
      listener,
      createMessageEnvelope(MESSAGE_TYPES.LLM_CONNECTION_TEST, testPayload),
      {}
    );

    expect(response).toEqual(
      expect.objectContaining({
        ok: true,
        payload: expect.objectContaining({
          success: false,
          message: "Custom base URL is required",
        }),
      })
    );
  });
});
