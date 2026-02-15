import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { startTwitterScraper } from "../src/content/content-script.js";

type DebugWindow = Window & {
  __RAGEBAITER_SCRAPER_DISABLED__?: boolean;
};

type IntersectionTarget = Element;

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];

  readonly observe = vi.fn((target: IntersectionTarget) => {
    this.targets.add(target);
  });

  readonly unobserve = vi.fn((target: IntersectionTarget) => {
    this.targets.delete(target);
  });

  readonly disconnect = vi.fn(() => {
    this.targets.clear();
  });

  private readonly targets = new Set<IntersectionTarget>();

  constructor(private readonly callback: IntersectionObserverCallback) {
    MockIntersectionObserver.instances.push(this);
  }

  triggerVisible(targets?: IntersectionTarget[]): void {
    const visibleTargets = targets ?? Array.from(this.targets);
    const entries = visibleTargets.map((target) => ({
      target,
      isIntersecting: true,
      intersectionRatio: 1,
      time: 0,
      boundingClientRect: {} as DOMRectReadOnly,
      intersectionRect: {} as DOMRectReadOnly,
      rootBounds: null,
    }));

    this.callback(entries as IntersectionObserverEntry[], this as unknown as IntersectionObserver);
  }
}

const createTweet = (id: string, handle = "user", text = `tweet-${id}`): string => `
  <article data-testid="tweet">
    <a href="/${handle}/status/${id}"><time datetime="2026-02-14T10:00:00.000Z"></time></a>
    <div data-testid="User-Name"><a href="/${handle}">${handle}</a></div>
    <div data-testid="tweetText">${text}</div>
    <button data-testid="reply"><span data-testid="app-text-transition-container">1</span></button>
    <button data-testid="retweet"><span data-testid="app-text-transition-container">2</span></button>
    <button data-testid="like"><span data-testid="app-text-transition-container">3</span></button>
  </article>
`;

const createFallbackTweet = (id: string, handle = "user", text = `tweet-${id}`): string => `
  <article role="article">
    <a href="/${handle}/status/${id}"><time datetime="2026-02-14T10:00:00.000Z"></time></a>
    <div data-testid="User-Name"><a href="/${handle}">${handle}</a></div>
    <div data-testid="tweetText">${text}</div>
    <button data-testid="reply"><span data-testid="app-text-transition-container">1</span></button>
    <button data-testid="retweet"><span data-testid="app-text-transition-container">2</span></button>
    <button data-testid="like"><span data-testid="app-text-transition-container">3</span></button>
  </article>
`;

const flushMutations = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

const getObserver = (): MockIntersectionObserver => {
  const observer = MockIntersectionObserver.instances[0];

  if (!observer) {
    throw new Error("IntersectionObserver was not created");
  }

  return observer;
};

