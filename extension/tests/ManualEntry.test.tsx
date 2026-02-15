import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";

import { ManualEntry } from "../src/sidepanel/ManualEntry.js";

describe("ManualEntry", () => {
  const defaultProps = {
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
  };

  afterEach(() => {
    cleanup();
  });

  it("renders all three input fields", () => {
    render(<ManualEntry {...defaultProps} />);

    expect(screen.getByTestId("manual-social-input")).toBeDefined();
    expect(screen.getByTestId("manual-economic-input")).toBeDefined();
    expect(screen.getByTestId("manual-populist-input")).toBeDefined();
  });

  it("renders preset buttons", () => {
    render(<ManualEntry {...defaultProps} />);

    expect(screen.getByTestId("preset-center")).toBeDefined();
    expect(screen.getByTestId("preset-progressive")).toBeDefined();
    expect(screen.getByTestId("preset-conservative")).toBeDefined();
    expect(screen.getByTestId("preset-libertarian")).toBeDefined();
  });

  it("fills inputs with center preset", () => {
    render(<ManualEntry {...defaultProps} />);

    fireEvent.click(screen.getByTestId("preset-center"));

    const socialInput = screen.getByTestId("manual-social-input") as HTMLInputElement;
    const economicInput = screen.getByTestId("manual-economic-input") as HTMLInputElement;
    const populistInput = screen.getByTestId("manual-populist-input") as HTMLInputElement;

    expect(socialInput.value).toBe("0");
    expect(economicInput.value).toBe("0");
    expect(populistInput.value).toBe("0");
  });

  it("fills inputs with progressive preset", () => {
    render(<ManualEntry {...defaultProps} />);

    fireEvent.click(screen.getByTestId("preset-progressive"));

    const socialInput = screen.getByTestId("manual-social-input") as HTMLInputElement;
    const economicInput = screen.getByTestId("manual-economic-input") as HTMLInputElement;
    const populistInput = screen.getByTestId("manual-populist-input") as HTMLInputElement;

    expect(socialInput.value).toBe("0.6");
    expect(economicInput.value).toBe("0.3");
    expect(populistInput.value).toBe("0.2");
  });

  it("fills inputs with conservative preset", () => {
    render(<ManualEntry {...defaultProps} />);

    fireEvent.click(screen.getByTestId("preset-conservative"));

    const socialInput = screen.getByTestId("manual-social-input") as HTMLInputElement;
    const economicInput = screen.getByTestId("manual-economic-input") as HTMLInputElement;
    const populistInput = screen.getByTestId("manual-populist-input") as HTMLInputElement;

    expect(socialInput.value).toBe("-0.6");
    expect(economicInput.value).toBe("-0.3");
    expect(populistInput.value).toBe("0.1");
  });

  it("fills inputs with libertarian preset", () => {
    render(<ManualEntry {...defaultProps} />);

    fireEvent.click(screen.getByTestId("preset-libertarian"));

    const socialInput = screen.getByTestId("manual-social-input") as HTMLInputElement;
    const economicInput = screen.getByTestId("manual-economic-input") as HTMLInputElement;
    const populistInput = screen.getByTestId("manual-populist-input") as HTMLInputElement;

    expect(socialInput.value).toBe("0.2");
    expect(economicInput.value).toBe("-0.7");
    expect(populistInput.value).toBe("-0.2");
  });

  it("calls onSubmit with valid values", () => {
    const onSubmit = vi.fn();
    render(<ManualEntry {...defaultProps} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByTestId("manual-social-input"), { target: { value: "0.5" } });
    fireEvent.change(screen.getByTestId("manual-economic-input"), { target: { value: "-0.3" } });
    fireEvent.change(screen.getByTestId("manual-populist-input"), { target: { value: "0.1" } });

    fireEvent.click(screen.getByTestId("manual-submit-button"));

    expect(onSubmit).toHaveBeenCalledWith({
      social: 0.5,
      economic: -0.3,
      populist: 0.1,
    });
  });

  it("shows error for invalid social value", () => {
    render(<ManualEntry {...defaultProps} />);

    fireEvent.change(screen.getByTestId("manual-social-input"), { target: { value: "invalid" } });
    fireEvent.change(screen.getByTestId("manual-economic-input"), { target: { value: "0" } });
    fireEvent.change(screen.getByTestId("manual-populist-input"), { target: { value: "0" } });

    fireEvent.click(screen.getByTestId("manual-submit-button"));

    expect(screen.getByTestId("manual-entry-errors")).toBeDefined();
  });

  it("clamps out-of-range values to [-1, 1]", () => {
    const onSubmit = vi.fn();
    render(<ManualEntry {...defaultProps} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByTestId("manual-social-input"), { target: { value: "2" } });
    fireEvent.change(screen.getByTestId("manual-economic-input"), { target: { value: "-1.5" } });
    fireEvent.change(screen.getByTestId("manual-populist-input"), { target: { value: "0" } });

    fireEvent.click(screen.getByTestId("manual-submit-button"));

    expect(onSubmit).toHaveBeenCalledWith({
      social: 1,
      economic: -1,
      populist: 0,
    });
  });

  it("calls onCancel when cancel button clicked", () => {
    const onCancel = vi.fn();
    render(<ManualEntry {...defaultProps} onCancel={onCancel} />);

    fireEvent.click(screen.getByTestId("manual-cancel-button"));

    expect(onCancel).toHaveBeenCalled();
  });
});
