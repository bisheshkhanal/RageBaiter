import React from "react";
import { render, fireEvent, type RenderResult } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom";
import { InterventionPopup, type InterventionLevel } from "../src/components/InterventionPopup";

describe("InterventionPopup", () => {
  const defaultProps = {
    level: "medium" as InterventionLevel,
    reason: "Test reason",
    onDismiss: vi.fn(),
    onProceed: vi.fn(),
    onAgree: vi.fn(),
    onDisagree: vi.fn(),
  };

  let container: HTMLDivElement | null = null;
  let renderResult: any = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (renderResult) {
      renderResult.unmount();
    }
    if (container) {
      document.body.removeChild(container);
      container = null;
    }
    renderResult = null;
  });

  const renderComponent = (props = defaultProps) => {
    if (!container) throw new Error("Container not initialized");
    const result = render(<InterventionPopup {...props} />, { container });
    renderResult = result;
    return result;
  };

  it("renders with correct level styling", () => {
    const { getByTestId, getByText, rerender } = renderComponent({
      ...defaultProps,
      level: "high",
    });
    const popup = getByTestId("intervention-popup");
    expect(popup.className).toContain("border-red-500");
    expect(getByText("🛑")).toBeInTheDocument();

    rerender(<InterventionPopup {...defaultProps} level="medium" />);
    expect(popup.className).toContain("border-orange-500");
    expect(getByText("⚠️")).toBeInTheDocument();

    rerender(<InterventionPopup {...defaultProps} level="low" />);
    expect(popup.className).toContain("border-yellow-500");
    expect(getByText("✋")).toBeInTheDocument();
  });

  it("displays the reason", () => {
    const { getByText } = renderComponent({ ...defaultProps, reason: "This is a fallacy" });
    expect(getByText("This is a fallacy")).toBeInTheDocument();
  });

  it("handles dismissal", () => {
    const { getByLabelText } = renderComponent();
    const dismissButton = getByLabelText("Dismiss intervention");
    fireEvent.click(dismissButton);
    expect(defaultProps.onDismiss).toHaveBeenCalled();
  });

  it("expands to show socratic question and handles proceed", () => {
    const { getByText } = renderComponent();

    const expandButton = getByText("Read More & Reflect");
    expect(expandButton).toBeInTheDocument();

    fireEvent.click(expandButton);

    expect(getByText(/How might this content be framing/i)).toBeInTheDocument();

    const proceedButton = getByText("View Content Anyway");
    fireEvent.click(proceedButton);
    expect(defaultProps.onProceed).toHaveBeenCalled();
  });

  it("fires agree and disagree feedback handlers", () => {
    const { getByTestId } = renderComponent();

    fireEvent.click(getByTestId("feedback-agree-button"));
    fireEvent.click(getByTestId("feedback-dismiss-button"));

    expect(defaultProps.onAgree).toHaveBeenCalledTimes(1);
    expect(defaultProps.onDisagree).toHaveBeenCalledTimes(1);
  });

  it("collapses when show less is clicked", () => {
    const { getByText } = renderComponent();
    fireEvent.click(getByText("Read More & Reflect"));

    const collapseButton = getByText("Show Less");
    fireEvent.click(collapseButton);

    expect(getByText("Read More & Reflect")).toBeInTheDocument();
  });
});