describe("content script observer pipeline", () => {
  const nativeIntersectionObserver = globalThis.IntersectionObserver;

  beforeEach(() => {
    MockIntersectionObserver.instances = [];
    document.body.innerHTML = "";
    (window as DebugWindow).__RAGEBAITER_SCRAPER_DISABLED__ = undefined;
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (nativeIntersectionObserver) {
      globalThis.IntersectionObserver = nativeIntersectionObserver;
    }
  });

  it("processes thread tweets, dedupes rapid bursts by tweetId, and sends runtime messages", async () => {
    document.body.innerHTML = `
      <section id="timeline">
        ${createTweet("111", "threader", "Thread part 1")}
        ${createTweet("112", "threader", "Thread part 2")}
      </section>
    `;

    const controller = startTwitterScraper();
    const observer = getObserver();
    const chromeMock = (globalThis as unknown as { chrome: unknown }).chrome as ReturnType<
      typeof import("../../__tests__/mocks/chrome.js").createChromeMock
    >;

    observer.triggerVisible();

    const timeline = document.getElementById("timeline");
    timeline?.insertAdjacentHTML("beforeend", createTweet("111", "threader", "Duplicate id"));
    timeline?.insertAdjacentHTML("beforeend", createTweet("113", "threader", "Thread part 3"));
    timeline?.insertAdjacentHTML("beforeend", createTweet("113", "threader", "Duplicate burst"));

    await flushMutations();
    observer.triggerVisible();

    expect(chromeMock.runtime.sendMessage).toHaveBeenCalledTimes(3);
    expect(chromeMock.runtime.sendMessage).toHaveBeenNthCalledWith(
      1,
      {
        type: "TWEET_DETECTED",
        payload: expect.objectContaining({ tweetId: "111" }),
        id: expect.any(String),
      },
      expect.any(Function)
    );
    expect(chromeMock.runtime.sendMessage).toHaveBeenNthCalledWith(
      2,
      {
        type: "TWEET_DETECTED",
        payload: expect.objectContaining({ tweetId: "112" }),
        id: expect.any(String),
      },
      expect.any(Function)
    );
    expect(chromeMock.runtime.sendMessage).toHaveBeenNthCalledWith(
      3,
      {
        type: "TWEET_DETECTED",
        payload: expect.objectContaining({ tweetId: "113" }),
        id: expect.any(String),
      },
      expect.any(Function)
    );

    controller.stop();
  });

  it("unobserves tweets removed from DOM before processing", async () => {
    const controller = startTwitterScraper();
    const observer = getObserver();

    const container = document.createElement("div");
    container.innerHTML = createTweet("220", "removed", "to be removed");
    const tweet = container.firstElementChild as HTMLElement;

    document.body.appendChild(tweet);
    await flushMutations();
    expect(observer.observe).toHaveBeenCalledWith(tweet);

    tweet.remove();
    await flushMutations();

    expect(observer.unobserve).toHaveBeenCalledWith(tweet);

    controller.stop();
  });

  it("falls back to role-based tweet selector when legacy selector drifts", () => {
    document.body.innerHTML = createFallbackTweet("240", "fallback", "selector fallback works");

    const controller = startTwitterScraper();
    const observer = getObserver();
    const chromeMock = (globalThis as unknown as { chrome: unknown }).chrome as ReturnType<
      typeof import("../../__tests__/mocks/chrome.js").createChromeMock
    >;

    observer.triggerVisible();

    expect(chromeMock.runtime.sendMessage).toHaveBeenCalledTimes(1);
    expect(chromeMock.runtime.sendMessage).toHaveBeenNthCalledWith(
      1,
      {
        type: "TWEET_DETECTED",
        payload: expect.objectContaining({ tweetId: "240" }),
        id: expect.any(String),
      },
      expect.any(Function)
    );

    controller.stop();
  });

  it("disables gracefully and sets debug flag when no tweet selector matches", () => {
    document.body.innerHTML = `<main><div data-testid="timeline-empty">No tweets here</div></main>`;

    const controller = startTwitterScraper();

    expect((window as DebugWindow).__RAGEBAITER_SCRAPER_DISABLED__).toBe(true);
    expect(() => controller.stop()).not.toThrow();

    const chromeMock = (globalThis as unknown as { chrome: unknown }).chrome as ReturnType<
      typeof import("../../__tests__/mocks/chrome.js").createChromeMock
    >;
    expect(chromeMock.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it("handles SPA route changes and stops observers on unload cleanup", async () => {
    document.body.innerHTML = createTweet("331", "router", "first route");
    const controller = startTwitterScraper();
    const observer = getObserver();
    const chromeMock = (globalThis as unknown as { chrome: unknown }).chrome as ReturnType<
      typeof import("../../__tests__/mocks/chrome.js").createChromeMock
    >;

    observer.triggerVisible();
    expect(chromeMock.runtime.sendMessage).toHaveBeenCalledTimes(1);

    document.body.innerHTML = createTweet("331", "router", "same id on new route");
    window.history.pushState({}, "", "/new-route");
    observer.triggerVisible();

    expect(chromeMock.runtime.sendMessage).toHaveBeenCalledTimes(2);

    window.dispatchEvent(new Event("beforeunload"));

    document.body.insertAdjacentHTML("beforeend", createTweet("999", "router", "post-cleanup"));
    await flushMutations();
    observer.triggerVisible();

    expect(chromeMock.runtime.sendMessage).toHaveBeenCalledTimes(2);

    controller.stop();
  });
});
