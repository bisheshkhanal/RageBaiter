import { describe, expect, it } from "vitest";

import {
  BLOCKED_RESPONSE,
  MAX_QUESTION_LENGTH,
  containsOffensiveContent,
  generateQuestionsForFallacies,
  generateSocraticQuestion,
  getKnownFallacies,
  normalizeFallacyName,
  selectFallbackTemplate,
  truncateQuestion,
} from "../src/lib/socratic-question-generator.js";

describe("normalizeFallacyName", () => {
  it("lowercases and trims whitespace", () => {
    expect(normalizeFallacyName("  Ad Hominem  ")).toBe("ad hominem");
  });

  it("collapses multiple spaces", () => {
    expect(normalizeFallacyName("appeal   to   authority")).toBe("appeal to authority");
  });

  it("handles already-normalized input", () => {
    expect(normalizeFallacyName("strawman")).toBe("strawman");
  });
});

describe("selectFallbackTemplate", () => {
  it("returns a fallacy-specific template for known fallacies", () => {
    const template = selectFallbackTemplate("Ad Hominem");
    expect(template).toContain("personal attacks");
  });

  it("returns the first template when index is 0", () => {
    const first = selectFallbackTemplate("Strawman", 0);
    const second = selectFallbackTemplate("Strawman", 1);
    expect(first).not.toBe(second);
  });

  it("is deterministic: same inputs always produce same output", () => {
    const a = selectFallbackTemplate("Ad Hominem", 0);
    const b = selectFallbackTemplate("Ad Hominem", 0);
    expect(a).toBe(b);
  });

  it("wraps index using modulo for out-of-range values", () => {
    const index0 = selectFallbackTemplate("Strawman", 0);
    const index3 = selectFallbackTemplate("Strawman", 3);
    expect(index0).toBe(index3);
  });

  it("returns generic template for unknown fallacy types", () => {
    const template = selectFallbackTemplate("Totally Made Up Fallacy");
    expect(template).toBe("What evidence would change your mind about this?");
  });

  it("returns generic template for empty string fallacy", () => {
    const template = selectFallbackTemplate("");
    expect(template).toBe("What evidence would change your mind about this?");
  });

  it("selects different generic templates by index", () => {
    const t0 = selectFallbackTemplate("unknown", 0);
    const t1 = selectFallbackTemplate("unknown", 1);
    expect(t0).not.toBe(t1);
  });

  it("handles case-insensitive fallacy names", () => {
    const lower = selectFallbackTemplate("ad hominem", 0);
    const upper = selectFallbackTemplate("AD HOMINEM", 0);
    const mixed = selectFallbackTemplate("Ad Hominem", 0);
    expect(lower).toBe(upper);
    expect(lower).toBe(mixed);
  });

  it("covers all PRD fallacy types from the decision engine", () => {
    const prdFallacies = [
      "Ad Hominem",
      "Strawman",
      "False Dilemma",
      "Appeal to Authority",
      "Hasty Generalization",
      "Slippery Slope",
      "Red Herring",
      "Appeal to Emotion",
      "Bandwagon",
      "Whataboutism",
      "Tu Quoque",
      "Loaded Question",
    ];

    for (const fallacy of prdFallacies) {
      const template = selectFallbackTemplate(fallacy);
      expect(template.length).toBeGreaterThan(0);
      expect(template).not.toBe("What evidence would change your mind about this?");
    }
  });
});

describe("truncateQuestion", () => {
  it("returns input unchanged when within max length", () => {
    const short = "This is a short question?";
    expect(truncateQuestion(short)).toBe(short);
  });

  it("truncates at word boundary with ellipsis", () => {
    const long = "a ".repeat(200).trim();
    const result = truncateQuestion(long);
    expect(result.length).toBeLessThanOrEqual(MAX_QUESTION_LENGTH);
    expect(result).toMatch(/\.\.\.$/);
  });

  it("never exceeds MAX_QUESTION_LENGTH", () => {
    const veryLong = "x".repeat(500);
    const result = truncateQuestion(veryLong);
    expect(result.length).toBeLessThanOrEqual(MAX_QUESTION_LENGTH);
  });

  it("respects custom maxLength parameter", () => {
    const text = "This is a test sentence that is somewhat long";
    const result = truncateQuestion(text, 20);
    expect(result.length).toBeLessThanOrEqual(20);
    expect(result).toMatch(/\.\.\.$/);
  });

  it("handles edge case of maxLength smaller than ellipsis", () => {
    const text = "Hello world";
    const result = truncateQuestion(text, 2);
    expect(result.length).toBeLessThanOrEqual(2);
  });

  it("handles single-word content without spaces", () => {
    const noSpaces = "a".repeat(300);
    const result = truncateQuestion(noSpaces);
    expect(result.length).toBeLessThanOrEqual(MAX_QUESTION_LENGTH);
    expect(result).toMatch(/\.\.\.$/);
  });

  it("preserves exact-length input", () => {
    const exact = "x".repeat(MAX_QUESTION_LENGTH);
    expect(truncateQuestion(exact)).toBe(exact);
  });
});

