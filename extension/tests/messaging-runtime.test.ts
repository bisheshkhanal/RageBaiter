import { describe, expect, it } from "vitest";

import { MESSAGE_TYPES } from "../src/messaging/protocol.js";
import { sendRuntimeRequest, sendTabRequest } from "../src/messaging/runtime.js";

type ChromeMock = ReturnType<typeof import("../../__tests__/mocks/chrome.js").createChromeMock>;

const getChromeMock = (): ChromeMock => {
  return (globalThis as unknown as { chrome: unknown }).chrome as ChromeMock;
};

describe("runtime messaging helper", () => {
  it("handles large payload requests without losing envelope integrity", async () => {
    const chromeMock = getChromeMock();
    const largeText = "x".repeat(50_000);

    const response = await sendRuntimeRequest(
      MESSAGE_TYPES.ANALYZE_RESULT,
      {
        tweetId: "large-1",
        topic: largeText,
        confidence: 0.91,
        tweetVector: {
          social: 0.1,
          economic: 0.2,
          populist: -0.1,
        },
        fallacies: ["Strawman", "Ad Hominem"],
      },
      { timeoutMs: 200, retries: 0 }
    );

    expect(response).toEqual({ ok: true, payload: undefined });
    expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MESSAGE_TYPES.ANALYZE_RESULT,
        payload: expect.objectContaining({
          topic: largeText,
        }),
        id: expect.any(String),
      }),
      expect.any(Function)
    );
  });

  it("retries when service worker wake-up path returns transient runtime error", async () => {
    const chromeMock = getChromeMock();
    let attempts = 0;

    chromeMock.runtime.sendMessage.mockImplementation(
      (_message: unknown, callback?: (response: unknown) => void) => {
        attempts += 1;

        if (attempts === 1) {
          chromeMock.runtime.lastError = {
            message: "Could not establish connection. Receiving end does not exist.",
          };
          callback?.(undefined);
          chromeMock.runtime.lastError = undefined;
          return;
        }

        callback?.({ ok: true, payload: undefined });
      }
    );

    const response = await sendRuntimeRequest(
      MESSAGE_TYPES.SETTINGS_UPDATED,
      {
        isEnabled: false,
        sensitivity: "low",
      },
      { timeoutMs: 100, retries: 2, retryDelayMs: 1 }
    );

    expect(response).toEqual({ ok: true, payload: undefined });
    expect(chromeMock.runtime.sendMessage).toHaveBeenCalledTimes(2);
  });

  it("handles rapid burst traffic safely without dropping requests", async () => {
    const chromeMock = getChromeMock();

    const burst = await Promise.all(
      Array.from({ length: 25 }, (_, index) =>
        sendRuntimeRequest(
          MESSAGE_TYPES.FEEDBACK_SUBMITTED,
          {
            tweetId: `tweet-${index}`,
            feedback: "acknowledged",
          },
          { timeoutMs: 100, retries: 0 }
        )
      )
    );

    expect(burst).toHaveLength(25);
    expect(chromeMock.runtime.sendMessage).toHaveBeenCalledTimes(25);
  });

  it("fails with timeout when tab closes and no response is delivered", async () => {
    const chromeMock = getChromeMock();

    chromeMock.tabs.sendMessage.mockImplementation(() => {
      return undefined;
    });

    await expect(
      sendTabRequest(
        404,
        MESSAGE_TYPES.INTERVENTION_TRIGGER,
        {
          tweetId: "pending",
          level: "critical",
          reason: "tab closed",
        },
        { timeoutMs: 20, retries: 1, retryDelayMs: 1 }
      )
    ).rejects.toThrow("timed out");

    expect(chromeMock.tabs.sendMessage).toHaveBeenCalledTimes(2);
  });
});
