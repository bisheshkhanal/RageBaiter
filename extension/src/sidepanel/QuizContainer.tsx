import { LIKERT_OPTIONS, QUIZ_QUESTIONS, QUIZ_QUESTION_COUNT } from "../lib/quiz-data.js";
import type { LikertValue } from "../lib/quiz-data.js";

import "./QuizContainer.css";

export type QuizContainerProps = {
  currentQuestionIndex: number;
  answers: Map<number, LikertValue>;
  onAnswer: (questionId: number, value: LikertValue) => void;
  onNext: () => void;
  onPrevious: () => void;
  onComplete: () => void;
  onSkip: () => void;
};

export function QuizContainer({
  currentQuestionIndex,
  answers,
  onAnswer,
  onNext,
  onPrevious,
  onComplete,
  onSkip,
}: QuizContainerProps): React.ReactElement {
  const question = QUIZ_QUESTIONS[currentQuestionIndex];

  if (!question) {
    throw new Error(`Invalid question index: ${currentQuestionIndex}`);
  }

  const currentAnswer = answers.get(question.id);
  const progress = ((currentQuestionIndex + 1) / QUIZ_QUESTION_COUNT) * 100;
  const isLastQuestion = currentQuestionIndex === QUIZ_QUESTION_COUNT - 1;
  const canGoNext = currentAnswer !== undefined;
  const canGoPrevious = currentQuestionIndex > 0;

  return (
    <div className="quiz-container">
      <div className="quiz-progress">
        <div className="quiz-progress-bar">
          <div
            className="quiz-progress-fill"
            style={{ width: `${progress}%` }}
            data-testid="quiz-progress-fill"
          />
        </div>
        <span className="quiz-progress-text" data-testid="quiz-progress-text">
          Question {currentQuestionIndex + 1} of {QUIZ_QUESTION_COUNT}
        </span>
      </div>

      <div className="quiz-question-card">
        <h3 className="quiz-question-text" data-testid="quiz-question-text">
          {question.text}
        </h3>

        <div className="quiz-options">
          {LIKERT_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`quiz-option ${currentAnswer === option.value ? "selected" : ""}`}
              onClick={() => onAnswer(question.id, option.value)}
              data-testid={`quiz-option-${option.value}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="quiz-navigation">
        <button
          type="button"
          className="quiz-nav-button secondary"
          onClick={onPrevious}
          disabled={!canGoPrevious}
          data-testid="quiz-prev-button"
        >
          Previous
        </button>

        {isLastQuestion ? (
          <button
            type="button"
            className="quiz-nav-button primary"
            onClick={onComplete}
            disabled={!canGoNext}
            data-testid="quiz-complete-button"
          >
            Complete Quiz
          </button>
        ) : (
          <button
            type="button"
            className="quiz-nav-button primary"
            onClick={onNext}
            disabled={!canGoNext}
            data-testid="quiz-next-button"
          >
            Next
          </button>
        )}
      </div>

      <button
        type="button"
        className="quiz-skip-link"
        onClick={onSkip}
        data-testid="quiz-skip-button"
      >
        Skip to manual entry
      </button>
    </div>
  );
}
