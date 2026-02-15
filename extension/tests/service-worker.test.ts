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
});
