import { describe, expect, it, vi } from "vitest";

import { createGeminiTweetAnalyzer, geminiAnalyzerInternals } from "./gemini-analyzer.js";

const createJsonResponse = (payload: unknown, status = 200, headers?: Record<string, string>) => {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...(headers ?? {}),
    },
  });
};

const createGeminiPayload = (text: string) => {
  return {
    candidates: [
      {
        content: {
          parts: [{ text }],
        },
      },
    ],
    usageMetadata: {
      promptTokenCount: 12,
      candidatesTokenCount: 8,
      totalTokenCount: 20,
    },
  };
};

describe("createGeminiTweetAnalyzer", () => {
  it("handles malformed JSON gracefully", async () => {
    const fetchImpl = vi.fn(async () => {
      return createJsonResponse(createGeminiPayload("not-json"));
    });

    const analyzer = createGeminiTweetAnalyzer({
      apiKey: "test-key",
      fetchImpl,
      sleep: vi.fn(async () => undefined),
      rateLimiter: {
        acquire: vi.fn(async () => undefined),
      },
    });

    const result = await analyzer("tweet-1", "text");

    expect(result).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("clamps out-of-range vector and confidence values", async () => {
    const fetchImpl = vi.fn(async () => {
      return createJsonResponse(
        createGeminiPayload(
          JSON.stringify({
            tweet_vector: {
              social: 2.5,
              economic: -9,
              populist: 0.2,
            },
            fallacies: ["Strawman"],
            topic: "Policy",
            confidence: 9,
          })
        )
      );
    });

    const analyzer = createGeminiTweetAnalyzer({
      apiKey: "test-key",
      fetchImpl,
      sleep: vi.fn(async () => undefined),
      rateLimiter: {
        acquire: vi.fn(async () => undefined),
      },
    });

    const result = await analyzer("tweet-2", "text");

    expect(result).not.toBeNull();
    if (!result) {
      throw new Error("Expected analysis result");
    }

    expect(result.tweetVector).toEqual({
      social: 1,
      economic: -1,
      populist: 0.2,
    });
    expect(result.confidence).toBe(1);
  });

  it("retries timeout failures up to max attempts then returns null", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new DOMException("timed out", "AbortError");
    });
    const sleepSpy = vi.fn(async () => undefined);

    const analyzer = createGeminiTweetAnalyzer({
      apiKey: "test-key",
      fetchImpl,
      sleep: sleepSpy,
      rateLimiter: {
        acquire: vi.fn(async () => undefined),
      },
    });

    const result = await analyzer("tweet-3", "text");

    expect(result).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleepSpy).toHaveBeenNthCalledWith(1, 200);
    expect(sleepSpy).toHaveBeenNthCalledWith(2, 400);
  });

  it("applies 429 retry-after backoff", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        createJsonResponse({ error: "rate limited" }, 429, { "retry-after": "1" })
      )
      .mockResolvedValueOnce(
        createJsonResponse(
          createGeminiPayload(
            JSON.stringify({
              tweet_vector: { social: 0.1, economic: 0.2, populist: 0.3 },
              fallacies: ["Ad Hominem"],
              topic: "Elections",
              confidence: 0.6,
            })
          )
        )
      );
    const sleepSpy = vi.fn(async () => undefined);

    const analyzer = createGeminiTweetAnalyzer({
      apiKey: "test-key",
      fetchImpl,
      sleep: sleepSpy,
      rateLimiter: {
        acquire: vi.fn(async () => undefined),
      },
    });

    const result = await analyzer("tweet-4", "text");

    expect(result).not.toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleepSpy).toHaveBeenCalledWith(1000);
  });

  it("returns null for empty tweet text without calling Gemini", async () => {
    const fetchImpl = vi.fn();

    const analyzer = createGeminiTweetAnalyzer({
      apiKey: "test-key",
      fetchImpl: fetchImpl as typeof fetch,
      rateLimiter: {
        acquire: vi.fn(async () => undefined),
      },
    });

    const result = await analyzer("tweet-5", "   ");

    expect(result).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("handles non-English tweet text with best-effort analysis", async () => {
    const fetchImpl = vi.fn(async () => {
      return createJsonResponse(
        createGeminiPayload(
          JSON.stringify({
            tweet_vector: { social: -0.2, economic: 0.4, populist: 0.1 },
            fallacies: ["False Dilemma"],
            topic: "Politica",
            confidence: 0.77,
          })
        )
      );
    });

    const analyzer = createGeminiTweetAnalyzer({
      apiKey: "test-key",
      fetchImpl,
      rateLimiter: {
        acquire: vi.fn(async () => undefined),
      },
      sleep: vi.fn(async () => undefined),
    });

    const result = await analyzer("tweet-6", "Este gobierno necesita una reforma fiscal");

    expect(result).not.toBeNull();
    if (!result) {
      throw new Error("Expected analysis result");
    }
    expect(result.topic).toBe("Politica");
  });

  it("deterministically truncates long tweet text before request", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const bodyText = typeof init?.body === "string" ? init.body : "";
      const parsedBody = JSON.parse(bodyText) as {
        contents: Array<{ parts: Array<{ text: string }> }>;
      };

      const prompt = parsedBody.contents[0]?.parts[0]?.text ?? "";
      expect(prompt.includes("abcdefghij")).toBe(true);
      expect(prompt.includes("abcdefghijk")).toBe(false);

      return createJsonResponse(
        createGeminiPayload(
          JSON.stringify({
            tweet_vector: { social: 0, economic: 0, populist: 0 },
            fallacies: [],
            topic: "General",
            confidence: 0.5,
          })
        )
      );
    });

    const analyzer = createGeminiTweetAnalyzer({
      apiKey: "test-key",
      fetchImpl: fetchImpl as typeof fetch,
      maxInputChars: 10,
      rateLimiter: {
        acquire: vi.fn(async () => undefined),
      },
      sleep: vi.fn(async () => undefined),
    });

    const result = await analyzer("tweet-7", "abcdefghijk");

    expect(result).not.toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(geminiAnalyzerInternals.truncateDeterministically("abcdefghijk", 10)).toBe("abcdefghij");
  });

  it("returns null gracefully when API key is missing", async () => {
    const fetchImpl = vi.fn();
    const warn = vi.fn();

    const analyzer = createGeminiTweetAnalyzer({
      apiKey: "",
      fetchImpl: fetchImpl as typeof fetch,
      logger: {
        info: vi.fn(),
        warn,
      },
      rateLimiter: {
        acquire: vi.fn(async () => undefined),
      },
    });

    const result = await analyzer("tweet-8", "hello");

    expect(result).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
