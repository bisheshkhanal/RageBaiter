import { describe, expect, it, vi, beforeEach } from "vitest";

import {
  QUIZ_QUESTIONS,
  QUIZ_QUESTION_COUNT,
  LIKERT_OPTIONS,
  isValidLikertValue,
} from "../src/lib/quiz-data.js";
import {
  calculateQuizVector,
  validateAnswers,
  createQuizResult,
  hasCompletedQuiz,
  getStoredQuizResult,
  storeQuizResult,
  clearQuizResult,
  type QuizAnswer,
} from "../src/lib/quiz-scorer.js";

type ChromeMock = ReturnType<typeof import("../../__tests__/mocks/chrome.js").createChromeMock>;

describe("quiz-data", () => {
  describe("QUIZ_QUESTIONS", () => {
    it("has exactly 18 questions", () => {
      expect(QUIZ_QUESTIONS.length).toBe(18);
      expect(QUIZ_QUESTION_COUNT).toBe(18);
    });

    it("covers all three axes", () => {
      const socialCount = QUIZ_QUESTIONS.filter((q) => q.axis === "social").length;
      const economicCount = QUIZ_QUESTIONS.filter((q) => q.axis === "economic").length;
      const populistCount = QUIZ_QUESTIONS.filter((q) => q.axis === "populist").length;

      expect(socialCount).toBe(6);
      expect(economicCount).toBe(6);
      expect(populistCount).toBe(6);
    });

    it("has unique question IDs", () => {
      const ids = QUIZ_QUESTIONS.map((q) => q.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it("has IDs in range 1-18", () => {
      QUIZ_QUESTIONS.forEach((q) => {
        expect(q.id).toBeGreaterThanOrEqual(1);
        expect(q.id).toBeLessThanOrEqual(18);
      });
    });

    it("has non-empty question text", () => {
      QUIZ_QUESTIONS.forEach((q) => {
        expect(q.text.length).toBeGreaterThan(0);
      });
    });
  });

  describe("LIKERT_OPTIONS", () => {
    it("has 5 options", () => {
      expect(LIKERT_OPTIONS.length).toBe(5);
    });

    it("has values normalized to [-1, 1]", () => {
      expect(LIKERT_OPTIONS.map((o) => o.value)).toEqual([-1.0, -0.5, 0.0, 0.5, 1.0]);
    });
  });

  describe("isValidLikertValue", () => {
    it("returns true for valid Likert values", () => {
      expect(isValidLikertValue(-1.0)).toBe(true);
      expect(isValidLikertValue(-0.5)).toBe(true);
      expect(isValidLikertValue(0.0)).toBe(true);
      expect(isValidLikertValue(0.5)).toBe(true);
      expect(isValidLikertValue(1.0)).toBe(true);
    });

    it("returns false for invalid values", () => {
      expect(isValidLikertValue(-2.0)).toBe(false);
      expect(isValidLikertValue(2.0)).toBe(false);
      expect(isValidLikertValue(0.25)).toBe(false);
      expect(isValidLikertValue(0.75)).toBe(false);
      expect(isValidLikertValue(NaN)).toBe(false);
    });
  });
});

describe("quiz-scorer", () => {
  describe("calculateQuizVector", () => {
    it("produces zero vector for all neutral answers", () => {
      const answers: QuizAnswer[] = QUIZ_QUESTIONS.map((q) => ({
        questionId: q.id,
        value: 0.0 as const,
      }));

      const vector = calculateQuizVector(answers);

      expect(vector.social).toBe(0);
      expect(vector.economic).toBe(0);
      expect(vector.populist).toBe(0);
    });

    it("produces boundary vector for all extreme progressive/left answers", () => {
      const answers: QuizAnswer[] = QUIZ_QUESTIONS.map((q) => ({
        questionId: q.id,
        value: (q.inverted ? -1.0 : 1.0) as 1.0 | -1.0,
      }));

      const vector = calculateQuizVector(answers);

      expect(vector.social).toBeGreaterThan(0.5);
      expect(vector.economic).toBeGreaterThan(0.5);
      expect(vector.populist).toBeGreaterThan(0.5);
    });

    it("produces negative boundary vector for all extreme conservative/right answers", () => {
      const answers: QuizAnswer[] = QUIZ_QUESTIONS.map((q) => ({
        questionId: q.id,
        value: (q.inverted ? 1.0 : -1.0) as 1.0 | -1.0,
      }));

      const vector = calculateQuizVector(answers);

      expect(vector.social).toBeLessThan(-0.5);
      expect(vector.economic).toBeLessThan(-0.5);
      expect(vector.populist).toBeLessThan(-0.5);
    });

    it("clamps results to [-1, 1] range", () => {
      const answers: QuizAnswer[] = [
        { questionId: 1, value: 1.0 },
        { questionId: 2, value: 1.0 },
        { questionId: 3, value: 1.0 },
        { questionId: 4, value: 1.0 },
        { questionId: 5, value: 1.0 },
        { questionId: 6, value: 1.0 },
      ];

      const vector = calculateQuizVector(answers);

      expect(vector.social).toBeGreaterThanOrEqual(-1);
      expect(vector.social).toBeLessThanOrEqual(1);
    });

    it("handles partial answers correctly", () => {
      const answers: QuizAnswer[] = [
        { questionId: 1, value: 1.0 },
        { questionId: 2, value: 1.0 },
        { questionId: 3, value: 1.0 },
      ];

      const vector = calculateQuizVector(answers);

      expect(vector.social).toBeGreaterThan(0);
      expect(vector.economic).toBe(0);
      expect(vector.populist).toBe(0);
    });

    it("handles empty answers", () => {
      const vector = calculateQuizVector([]);

      expect(vector.social).toBe(0);
      expect(vector.economic).toBe(0);
      expect(vector.populist).toBe(0);
    });
  });

  describe("validateAnswers", () => {
    it("validates correct answers", () => {
      const answers: QuizAnswer[] = [
        { questionId: 1, value: 1.0 },
        { questionId: 7, value: -0.5 },
      ];

      const result = validateAnswers(answers);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("rejects invalid question IDs", () => {
      const answers: QuizAnswer[] = [{ questionId: 999, value: 1.0 }];

      const result = validateAnswers(answers);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Invalid question ID: 999");
    });

    it("rejects invalid values", () => {
      const answers: QuizAnswer[] = [{ questionId: 1, value: 0.75 as 0.5 }];

      const result = validateAnswers(answers);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("collects multiple errors", () => {
      const answers: QuizAnswer[] = [
        { questionId: 999, value: 0.75 as 0.5 },
        { questionId: 1, value: 2.0 as 1.0 },
      ];

      const result = validateAnswers(answers);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("createQuizResult", () => {
    it("creates result with valid answers", () => {
      const answers: QuizAnswer[] = [
        { questionId: 1, value: 1.0 },
        { questionId: 7, value: 0.5 },
      ];

      const result = createQuizResult(answers);

      expect(result.vector).toBeDefined();
      expect(result.completedAt).toBeDefined();
      expect(result.answers).toEqual(answers);
      expect(new Date(result.completedAt).getTime()).toBeLessThanOrEqual(Date.now());
    });

    it("throws on invalid answers", () => {
      const answers: QuizAnswer[] = [{ questionId: 999, value: 1.0 }];

      expect(() => createQuizResult(answers)).toThrow("Invalid quiz answers");
    });
  });

  describe("storage operations", () => {
    let chromeMock: ChromeMock;

    beforeEach(() => {
      chromeMock = (globalThis as unknown as { chrome: unknown }).chrome as ChromeMock;
      vi.clearAllMocks();
    });

    it("hasCompletedQuiz returns false when no result stored", async () => {
      chromeMock.storage.local.get.mockResolvedValue({});

      const result = await hasCompletedQuiz();

      expect(result).toBe(false);
    });

    it("hasCompletedQuiz returns true when result exists", async () => {
      chromeMock.storage.local.get.mockResolvedValue({
        quizResult: { vector: { social: 0, economic: 0, populist: 0 } },
      });

      const result = await hasCompletedQuiz();

      expect(result).toBe(true);
    });

    it("getStoredQuizResult returns null when no result", async () => {
      chromeMock.storage.local.get.mockResolvedValue({});

      const result = await getStoredQuizResult();

      expect(result).toBeNull();
    });

    it("getStoredQuizResult returns stored result", async () => {
      const mockResult = {
        vector: { social: 0.5, economic: -0.3, populist: 0.1 },
        completedAt: "2026-02-14T10:00:00.000Z",
        answers: [],
      };
      chromeMock.storage.local.get.mockResolvedValue({ quizResult: mockResult });

      const result = await getStoredQuizResult();

      expect(result).toEqual(mockResult);
    });

    it("storeQuizResult saves to local storage", async () => {
      const mockResult = {
        vector: { social: 0.5, economic: -0.3, populist: 0.1 },
        completedAt: "2026-02-14T10:00:00.000Z",
        answers: [{ questionId: 1, value: 1.0 as const }],
      };

      await storeQuizResult(mockResult);

      expect(chromeMock.storage.local.set).toHaveBeenCalledWith({ quizResult: mockResult });
    });

    it("clearQuizResult removes from local storage", async () => {
      await clearQuizResult();

      expect(chromeMock.storage.local.remove).toHaveBeenCalledWith("quizResult");
    });
  });
});
