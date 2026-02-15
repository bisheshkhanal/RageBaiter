import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { SidePanel } from "../src/sidepanel/sidepanel.js";

const getChromeMock = () => {
  return (globalThis as any).chrome;
};

// Mock ALL child components to isolate SidePanel logic and prevent deep rendering issues
vi.mock("../src/sidepanel/LLMConfig.js", () => ({
  LLMConfig: () => <div data-testid="llm-config-mock">LLM Config</div>,
}));

vi.mock("../src/sidepanel/QuizContainer.js", () => ({
  QuizContainer: ({ onSkip }: any) => (
    <button data-testid="quiz-skip-intro-button" onClick={onSkip}>
      Or enter manually
    </button>
  ),
}));

vi.mock("../src/sidepanel/QuizResults.js", () => ({
  QuizResults: () => <div data-testid="quiz-results">Results</div>,
}));

vi.mock("../src/sidepanel/ManualEntry.js", () => ({
  ManualEntry: ({ onSubmit }: any) => (
    <button
      data-testid="submit-manual"
      onClick={() => onSubmit({ social: 1, economic: 1, populist: 1 })}
    >
      Submit Manual
    </button>
  ),
}));

// Mock runtime dependencies
vi.mock("../src/messaging/runtime.js", () => ({
  sendQuizCompleted: vi.fn().mockResolvedValue({ ok: true }),
  sendSettingsUpdated: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("../src/lib/quiz-scorer.js", () => ({
  getStoredQuizResult: vi.fn().mockResolvedValue(null),
  storeQuizResult: vi.fn().mockResolvedValue(undefined),
  createQuizResult: vi.fn().mockReturnValue({ vector: { social: 1, economic: 1, populist: 1 } }),
  clearQuizResult: vi.fn().mockResolvedValue(undefined),
}));

describe("Backend Security", () => {
  const llmApiKey = "test-llm-key-should-not-leak";
  const backendApiKey = "backend-api-key-safe";

  beforeEach(() => {
    const chromeMock = getChromeMock();

    // Reset mocks
    vi.clearAllMocks();

    chromeMock.storage.local.get.mockImplementation(async (keys: string | string[]) => {
      const storage = {
        llmApiKey: llmApiKey,
        apiKey: backendApiKey,
        backendUrl: "http://localhost:3000",
        userVector: null,
      };

      if (typeof keys === "string") {
        return { [keys]: storage[keys as keyof typeof storage] };
      }
      if (Array.isArray(keys)) {
        return keys.reduce(
          (acc, key) => ({ ...acc, [key]: storage[key as keyof typeof storage] }),
          {}
        );
      }
      return storage;
    });

    chromeMock.storage.local.set.mockResolvedValue(undefined);
    chromeMock.runtime.sendMessage.mockResolvedValue({ ok: true });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("does not include LLM API key in backend sync request headers or body", async () => {
    render(<SidePanel />);

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByTestId("quiz-skip-intro-button")).toBeDefined();
    });

    // Navigate to manual entry
    const skipButton = screen.getByTestId("quiz-skip-intro-button");
    fireEvent.click(skipButton);

    // Wait for manual entry form
    await waitFor(() => {
      expect(screen.getByTestId("submit-manual")).toBeDefined();
    });

    // Submit form
    const submitButton = screen.getByTestId("submit-manual");
    fireEvent.click(submitButton);

    // Verify fetch call
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });

    const calls = (global.fetch as any).mock.calls;
    // Find the call to the backend score endpoint
    const backendCall = calls.find(
      (call: any[]) => typeof call[0] === "string" && call[0].includes("/api/quiz/score")
    );

    expect(backendCall).toBeDefined();

    const [url, options] = backendCall;

    // ASSERTION: URL does not contain sensitive key
    expect(url).not.toContain(llmApiKey);

    const headers = options.headers as Record<string, string>;
    // ASSERTION: Headers use correct backend key
    expect(headers["X-API-Key"]).toBe(backendApiKey);
    // ASSERTION: Authorization header is absent (preventing accidental Bearer token leak)
    expect(headers["Authorization"]).toBeUndefined();

    const body = options.body;
    // ASSERTION: Body does not contain sensitive key
    expect(body).not.toContain(llmApiKey);
  });
});
