import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";

import { QuizContainer } from "../src/sidepanel/QuizContainer.js";
import type { LikertValue } from "../src/lib/quiz-data.js";

describe("QuizContainer", () => {
  const defaultProps = {
    currentQuestionIndex: 0,
    answers: new Map<number, LikertValue>(),
    onAnswer: vi.fn(),
    onNext: vi.fn(),
    onPrevious: vi.fn(),
    onComplete: vi.fn(),
    onSkip: vi.fn(),
  };

  afterEach(() => {
    cleanup();
  });

  it("renders first question with progress at 0%", () => {
    render(<QuizContainer {...defaultProps} />);

    expect(screen.getByTestId("quiz-progress-text").textContent).toContain("Question 1 of 18");
    expect(screen.getByTestId("quiz-question-text")).toBeDefined();
  });

  it("disables Previous button on first question", () => {
    render(<QuizContainer {...defaultProps} />);

    expect((screen.getByTestId("quiz-prev-button") as HTMLButtonElement).disabled).toBe(true);
  });

  it("disables Next button when no answer selected", () => {
    render(<QuizContainer {...defaultProps} />);

    expect((screen.getByTestId("quiz-next-button") as HTMLButtonElement).disabled).toBe(true);
  });

  it("enables Next button when answer selected", () => {
    const answers = new Map<number, LikertValue>();
    answers.set(1, 1.0);

    render(<QuizContainer {...defaultProps} answers={answers} />);

    expect((screen.getByTestId("quiz-next-button") as HTMLButtonElement).disabled).toBe(false);
  });

  it("calls onAnswer when option clicked", () => {
    const onAnswer = vi.fn();
    render(<QuizContainer {...defaultProps} onAnswer={onAnswer} />);

    fireEvent.click(screen.getByTestId("quiz-option-1"));

    expect(onAnswer).toHaveBeenCalledWith(1, 1.0);
  });

  it("calls onNext when Next button clicked", () => {
    const answers = new Map<number, LikertValue>();
    answers.set(1, 1.0);
    const onNext = vi.fn();

    render(<QuizContainer {...defaultProps} answers={answers} onNext={onNext} />);

    fireEvent.click(screen.getByTestId("quiz-next-button"));

    expect(onNext).toHaveBeenCalled();
  });

  it("calls onPrevious when Previous button clicked", () => {
    const answers = new Map<number, LikertValue>();
    answers.set(1, 1.0);
    const onPrevious = vi.fn();

    render(
      <QuizContainer
        {...defaultProps}
        currentQuestionIndex={1}
        answers={answers}
        onPrevious={onPrevious}
      />
    );

    fireEvent.click(screen.getByTestId("quiz-prev-button"));

    expect(onPrevious).toHaveBeenCalled();
  });

  it("renders Complete button on last question", () => {
    const answers = new Map<number, LikertValue>();
    answers.set(18, 1.0);

    render(<QuizContainer {...defaultProps} currentQuestionIndex={17} answers={answers} />);

    expect(screen.getByTestId("quiz-complete-button")).toBeDefined();
    expect(screen.queryByTestId("quiz-next-button")).toBeNull();
  });

  it("calls onComplete when Complete button clicked", () => {
    const answers = new Map<number, LikertValue>();
    answers.set(18, 1.0);
    const onComplete = vi.fn();

    render(
      <QuizContainer
        {...defaultProps}
        currentQuestionIndex={17}
        answers={answers}
        onComplete={onComplete}
      />
    );

    fireEvent.click(screen.getByTestId("quiz-complete-button"));

    expect(onComplete).toHaveBeenCalled();
  });

  it("calls onSkip when skip link clicked", () => {
    const onSkip = vi.fn();
    render(<QuizContainer {...defaultProps} onSkip={onSkip} />);

    fireEvent.click(screen.getByTestId("quiz-skip-button"));

    expect(onSkip).toHaveBeenCalled();
  });

  it("updates progress bar width based on current question", () => {
    const { rerender } = render(<QuizContainer {...defaultProps} currentQuestionIndex={0} />);

    const progressFill = screen.getByTestId("quiz-progress-fill") as HTMLDivElement;
    expect(progressFill.style.width).toBe("5.555555555555555%");

    rerender(<QuizContainer {...defaultProps} currentQuestionIndex={9} />);
    expect(progressFill.style.width).toBe("55.55555555555556%");

    rerender(<QuizContainer {...defaultProps} currentQuestionIndex={17} />);
    expect(progressFill.style.width).toBe("100%");
  });
});
