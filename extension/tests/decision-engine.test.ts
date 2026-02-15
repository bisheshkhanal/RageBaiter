import { afterEach, describe, expect, it, vi } from "vitest";

import { createDecisionEngine } from "../src/background/decision-engine.js";

describe("decision engine", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns CRITICAL for identical vectors with fallacies", () => {
    const engine = createDecisionEngine({ now: () => 1_000 });

    const decision = engine.evaluateTweet(
      {
        tweetId: "same",
        topic: "Tax Policy",
        confidence: 0.9,
        tweetVector: { social: 0.1, economic: -0.3, populist: 0.4 },
        fallacies: ["Strawman"],
      },
      {
        userVector: { social: 0.1, economic: -0.3, populist: 0.4 },
      }
    );

    expect(decision.level).toBe("critical");
    expect(decision.shouldIntervene).toBe(true);
    expect(decision.distance).toBe(0);
  });

  it("returns NONE for opposite vectors", () => {
    const engine = createDecisionEngine({ now: () => 1_000 });

    const decision = engine.evaluateTweet(
      {
        tweetId: "opposite",
        topic: "Partisan Rhetoric",
        confidence: 0.8,
        tweetVector: { social: 1, economic: 1, populist: 1 },
        fallacies: ["Ad Hominem", "Whataboutism"],
      },
      {
        userVector: { social: -1, economic: -1, populist: -1 },
      }
    );

    expect(decision.level).toBe("none");
    expect(decision.shouldIntervene).toBe(false);
    expect(decision.distance).toBeGreaterThan(0.4);
  });

  it("returns LOW for echo-chamber band with no fallacies", () => {
    const engine = createDecisionEngine({ now: () => 1_000 });

    const decision = engine.evaluateTweet(
      {
        tweetId: "no-fallacy",
        topic: "Healthcare",
        confidence: 0.7,
        tweetVector: { social: 0.1, economic: 0, populist: 0 },
        fallacies: [],
      },
      {
        userVector: { social: 0, economic: 0, populist: 0 },
      }
    );

    expect(decision.level).toBe("low");
    expect(decision.weightedFallacyScore).toBe(0);
  });

  it("keeps PRD level and increases severity score for multi-fallacy escalation", () => {
    const engine = createDecisionEngine({ now: () => 1_000 });

    const mild = engine.evaluateTweet(
      {
        tweetId: "mild",
        topic: "Immigration",
        confidence: 0.75,
        tweetVector: { social: 0.3, economic: 0, populist: 0 },
        fallacies: ["Bandwagon", "Appeal to Authority"],
      },
      {
        userVector: { social: 0, economic: 0, populist: 0 },
      }
    );

    engine.resetCooldown();

    const severe = engine.evaluateTweet(
      {
        tweetId: "severe",
        topic: "Immigration",
        confidence: 0.75,
        tweetVector: { social: 0.3, economic: 0, populist: 0 },
        fallacies: ["Strawman", "Ad Hominem"],
      },
      {
        userVector: { social: 0, economic: 0, populist: 0 },
      }
    );

    expect(mild.level).toBe("medium");
    expect(severe.level).toBe("medium");
    expect(severe.weightedFallacyScore).toBeGreaterThan(mild.weightedFallacyScore);
    expect(severe.severityBand).toBe("high");
  });

  it("skips intervention when cooldown is active", () => {
    let nowMs = 1_000;
    const engine = createDecisionEngine({ now: () => nowMs });

    const first = engine.evaluateTweet(
      {
        tweetId: "first",
        topic: "Policy",
        confidence: 0.8,
        tweetVector: { social: 0.1, economic: 0, populist: 0 },
        fallacies: ["Ad Hominem"],
      },
      {
        userVector: { social: 0, economic: 0, populist: 0 },
      }
    );

    nowMs = 1_020;

    const second = engine.evaluateTweet(
      {
        tweetId: "second",
        topic: "Policy",
        confidence: 0.8,
        tweetVector: { social: 0.1, economic: 0, populist: 0 },
        fallacies: ["Ad Hominem"],
      },
      {
        userVector: { social: 0, economic: 0, populist: 0 },
      }
    );

    expect(first.level).toBe("critical");
    expect(second.level).toBe("none");
    expect(second.cooldown.active).toBe(true);
    expect(second.cooldown.wouldHaveTriggeredLevel).toBe("critical");
    expect(second.action).toContain("SKIP_COOLDOWN");
  });

  it("supports minimum and maximum threshold overrides", () => {
    const minEngine = createDecisionEngine({ now: () => 1_000 });
    const minDecision = minEngine.evaluateTweet(
      {
        tweetId: "min-threshold",
        topic: "Topic",
        confidence: 0.7,
        tweetVector: { social: -1, economic: -1, populist: -1 },
        fallacies: [],
      },
      {
        userVector: { social: 1, economic: 1, populist: 1 },
        decisionConfig: {
          thresholds: {
            echoChamberMaxDistance: 4,
            mildBiasMaxDistance: 4,
          },
        },
      }
    );

    const maxEngine = createDecisionEngine({ now: () => 1_000 });
    const maxDecision = maxEngine.evaluateTweet(
      {
        tweetId: "max-threshold",
        topic: "Topic",
        confidence: 0.7,
        tweetVector: { social: 0, economic: 0, populist: 0 },
        fallacies: ["Strawman", "Ad Hominem"],
      },
      {
        userVector: { social: 0, economic: 0, populist: 0 },
        decisionConfig: {
          thresholds: {
            echoChamberMaxDistance: -1,
            mildBiasMaxDistance: -1,
          },
        },
      }
    );

    expect(minDecision.level).toBe("low");
    expect(maxDecision.level).toBe("none");
  });

  it("applies exact PRD threshold boundaries", () => {
    const engine = createDecisionEngine({ now: () => 1_000 });

    const mediumBoundary = engine.evaluateTweet(
      {
        tweetId: "boundary-medium",
        topic: "Topic",
        confidence: 0.7,
        tweetVector: { social: 0.2, economic: 0, populist: 0 },
        fallacies: ["Strawman", "Ad Hominem"],
      },
      {
        userVector: { social: 0, economic: 0, populist: 0 },
      }
    );

    engine.resetCooldown();

    const noneBoundary = engine.evaluateTweet(
      {
        tweetId: "boundary-none",
        topic: "Topic",
        confidence: 0.7,
        tweetVector: { social: 0.401, economic: 0, populist: 0 },
        fallacies: ["Strawman", "Ad Hominem"],
      },
      {
        userVector: { social: 0, economic: 0, populist: 0 },
      }
    );

    expect(mediumBoundary.level).toBe("medium");
    expect(noneBoundary.level).toBe("none");
  });

  it("works with deterministic fake timers for cooldown", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-14T00:00:00.000Z"));

    const engine = createDecisionEngine({ now: () => Date.now() });

    const profile = {
      userVector: { social: 0, economic: 0, populist: 0 },
    };

    const analysis = {
      tweetId: "timer-cooldown",
      topic: "Policy",
      confidence: 0.8,
      tweetVector: { social: 0.1, economic: 0, populist: 0 },
      fallacies: ["Ad Hominem"],
    };

    const first = engine.evaluateTweet(analysis, profile);

    vi.advanceTimersByTime(29_000);
    const duringCooldown = engine.evaluateTweet(
      { ...analysis, tweetId: "timer-cooldown-2" },
      profile
    );

    vi.advanceTimersByTime(2_000);
    const afterCooldown = engine.evaluateTweet(
      { ...analysis, tweetId: "timer-cooldown-3" },
      profile
    );

    expect(first.level).toBe("critical");
    expect(duringCooldown.level).toBe("none");
    expect(afterCooldown.level).toBe("critical");
  });

  it("emits machine-parseable PRD decision tree log format", () => {
    const engine = createDecisionEngine({ now: () => 1_000 });

    const decision = engine.evaluateTweet(
      {
        tweetId: "log-check",
        topic: "Climate",
        confidence: 0.8,
        tweetVector: { social: 0.12, economic: 0.01, populist: 0.02 },
        fallacies: ["Ad Hominem"],
      },
      {
        userVector: { social: 0.1, economic: 0, populist: 0 },
      }
    );

    expect(decision.log.tree).toMatch(
      /^Tweet Detected -> Topic: .* -> Bias Score: .* -> User Bias: .* -> Distance: .* -> /
    );
    expect(decision.log.fields).toEqual(
      expect.objectContaining({
        topic: "Climate",
        decision: "critical",
      })
    );
  });
});
