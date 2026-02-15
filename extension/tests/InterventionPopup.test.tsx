import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import "@testing-library/jest-dom";
import { InterventionPopup, type InterventionLevel } from "../src/components/InterventionPopup";

describe("InterventionPopup", () => {
  const defaultProps = {
    level: "medium" as InterventionLevel,
    reason: "Test reason",
    onDismiss: vi.fn(),
    onProceed: vi.fn(),
  };

  it("renders with correct level styling", () => {
    const { rerender } = render(<InterventionPopup {...defaultProps} level="high" />);
    const popup = screen.getByTestId("intervention-popup");
    expect(popup.className).toContain("border-red-500");
    expect(screen.getByText("🛑")).toBeInTheDocument();

    rerender(<InterventionPopup {...defaultProps} level="medium" />);
    expect(popup.className).toContain("border-orange-500");
    expect(screen.getByText("⚠️")).toBeInTheDocument();

    rerender(<InterventionPopup {...defaultProps} level="low" />);
    expect(popup.className).toContain("border-yellow-500");
    expect(screen.getByText("✋")).toBeInTheDocument();
  });

  it("displays the reason", () => {
    render(<InterventionPopup {...defaultProps} reason="This is a fallacy" />);
    expect(screen.getByText("This is a fallacy")).toBeInTheDocument();
  });

  it("handles dismissal", () => {
    render(<InterventionPopup {...defaultProps} />);
    const dismissButton = screen.getByLabelText("Dismiss intervention");
    fireEvent.click(dismissButton);
    expect(defaultProps.onDismiss).toHaveBeenCalled();
  });

  it("expands to show socratic question and handles proceed", () => {
    render(<InterventionPopup {...defaultProps} />);

    const expandButton = screen.getByText("Read More & Reflect");
    expect(expandButton).toBeInTheDocument();

    fireEvent.click(expandButton);

    expect(screen.getByText(/How might this content be framing/i)).toBeInTheDocument();

    const proceedButton = screen.getByText("View Content Anyway");
    fireEvent.click(proceedButton);
    expect(defaultProps.onProceed).toHaveBeenCalled();
  });

  it("collapses when show less is clicked", () => {
    render(<InterventionPopup {...defaultProps} />);
    fireEvent.click(screen.getByText("Read More & Reflect"));

    const collapseButton = screen.getByText("Show Less");
    fireEvent.click(collapseButton);

    expect(screen.getByText("Read More & Reflect")).toBeInTheDocument();
  });
});
