import { describe, expect, it } from "vitest";

import {
  type PoliticalSensitivity,
  POLITICAL_KEYWORDS,
  isPolitical,
} from "./political-keyword-filter.js";

describe("political keyword dictionary", () => {
  it("contains at least 200 political keywords", () => {
    expect(POLITICAL_KEYWORDS.length).toBeGreaterThanOrEqual(200);
  });
});

describe("isPolitical", () => {
  it("returns false for clearly apolitical content", () => {
    const result = isPolitical("Big game tonight, pizza and memes after shipping this bug fix.");

    expect(result.isPolitical).toBe(false);
    expect(result.matchedKeywords).toEqual([]);
    expect(result.confidence).toBe(0);
  });

  it("handles ambiguous terms with sensitivity thresholds", () => {
    const ambiguous = isPolitical("Need better tax software before filing season.", "medium");
    expect(ambiguous.isPolitical).toBe(false);

    const policyContext = isPolitical(
      "The senate passed a tax policy bill after committee debate.",
      "medium"
    );
    expect(policyContext.isPolitical).toBe(true);
    expect(policyContext.matchedKeywords.length).toBeGreaterThanOrEqual(3);
  });

  it("handles hashtag-only tweets", () => {
    const result = isPolitical("#Election #Vote #Democracy", "medium");

    expect(result.isPolitical).toBe(true);
    expect(result.matchedKeywords).toEqual(
      expect.arrayContaining(["election", "vote", "democracy"])
    );
  });

  it("returns safe defaults for empty string", () => {
    const result = isPolitical("", "high");
    expect(result).toEqual({ isPolitical: false, matchedKeywords: [], confidence: 0 });
  });

  it("handles very long strings (10k+ chars)", () => {
    const longText = `${"lorem ipsum ".repeat(900)} election vote democracy senate`;
    const result = isPolitical(longText, "medium");

    expect(longText.length).toBeGreaterThan(10_000);
    expect(result.isPolitical).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it("normalizes unicode and emoji-heavy text", () => {
    const result = isPolitical("🗳️ DEM0CRACY now!!! 🇺🇸 #V0TE #elEctIon", "medium");

    expect(result.isPolitical).toBe(true);
    expect(result.matchedKeywords).toEqual(
      expect.arrayContaining(["democracy", "election", "vote"])
    );
  });

  it("matches mixed-case inputs", () => {
    const result = isPolitical("The PrEsIdEnT addressed CONGRESS and the SenAte.", "medium");

    expect(result.isPolitical).toBe(true);
    expect(result.matchedKeywords).toEqual(
      expect.arrayContaining(["president", "congress", "senate"])
    );
  });

  it("normalizes common obfuscations", () => {
    const result = isPolitical("b1den and tr*mp debated at the white house", "medium");

    expect(result.isPolitical).toBe(true);
    expect(result.matchedKeywords).toEqual(
      expect.arrayContaining(["biden", "trump", "white house"])
    );
  });

  it("applies exact sensitivity thresholds: low=10+, medium=3+, high=1+", () => {
    const tenKeywordTweet =
      "vote election senate congress policy bill campaign government democracy president";

    expect(isPolitical(tenKeywordTweet, "low").isPolitical).toBe(true);
    expect(isPolitical("vote election", "low").isPolitical).toBe(false);
    expect(isPolitical("vote election senate", "medium").isPolitical).toBe(true);
    expect(isPolitical("vote election", "medium").isPolitical).toBe(false);
    expect(isPolitical("vote", "high").isPolitical).toBe(true);
  });

  it("keeps confidence clamped to [0, 1]", () => {
    const result = isPolitical("election election election election election election", "high");
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it("tracks false positives guard on non-political finance sentence", () => {
    const result = isPolitical(
      "My accountant filed our tax return and budget worksheet.",
      "medium"
    );
    expect(result.isPolitical).toBe(false);
  });

  it("tracks false negatives guard on obvious political sentence", () => {
    const result = isPolitical("Congress and the senate debated election reform policy.", "medium");
    expect(result.isPolitical).toBe(true);
  });

  it("defaults to medium sensitivity when omitted", () => {
    const text = "election vote";
    const explicit = isPolitical(text, "medium");
    const implicit = isPolitical(text);

    expect(implicit).toEqual(explicit);
  });

  it("supports all sensitivity presets", () => {
    const sensitivities: PoliticalSensitivity[] = ["low", "medium", "high"];
    const text = "election vote senate congress";

    for (const sensitivity of sensitivities) {
      const result = isPolitical(text, sensitivity);
      expect(typeof result.isPolitical).toBe("boolean");
    }
  });
});