describe("containsOffensiveContent", () => {
  it("returns false for clean text", () => {
    expect(containsOffensiveContent("What evidence supports this claim?")).toBe(false);
  });

  it("detects slurs", () => {
    expect(containsOffensiveContent("those f@ggots are wrong")).toBe(true);
  });

  it("detects threats of violence", () => {
    expect(containsOffensiveContent("I will kill you for this")).toBe(true);
  });

  it("detects dehumanization language", () => {
    expect(containsOffensiveContent("they are subhuman")).toBe(true);
  });

  it("detects self-harm encouragement", () => {
    expect(containsOffensiveContent("just kys already")).toBe(true);
    expect(containsOffensiveContent("go die loser")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(containsOffensiveContent("KILL YOURSELF")).toBe(true);
  });

  it("returns false for words that partially match but are not offensive", () => {
    expect(containsOffensiveContent("the therapist killed it on stage")).toBe(false);
  });
});

describe("generateSocraticQuestion", () => {
  it("generates a question for a known fallacy", () => {
    const result = generateSocraticQuestion({ fallacy: "Ad Hominem" });
    expect(result.question).toContain("personal attacks");
    expect(result.fallacyNormalized).toBe("ad hominem");
    expect(result.usedFallacyTemplate).toBe(true);
    expect(result.wasBlocked).toBe(false);
    expect(result.wasTruncated).toBe(false);
  });

  it("uses generic template for unknown fallacy", () => {
    const result = generateSocraticQuestion({ fallacy: "Nonexistent Fallacy" });
    expect(result.usedFallacyTemplate).toBe(false);
    expect(result.wasBlocked).toBe(false);
  });

  it("prepends topic context when provided", () => {
    const result = generateSocraticQuestion({ fallacy: "Strawman", topic: "Climate Policy" });
    expect(result.question).toMatch(/^Regarding "Climate Policy":/);
  });

  it("blocks output when topic contains offensive content", () => {
    const result = generateSocraticQuestion({
      fallacy: "Ad Hominem",
      topic: "kill yourself debate",
    });
    expect(result.question).toBe(BLOCKED_RESPONSE);
    expect(result.wasBlocked).toBe(true);
  });

  it("truncates when topic makes output exceed MAX_QUESTION_LENGTH", () => {
    const longTopic = "A".repeat(300);
    const result = generateSocraticQuestion({ fallacy: "Strawman", topic: longTopic });
    expect(result.question.length).toBeLessThanOrEqual(MAX_QUESTION_LENGTH);
    expect(result.wasTruncated).toBe(true);
  });

  it("selects different templates via templateIndex", () => {
    const r0 = generateSocraticQuestion({ fallacy: "Strawman", templateIndex: 0 });
    const r1 = generateSocraticQuestion({ fallacy: "Strawman", templateIndex: 1 });
    expect(r0.question).not.toBe(r1.question);
  });

  it("is fully deterministic with same inputs", () => {
    const a = generateSocraticQuestion({ fallacy: "Whataboutism", templateIndex: 2 });
    const b = generateSocraticQuestion({ fallacy: "Whataboutism", templateIndex: 2 });
    expect(a).toEqual(b);
  });
});

describe("generateQuestionsForFallacies", () => {
  it("generates one result per fallacy", () => {
    const results = generateQuestionsForFallacies(["Ad Hominem", "Strawman", "Bandwagon"]);
    expect(results).toHaveLength(3);
  });

  it("uses incrementing templateIndex for variety", () => {
    const results = generateQuestionsForFallacies(["Strawman", "Strawman", "Strawman"]);
    const questions = results.map((r) => r.question);
    expect(new Set(questions).size).toBe(3);
  });

  it("passes topic to all generated questions", () => {
    const results = generateQuestionsForFallacies(["Ad Hominem"], "Tax Policy");
    expect(results[0]?.question).toMatch(/^Regarding "Tax Policy":/);
  });
});

describe("getKnownFallacies", () => {
  it("returns all 12 PRD fallacy types", () => {
    const known = getKnownFallacies();
    expect(known).toHaveLength(12);
    expect(known).toContain("ad hominem");
    expect(known).toContain("strawman");
    expect(known).toContain("whataboutism");
  });
});

describe("offensive output filtering (integration)", () => {
  it("blocks question when assembled output contains slurs via topic injection", () => {
    const result = generateSocraticQuestion({
      fallacy: "Strawman",
      topic: "those r3tards in congress",
    });
    expect(result.wasBlocked).toBe(true);
    expect(result.question).toBe(BLOCKED_RESPONSE);
  });

  it("blocks question when topic contains murder threats", () => {
    const result = generateSocraticQuestion({
      fallacy: "Ad Hominem",
      topic: "murder them all",
    });
    expect(result.wasBlocked).toBe(true);
    expect(result.question).toBe(BLOCKED_RESPONSE);
  });

  it("does not block legitimate political discussion topics", () => {
    const safePoliticalTopics = [
      "Immigration Reform",
      "Gun Control Debate",
      "Healthcare Policy",
      "Tax Reform",
      "Climate Change",
      "Foreign Policy",
    ];

    for (const topic of safePoliticalTopics) {
      const result = generateSocraticQuestion({ fallacy: "Strawman", topic });
      expect(result.wasBlocked).toBe(false);
      expect(result.question).not.toBe(BLOCKED_RESPONSE);
    }
  });

  it("blocks dehumanization in topic", () => {
    const result = generateSocraticQuestion({
      fallacy: "Bandwagon",
      topic: "they are vermin who should be removed",
    });
    expect(result.wasBlocked).toBe(true);
  });
});
