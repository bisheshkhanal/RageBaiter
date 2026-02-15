import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";

import { QuizResults } from "../src/sidepanel/QuizResults.js";

describe("QuizResults", () => {
  const defaultProps = {
    social: 0.5,
    economic: -0.3,
    populist: 0.1,
    onRetake: vi.fn(),
    onContinue: vi.fn(),
  };

  afterEach(() => {
    cleanup();
  });

  it("renders all three axis values", () => {
    render(<QuizResults {...defaultProps} />);

    expect(screen.getByTestId("result-social-value").textContent).toBe("0.50");
    expect(screen.getByTestId("result-economic-value").textContent).toBe("-0.30");
    expect(screen.getByTestId("result-populist-value").textContent).toBe("0.10");
  });

  it("renders axis labels based on values", () => {
    render(<QuizResults {...defaultProps} />);

    expect(screen.getByTestId("result-social-label")).toBeDefined();
    expect(screen.getByTestId("result-economic-label")).toBeDefined();
    expect(screen.getByTestId("result-populist-label")).toBeDefined();
  });

  it("displays progressive label for positive social value", () => {
    render(<QuizResults {...defaultProps} social={0.6} />);

    expect(screen.getByTestId("result-social-label").textContent).toContain("Progressive");
  });

  it("displays traditional label for negative social value", () => {
    render(<QuizResults {...defaultProps} social={-0.6} />);

    expect(screen.getByTestId("result-social-label").textContent).toContain("Traditional");
  });

  it("displays free market label for negative economic value", () => {
    render(<QuizResults {...defaultProps} economic={-0.6} />);

    expect(screen.getByTestId("result-economic-label").textContent).toContain("Free Market");
  });

  it("displays interventionist label for positive economic value", () => {
    render(<QuizResults {...defaultProps} economic={0.6} />);

    expect(screen.getByTestId("result-economic-label").textContent).toContain("Interventionist");
  });

  it("displays anti-elite label for positive populist value", () => {
    render(<QuizResults {...defaultProps} populist={0.6} />);

    expect(screen.getByTestId("result-populist-label").textContent).toContain("Anti-Elite");
  });

  it("displays pro-establishment label for negative populist value", () => {
    render(<QuizResults {...defaultProps} populist={-0.6} />);

    expect(screen.getByTestId("result-populist-label").textContent).toContain("Pro-Establishment");
  });

  it("calls onRetake when retake button clicked", () => {
    const onRetake = vi.fn();
    render(<QuizResults {...defaultProps} onRetake={onRetake} />);

    fireEvent.click(screen.getByTestId("results-retake-button"));

    expect(onRetake).toHaveBeenCalled();
  });

  it("calls onContinue when continue button clicked", () => {
    const onContinue = vi.fn();
    render(<QuizResults {...defaultProps} onContinue={onContinue} />);

    fireEvent.click(screen.getByTestId("results-continue-button"));

    expect(onContinue).toHaveBeenCalled();
  });
});
