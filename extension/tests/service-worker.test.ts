import { afterEach, describe, expect, it, vi } from "vitest";

import { createLlmSdkMock } from "../../__tests__/mocks/llm.js";
import { createSupabaseClientMock } from "../../__tests__/mocks/supabase.js";
import { MESSAGE_TYPES, createMessageEnvelope } from "../src/messaging/protocol.js";

type ChromeMock = ReturnType<typeof import("../../__tests__/mocks/chrome.js").createChromeMock>;

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

describe("service worker messaging layer", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("registers chrome listeners and keeps deterministic dependency mocks available", async () => {
    const supabase = createSupabaseClientMock([{ id: "1" }]);
    const llm = createLlmSdkMock({ score: 42 });

    await import("../src/background/service-worker.js");

    const chromeMock = (globalThis as unknown as { chrome: unknown }).chrome as ChromeMock;

    expect(chromeMock.runtime.onInstalled.addListener).toHaveBeenCalledTimes(1);
    expect(chromeMock.runtime.onMessage.addListener).toHaveBeenCalledTimes(1);
    expect(chromeMock.sidePanel.setPanelBehavior).toHaveBeenCalledWith({
      openPanelOnActionClick: false,
    });

    const rows = await supabase.from("users").select();
    const analysis = await llm.analyzeText("demo");

    expect(rows.data).toEqual([{ id: "1" }]);
    expect(analysis.score).toBe(42);
  });

  it("routes SETTINGS_UPDATED and QUIZ_COMPLETED messages to storage", async () => {
    await import("../src/background/service-worker.js");

    const chromeMock = (globalThis as unknown as { chrome: unknown }).chrome as ChromeMock;
    const listener = getMessageHandler(chromeMock);

    const settingsResponse = await sendToListener(
      listener,
      createMessageEnvelope(MESSAGE_TYPES.SETTINGS_UPDATED, {
        isEnabled: true,
        sensitivity: "high",
      }),
      {}
    );

    expect(settingsResponse).toEqual({ ok: true, payload: undefined });
    expect(chromeMock.storage.local.set).toHaveBeenNthCalledWith(1, {
      isEnabled: true,
      sensitivity: "high",
    });

    const quizResponse = await sendToListener(
      listener,
      createMessageEnvelope(MESSAGE_TYPES.QUIZ_COMPLETED, {
        social: 0.2,
        economic: -0.1,
        populist: 0.3,
      }),
      {}
    );

    expect(quizResponse).toEqual({ ok: true, payload: undefined });
    expect(chromeMock.storage.local.set).toHaveBeenNthCalledWith(2, {
      userVector: {
        x: 0.2,
        y: -0.1,
        social: 0.2,
        economic: -0.1,
        populist: 0.3,
      },
    });
  });

  it("routes ANALYZE_RESULT through decision engine to content script tab", async () => {
    await import("../src/background/service-worker.js");

    const chromeMock = (globalThis as unknown as { chrome: unknown }).chrome as ChromeMock;
    const listener = getMessageHandler(chromeMock);

    chromeMock.storage.local.get.mockResolvedValue({
      userVector: {
        social: 0,
        economic: 0,
        populist: 0,
      },
    });

    const response = await sendToListener(
      listener,
      createMessageEnvelope(MESSAGE_TYPES.ANALYZE_RESULT, {
        tweetId: "999",
        topic: "Tax Policy",
        confidence: 0.89,
        tweetVector: {
          social: 0.12,
          economic: 0,
          populist: 0,
        },
        fallacies: ["Ad Hominem"],
      }),
      { tab: { id: 5 } }
    );

    expect(response).toEqual({ ok: true, payload: undefined });
    expect(chromeMock.tabs.sendMessage).toHaveBeenCalledWith(
      5,
      expect.objectContaining({
        type: MESSAGE_TYPES.INTERVENTION_TRIGGER,
        payload: expect.objectContaining({
          tweetId: "999",
          level: "critical",
        }),
      }),
      expect.any(Function)
    );
  });

  it("applies deterministic feedback drift and queues event when backend sync fails", async () => {
    await import("../src/background/service-worker.js");

    const chromeMock = (globalThis as unknown as { chrome: unknown }).chrome as ChromeMock;
    const listener = getMessageHandler(chromeMock);

    const storageState: Record<string, unknown> = {
      userVector: {
        social: 0,
        economic: 0,
        populist: 0,
      },
      feedbackQueue: [],
      vectorHistory: [],
      backendUrl: "http://localhost:3001",
      apiKey: "test-key",
    };

    chromeMock.storage.local.get.mockImplementation((async (keys: unknown) => {
      if (typeof keys === "string") {
        return { [keys]: storageState[keys] };
      }

      if (Array.isArray(keys)) {
        return Object.fromEntries(keys.map((key) => [key, storageState[key]]));
      }

      return storageState;
    }) as unknown as () => Promise<{}>);

    chromeMock.storage.local.set.mockImplementation((async (payload: Record<string, unknown>) => {
      Object.assign(storageState, payload);
      return undefined;
    }) as unknown as () => Promise<undefined>);

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const response = await sendToListener(
      listener,
      createMessageEnvelope(MESSAGE_TYPES.FEEDBACK_SUBMITTED, {
        tweetId: "tweet-1",
        feedback: "agreed",
        tweetVector: {
          social: 0.8,
          economic: -0.4,
          populist: 0.2,
        },
        timestamp: "2026-02-15T09:00:00.000Z",
      }),
      {}
    );

    expect(response).toEqual({
      ok: true,
      payload: {
        updatedVector: expect.objectContaining({
          social: expect.any(Number),
          economic: expect.any(Number),
          populist: expect.any(Number),
        }),
      },
    });

    const updatedVector = storageState.userVector as {
      social: number;
      economic: number;
      populist: number;
    };
    expect(updatedVector.social).toBeGreaterThan(0);
    expect(updatedVector.economic).toBeLessThan(0);

    const queue = storageState.feedbackQueue as Array<{ syncAttempts: number }>;
    expect(queue).toHaveLength(1);
    expect(queue[0]?.syncAttempts).toBe(1);

    const history = storageState.vectorHistory as Array<{ feedback: string }>;
    expect(history).toHaveLength(1);
    expect(history[0]?.feedback).toBe("agreed");
  });

  it("retries queued feedback on next feedback event and clears queue after sync success", async () => {
    await import("../src/background/service-worker.js");

    const chromeMock = (globalThis as unknown as { chrome: unknown }).chrome as ChromeMock;
    const listener = getMessageHandler(chromeMock);

    const storageState: Record<string, unknown> = {
      userVector: {
        social: 0,
        economic: 0,
        populist: 0,
      },
      feedbackQueue: [],
      vectorHistory: [],
      backendUrl: "http://localhost:3001",
      apiKey: "test-key",
    };

    chromeMock.storage.local.get.mockImplementation((async (keys: unknown) => {
      if (typeof keys === "string") {
        return { [keys]: storageState[keys] };
      }

      if (Array.isArray(keys)) {
        return Object.fromEntries(keys.map((key) => [key, storageState[key]]));
      }

      return storageState;
    }) as unknown as () => Promise<{}>);

    chromeMock.storage.local.set.mockImplementation((async (payload: Record<string, unknown>) => {
      Object.assign(storageState, payload);
      return undefined;
    }) as unknown as () => Promise<undefined>);

    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValue({ ok: true } as Response)
      .mockResolvedValue({ ok: true } as Response);
    vi.stubGlobal("fetch", fetchMock);

    await sendToListener(
      listener,
      createMessageEnvelope(MESSAGE_TYPES.FEEDBACK_SUBMITTED, {
        tweetId: "tweet-a",
        feedback: "dismissed",
        tweetVector: {
          social: 0.6,
          economic: 0.2,
          populist: 0,
        },
        timestamp: "2026-02-15T10:00:00.000Z",
      }),
      {}
    );

    expect((storageState.feedbackQueue as unknown[]).length).toBe(1);

    await sendToListener(
      listener,
      createMessageEnvelope(MESSAGE_TYPES.FEEDBACK_SUBMITTED, {
        tweetId: "tweet-b",
        feedback: "agreed",
        tweetVector: {
          social: -0.2,
          economic: -0.7,
          populist: 0.4,
        },
        timestamp: "2026-02-15T10:01:00.000Z",
      }),
      {}
    );

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(storageState.feedbackQueue).toEqual([]);
  });

  it("skips intervention while cooldown is active", async () => {
    await import("../src/background/service-worker.js");

    const chromeMock = (globalThis as unknown as { chrome: unknown }).chrome as ChromeMock;
    const listener = getMessageHandler(chromeMock);

    chromeMock.storage.local.get.mockResolvedValue({
      userVector: {
        social: 0,
        economic: 0,
        populist: 0,
      },
    });

    const payload = {
      tweetId: "cooldown",
      topic: "Tax Policy",
      confidence: 0.89,
      tweetVector: {
        social: 0.12,
        economic: 0,
        populist: 0,
      },
      fallacies: ["Ad Hominem"],
    };

    const firstResponse = await sendToListener(
      listener,
      createMessageEnvelope(MESSAGE_TYPES.ANALYZE_RESULT, payload),
      { tab: { id: 5 } }
    );

    const secondResponse = await sendToListener(
      listener,
      createMessageEnvelope(MESSAGE_TYPES.ANALYZE_RESULT, payload),
      { tab: { id: 5 } }
    );

    expect(firstResponse).toEqual({ ok: true, payload: undefined });
    expect(secondResponse).toEqual({ ok: true, payload: undefined });
    expect(chromeMock.tabs.sendMessage).toHaveBeenCalledTimes(1);
  });

  it("returns invalid envelope failure for untyped messages", async () => {
    await import("../src/background/service-worker.js");

    const chromeMock = (globalThis as unknown as { chrome: unknown }).chrome as ChromeMock;
    const listener = getMessageHandler(chromeMock);

    const response = await sendToListener(listener, { type: "BAD" }, {});

    expect(response).toEqual({
      ok: false,
      error: "Invalid message envelope",
      retriable: false,
    });
  });

  it("retries QUOTA_STATUS_REQUEST through refresh on 401 and updates stored tokens", async () => {
    await import("../src/background/service-worker.js");

    const chromeMock = (globalThis as unknown as { chrome: unknown }).chrome as ChromeMock;
    const listener = getMessageHandler(chromeMock);

    const storageState: Record<string, unknown> = {
      backendUrl: "http://localhost:3001",
      authToken: "expired-access-token",
      refreshToken: "valid-refresh-token",
    };

    chromeMock.storage.local.get.mockImplementation((async (keys: unknown) => {
      if (typeof keys === "string") {
        return { [keys]: storageState[keys] };
      }

      if (Array.isArray(keys)) {
        return Object.fromEntries(keys.map((key) => [key, storageState[key]]));
      }

      return storageState;
    }) as unknown as () => Promise<{}>);

    chromeMock.storage.local.set.mockImplementation((async (payload: Record<string, unknown>) => {
      Object.assign(storageState, payload);
      return undefined;
    }) as unknown as () => Promise<undefined>);

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: "Unauthorized" } }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          session: {
            accessToken: "new-access-token",
            refreshToken: "new-refresh-token",
            expiresAt: Date.now() / 1000 + 3600,
          },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          used: 5,
          limit: 100,
          remaining: 95,
          resetsAt: "2026-04-01T00:00:00Z",
          hasOwnKey: false,
        }),
      } as Response);

    vi.stubGlobal("fetch", fetchMock);

    const response = await sendToListener(
      listener,
      createMessageEnvelope(MESSAGE_TYPES.QUOTA_STATUS_REQUEST, {}),
      {}
    );

    expect(response).toEqual({
      ok: true,
      payload: {
        used: 5,
        limit: 100,
        remaining: 95,
        resetsAt: "2026-04-01T00:00:00Z",
        hasOwnKey: false,
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenNthCalledWith(1, "http://localhost:3001/api/quota", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer expired-access-token",
      },
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "http://localhost:3001/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: "valid-refresh-token" }),
    });
    expect(fetchMock).toHaveBeenNthCalledWith(3, "http://localhost:3001/api/quota", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer new-access-token",
      },
    });

    expect(storageState.authToken).toBe("new-access-token");
    expect(storageState.refreshToken).toBe("new-refresh-token");
  });

  it("clears stale auth state when refresh fails on QUOTA_STATUS_REQUEST 401", async () => {
    await import("../src/background/service-worker.js");

    const chromeMock = (globalThis as unknown as { chrome: unknown }).chrome as ChromeMock;
    const listener = getMessageHandler(chromeMock);

    const storageState: Record<string, unknown> = {
      backendUrl: "http://localhost:3001",
      authToken: "expired-access-token",
      refreshToken: "invalid-refresh-token",
    };

    chromeMock.storage.local.get.mockImplementation((async (keys: unknown) => {
      if (typeof keys === "string") {
        return { [keys]: storageState[keys] };
      }

      if (Array.isArray(keys)) {
        return Object.fromEntries(keys.map((key) => [key, storageState[key]]));
      }

      return storageState;
    }) as unknown as () => Promise<{}>);

    chromeMock.storage.local.set.mockImplementation((async (payload: Record<string, unknown>) => {
      Object.assign(storageState, payload);
      return undefined;
    }) as unknown as () => Promise<undefined>);

    const removedKeys: string[] = [];
    chromeMock.storage.local.remove.mockImplementation((async (keys: unknown) => {
      if (Array.isArray(keys)) {
        removedKeys.push(...keys);
        for (const key of keys) {
          delete storageState[key];
        }
      } else if (typeof keys === "string") {
        removedKeys.push(keys);
        delete storageState[keys];
      }
      return undefined;
    }) as unknown as () => Promise<undefined>);

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: "Unauthorized" } }),
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          error: {
            code: "REFRESH_FAILED",
            message: "Invalid refresh token",
          },
        }),
      } as Response);

    vi.stubGlobal("fetch", fetchMock);

    const response = await sendToListener(
      listener,
      createMessageEnvelope(MESSAGE_TYPES.QUOTA_STATUS_REQUEST, {}),
      {}
    );

    expect(response).toEqual({
      ok: false,
      error: "Quota request failed: 401",
      retriable: true,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(1, "http://localhost:3001/api/quota", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer expired-access-token",
      },
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "http://localhost:3001/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: "invalid-refresh-token" }),
    });

    expect(removedKeys).toContain("authToken");
    expect(removedKeys).toContain("refreshToken");
    expect(removedKeys).toContain("accessToken");
    expect(storageState.authToken).toBeUndefined();
    expect(storageState.refreshToken).toBeUndefined();
  });
});
