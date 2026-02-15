import { vi } from "vitest";

export type LlmAnalysisResult = {
  sentiment: "neutral" | "positive" | "negative";
  score: number;
  rationale: string;
};

export const createLlmSdkMock = (overrides: Partial<LlmAnalysisResult> = {}) => {
  const base: LlmAnalysisResult = {
    sentiment: "neutral",
    score: 0,
    rationale: "deterministic test response",
    ...overrides,
  };

  return {
    analyzeText: vi.fn(async (_input: string): Promise<LlmAnalysisResult> => base),
    summarize: vi.fn(
      async (_input: string): Promise<string> => `summary:${base.sentiment}:${base.score}`
    ),
  };
};
