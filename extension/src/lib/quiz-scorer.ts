import { LIKERT_OPTIONS, QUESTIONS_PER_AXIS, QUIZ_QUESTIONS } from "./quiz-data.js";
import type { LikertValue, QuizAxis } from "./quiz-data.js";

type PoliticalVector = {
  readonly social: number;
  readonly economic: number;
  readonly populist: number;
};

export type QuizAnswer = {
  readonly questionId: number;
  readonly value: LikertValue;
};

export type QuizResult = {
  readonly vector: PoliticalVector;
  readonly completedAt: string;
  readonly answers: readonly QuizAnswer[];
};

const AXIS_WEIGHTS: Record<QuizAxis, number> = {
  social: 1.0,
  economic: 1.0,
  populist: 1.0,
};

const clamp = (value: number): number => Math.max(-1, Math.min(1, value));

const calculateQuestionScore = (questionId: number, answerValue: LikertValue): number => {
  const question = QUIZ_QUESTIONS.find((q) => q.id === questionId);
  if (!question) {
    return 0;
  }

  return question.inverted ? -answerValue : answerValue;
};

const calculateAxisScore = (answers: readonly QuizAnswer[], axis: QuizAxis): number => {
  const axisQuestionIds = new Set(QUIZ_QUESTIONS.filter((q) => q.axis === axis).map((q) => q.id));

  const axisAnswers = answers.filter((a) => axisQuestionIds.has(a.questionId));

  if (axisAnswers.length === 0) {
    return 0;
  }

  const sum = axisAnswers.reduce((acc, answer) => {
    return acc + calculateQuestionScore(answer.questionId, answer.value);
  }, 0);

  return clamp((sum / QUESTIONS_PER_AXIS[axis]) * AXIS_WEIGHTS[axis]);
};

export const calculateQuizVector = (answers: readonly QuizAnswer[]): PoliticalVector => {
  return {
    social: calculateAxisScore(answers, "social"),
    economic: calculateAxisScore(answers, "economic"),
    populist: calculateAxisScore(answers, "populist"),
  };
};

export const validateAnswers = (
  answers: readonly QuizAnswer[]
): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];
  const validQuestionIds = new Set(QUIZ_QUESTIONS.map((q) => q.id));

  for (const answer of answers) {
    if (!validQuestionIds.has(answer.questionId)) {
      errors.push(`Invalid question ID: ${answer.questionId}`);
    }

    if (!LIKERT_OPTIONS.some((opt) => opt.value === answer.value)) {
      errors.push(`Invalid value for question ${answer.questionId}: ${answer.value}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

export const createQuizResult = (answers: readonly QuizAnswer[]): QuizResult => {
  const validation = validateAnswers(answers);
  if (!validation.valid) {
    throw new Error(`Invalid quiz answers: ${validation.errors.join(", ")}`);
  }

  return {
    vector: calculateQuizVector(answers),
    completedAt: new Date().toISOString(),
    answers,
  };
};

export const hasCompletedQuiz = async (): Promise<boolean> => {
  const result = await chrome.storage.local.get("quizResult");
  return !!result.quizResult;
};

export const getStoredQuizResult = async (): Promise<QuizResult | null> => {
  const result = await chrome.storage.local.get("quizResult");
  return result.quizResult ?? null;
};

export const storeQuizResult = async (result: QuizResult): Promise<void> => {
  await chrome.storage.local.set({ quizResult: result });
};

export const clearQuizResult = async (): Promise<void> => {
  await chrome.storage.local.remove("quizResult");
};
