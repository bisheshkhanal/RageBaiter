import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";

import { LLMConfig } from "../src/sidepanel/LLMConfig.js";

type ChromeMock = ReturnType<typeof import("../../__tests__/mocks/chrome.js").createChromeMock>;

const getChromeMock = (): ChromeMock => {
  return (globalThis as unknown as { chrome: unknown }).chrome as ChromeMock;
};

describe("LLMConfig", () => {
  beforeEach(() => {
    const chromeMock = getChromeMock();
    chromeMock.storage.local.get.mockImplementation(async () => ({}));
    chromeMock.storage.local.set.mockImplementation(async () => undefined);
    chromeMock.runtime.sendMessage.mockImplementation(
      (_message: unknown, callback?: (response: unknown) => void) => {
        callback?.({ ok: true, payload: undefined });
      }
    );
  });

  afterEach(() => {
    cleanup();
  });

  it("renders provider selection dropdown", async () => {
    render(<LLMConfig />);

    await waitFor(() => {
      expect(screen.getByTestId("llm-provider-select")).toBeDefined();
    });

    const select = screen.getByTestId("llm-provider-select") as HTMLSelectElement;
    expect(select.value).toBe("internal");
  });

  it("shows privacy notice when internal provider selected", async () => {
    render(<LLMConfig />);

    await waitFor(() => {
      expect(screen.getByTestId("llm-privacy-notice")).toBeDefined();
    });
  });

  it("shows model selection when switching to OpenAI provider", async () => {
    render(<LLMConfig />);

    await waitFor(() => {
      expect(screen.getByTestId("llm-provider-select")).toBeDefined();
    });

    const providerSelect = screen.getByTestId("llm-provider-select");
    fireEvent.change(providerSelect, { target: { value: "openai" } });

    await waitFor(() => {
      expect(screen.getByTestId("llm-model-select")).toBeDefined();
    });
  });

  it("shows API key input for providers requiring keys", async () => {
    render(<LLMConfig />);

    await waitFor(() => {
      expect(screen.getByTestId("llm-provider-select")).toBeDefined();
    });

    const providerSelect = screen.getByTestId("llm-provider-select");
    fireEvent.change(providerSelect, { target: { value: "openai" } });

    await waitFor(() => {
      expect(screen.getByTestId("llm-api-key-input")).toBeDefined();
    });
  });

  it("shows custom URL input when custom provider selected", async () => {
    render(<LLMConfig />);

    await waitFor(() => {
      expect(screen.getByTestId("llm-provider-select")).toBeDefined();
    });

    const providerSelect = screen.getByTestId("llm-provider-select");
    fireEvent.change(providerSelect, { target: { value: "custom" } });

    await waitFor(() => {
      expect(screen.getByTestId("llm-custom-url-input")).toBeDefined();
    });
  });

  it("shows Test Connection button when API key provider selected", async () => {
    render(<LLMConfig />);

    await waitFor(() => {
      expect(screen.getByTestId("llm-provider-select")).toBeDefined();
    });

    const providerSelect = screen.getByTestId("llm-provider-select");
    fireEvent.change(providerSelect, { target: { value: "openai" } });

    await waitFor(() => {
      expect(screen.getByTestId("llm-test-connection")).toBeDefined();
    });
  });

  it("disables Test Connection button when no API key entered", async () => {
    render(<LLMConfig />);

    await waitFor(() => {
      expect(screen.getByTestId("llm-provider-select")).toBeDefined();
    });

    const providerSelect = screen.getByTestId("llm-provider-select");
    fireEvent.change(providerSelect, { target: { value: "openai" } });

    await waitFor(() => {
      const testButton = screen.getByTestId("llm-test-connection") as HTMLButtonElement;
      expect(testButton.disabled).toBe(true);
    });
  });

  it("enables Test Connection button when API key is entered", async () => {
    render(<LLMConfig />);

    await waitFor(() => {
      expect(screen.getByTestId("llm-provider-select")).toBeDefined();
    });

    const providerSelect = screen.getByTestId("llm-provider-select");
    fireEvent.change(providerSelect, { target: { value: "openai" } });

    await waitFor(() => {
      expect(screen.getByTestId("llm-api-key-input")).toBeDefined();
    });

    const apiKeyInput = screen.getByTestId("llm-api-key-input");
    fireEvent.change(apiKeyInput, { target: { value: "test-key-123" } });

    await waitFor(() => {
      const testButton = screen.getByTestId("llm-test-connection") as HTMLButtonElement;
      expect(testButton.disabled).toBe(false);
    });
  });

  it("shows fallback toggle", async () => {
    render(<LLMConfig />);

    await waitFor(() => {
      expect(screen.getByTestId("llm-fallback-toggle")).toBeDefined();
    });
  });

  it("shows usage statistics section", async () => {
    render(<LLMConfig />);

    await waitFor(() => {
      expect(screen.getByTestId("llm-usage-requests")).toBeDefined();
      expect(screen.getByTestId("llm-usage-tokens")).toBeDefined();
      expect(screen.getByTestId("llm-usage-cost")).toBeDefined();
    });
  });

  it("shows Clear Credentials button", async () => {
    render(<LLMConfig />);

    await waitFor(() => {
      expect(screen.getByTestId("llm-clear-credentials")).toBeDefined();
    });
  });

  it("shows Save Configuration button", async () => {
    render(<LLMConfig />);

    await waitFor(() => {
      expect(screen.getByTestId("llm-save-config")).toBeDefined();
    });
  });

  it("shows unsaved warning when changes made", async () => {
    render(<LLMConfig />);

    await waitFor(() => {
      expect(screen.getByTestId("llm-provider-select")).toBeDefined();
    });

    const providerSelect = screen.getByTestId("llm-provider-select");
    fireEvent.change(providerSelect, { target: { value: "openai" } });

    await waitFor(() => {
      expect(screen.getByTestId("llm-unsaved-warning")).toBeDefined();
    });
  });

  it("calls onConfigChange when save is clicked", async () => {
    const onConfigChange = vi.fn();
    render(<LLMConfig onConfigChange={onConfigChange} />);

    await waitFor(() => {
      expect(screen.getByTestId("llm-provider-select")).toBeDefined();
    });

    const providerSelect = screen.getByTestId("llm-provider-select");
    fireEvent.change(providerSelect, { target: { value: "openai" } });

    await waitFor(() => {
      expect(screen.getByTestId("llm-api-key-input")).toBeDefined();
    });

    const apiKeyInput = screen.getByTestId("llm-api-key-input");
    fireEvent.change(apiKeyInput, { target: { value: "test-key-123" } });

    const saveButton = screen.getByTestId("llm-save-config");
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(onConfigChange).toHaveBeenCalled();
    });
  });

  it("displays error message when connection test fails with invalid key", async () => {
    const chromeMock = getChromeMock();
    chromeMock.runtime.sendMessage.mockImplementation(
      (message: unknown, callback?: (response: unknown) => void) => {
        const msg = message as { type: string; payload: unknown };
        if (msg.type === "LLM_CONNECTION_TEST") {
          callback?.({
            ok: true,
            payload: {
              success: false,
              message: "Invalid API key provided",
              latencyMs: 100,
            },
          });
          return;
        }
        callback?.({ ok: true, payload: undefined });
      }
    );

    render(<LLMConfig />);

    await waitFor(() => {
      expect(screen.getByTestId("llm-provider-select")).toBeDefined();
    });

    fireEvent.change(screen.getByTestId("llm-provider-select"), {
      target: { value: "openai" },
    });

    await waitFor(() => {
      expect(screen.getByTestId("llm-api-key-input")).toBeDefined();
    });

    fireEvent.change(screen.getByTestId("llm-api-key-input"), {
      target: { value: "invalid-key" },
    });

    const testButton = screen.getByTestId("llm-test-connection");
    expect(testButton).toBeDefined();
    fireEvent.click(testButton);

    await waitFor(() => {
      expect(screen.getByTestId("llm-connection-error")).toBeDefined();
      expect(screen.getByText(/Invalid API key provided/)).toBeDefined();
    });
  });
});
