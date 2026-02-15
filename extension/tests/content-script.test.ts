import { describe, expect, it } from "vitest";

import { extractTweetPayload } from "../src/content/content-script.js";

const createTweetElement = (markup: string): HTMLElement => {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = markup.trim();
  return wrapper.firstElementChild as HTMLElement;
};

describe("content script extraction", () => {
  it("extracts payload for media-only tweet with empty text", () => {
    const tweetElement = createTweetElement(`
      <article data-testid="tweet">
        <a href="/alice/status/1001"><time datetime="2026-02-14T10:00:00.000Z"></time></a>
        <div data-testid="User-Name"><a href="/alice">Alice</a></div>
        <div data-testid="media"></div>
        <button data-testid="reply"><span data-testid="app-text-transition-container">4</span></button>
        <button data-testid="retweet"><span data-testid="app-text-transition-container">12</span></button>
        <button data-testid="like"><span data-testid="app-text-transition-container">30</span></button>
      </article>
    `);

    const payload = extractTweetPayload(tweetElement);

    expect(payload).toEqual({
      tweetId: "1001",
      tweetText: "",
      authorHandle: "alice",
      timestamp: "2026-02-14T10:00:00.000Z",
      engagementMetrics: {
        replies: 4,
        retweets: 12,
        likes: 30,
      },
    });
  });

  it("prefers outer tweet structure for quote/retweet nested article", () => {
    const tweetElement = createTweetElement(`
      <article data-testid="tweet">
        <a href="/bob/status/2002"><time datetime="2026-02-14T11:00:00.000Z"></time></a>
        <div data-testid="User-Name"><a href="/bob">Bob</a></div>
        <div data-testid="tweetText">Outer tweet text</div>
        <article data-testid="tweet">
          <a href="/carol/status/9999"><time datetime="2026-02-14T09:00:00.000Z"></time></a>
          <div data-testid="tweetText">Nested quote text</div>
        </article>
      </article>
    `);

    const payload = extractTweetPayload(tweetElement);

    expect(payload?.tweetId).toBe("2002");
    expect(payload?.authorHandle).toBe("bob");
    expect(payload?.tweetText).toBe("Outer tweet text");
    expect(payload?.timestamp).toBe("2026-02-14T11:00:00.000Z");
  });

  it("falls back to defensive selectors for text and aria-label metrics", () => {
    const tweetElement = createTweetElement(`
      <article data-testid="tweet">
        <a href="/dana/status/3003"><time datetime="2026-02-14T12:00:00.000Z"></time></a>
        <div data-testid="User-Name"><a href="/dana">Dana</a></div>
        <div lang="en">Fallback text selector still works</div>
        <div role="button" aria-label="21 replies"></div>
        <div role="button" aria-label="3 reposts"></div>
        <div role="button" aria-label="1.2K likes"></div>
      </article>
    `);

    const payload = extractTweetPayload(tweetElement);

    expect(payload?.tweetText).toBe("Fallback text selector still works");
    expect(payload?.engagementMetrics).toEqual({
      replies: 21,
      retweets: 3,
      likes: 1200,
    });
  });

  it("returns payload with fallback tweetId when no status link is present", () => {
    const tweetElement = createTweetElement(`
      <article data-testid="tweet">
        <div data-testid="User-Name"><a href="/eve">Eve</a></div>
        <time datetime="2026-02-15T08:00:00.000Z"></time>
        <div data-testid="tweetText">Demo tweet without status link</div>
        <button data-testid="reply"><span data-testid="app-text-transition-container">5</span></button>
        <button data-testid="retweet"><span data-testid="app-text-transition-container">10</span></button>
        <button data-testid="like"><span data-testid="app-text-transition-container">15</span></button>
      </article>
    `);

    const payload = extractTweetPayload(tweetElement);

    expect(payload).not.toBeNull();
    expect(payload?.tweetId).toMatch(/^fallback_\d+$/);
    expect(payload?.authorHandle).toBe("eve");
    expect(payload?.tweetText).toBe("Demo tweet without status link");
    expect(payload?.timestamp).toBe("2026-02-15T08:00:00.000Z");
  });

  it("generates consistent fallback tweetId for same content", () => {
    const markup = `
      <article data-testid="tweet">
        <div data-testid="User-Name"><a href="/frank">Frank</a></div>
        <time datetime="2026-02-15T09:00:00.000Z"></time>
        <div data-testid="tweetText">Consistent content test</div>
      </article>
    `;

    const element1 = createTweetElement(markup);
    const element2 = createTweetElement(markup);

    const payload1 = extractTweetPayload(element1);
    const payload2 = extractTweetPayload(element2);

    expect(payload1?.tweetId).toBe(payload2?.tweetId);
    expect(payload1?.tweetId).toMatch(/^fallback_\d+$/);
  });
});
