import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { DebugPanel } from "../src/sidepanel/DebugPanel.js";
import { MESSAGE_TYPES } from "../src/messaging/protocol.js";

const mockAddListener = vi.fn();
const mockRemoveListener = vi.fn();
const mockGet = vi.fn();

// Ensure chrome is treated as a global
declare const chrome: any;

describe("DebugPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    chrome.runtime.onMessage.addListener = mockAddListener;
    chrome.runtime.onMessage.removeListener = mockRemoveListener;

    chrome.storage.local.get = mockGet;
    mockGet.mockResolvedValue({});
  });

  afterEach(() => {
    cleanup();
  });

  it("renders empty state initially", () => {
    render(<DebugPanel />);
    expect(screen.getByText("No logs to display")).toBeDefined();
  });

  it("renders a log entry when ANALYZE_RESULT message is received", async () => {
    render(<DebugPanel />);

    const message = {
      type: MESSAGE_TYPES.ANALYZE_RESULT,
      id: "msg-1",
      payload: {
        tweetId: "tweet-1",
        topic: "Test Topic",
        confidence: 0.8,
        tweetVector: { social: 0.5, economic: 0.5, populist: 0.5 },
        fallacies: [],
      },
    };

    expect(mockAddListener).toHaveBeenCalled();
    const listener = mockAddListener.mock.calls[0][0];

    await act(async () => {
      listener(message);
    });

    await waitFor(() => {
      expect(screen.getByText("Topic:")).toBeDefined();
      expect(screen.getAllByText((content) => content.includes("Test Topic"))).toHaveLength(1);
    });
  });

  it("filters logs by text", async () => {
    render(<DebugPanel />);

    const message1 = {
      type: MESSAGE_TYPES.ANALYZE_RESULT,
      id: "msg-1",
      payload: {
        tweetId: "tweet-1",
        topic: "Politics",
        confidence: 0.8,
        tweetVector: { social: 0.5, economic: 0.5, populist: 0.5 },
        fallacies: [],
      },
    };
    const message2 = {
      type: MESSAGE_TYPES.ANALYZE_RESULT,
      id: "msg-2",
      payload: {
        tweetId: "tweet-2",
        topic: "Sports",
        confidence: 0.8,
        tweetVector: { social: 0.5, economic: 0.5, populist: 0.5 },
        fallacies: [],
      },
    };

    const listener = mockAddListener.mock.calls[0][0];
    await act(async () => {
      listener(message1);
      listener(message2);
    });

    await waitFor(() => {
      expect(screen.getAllByText((content) => content.includes("Politics"))).toHaveLength(1);
      expect(screen.getAllByText((content) => content.includes("Sports"))).toHaveLength(1);
    });

    const input = screen.getByTestId("debug-filter-input");
    fireEvent.change(input, { target: { value: "Sports" } });

    await waitFor(() => {
      expect(screen.queryByText((content) => content.includes("Politics"))).toBeNull();
      expect(screen.getAllByText((content) => content.includes("Sports"))).toHaveLength(1);
    });
  });

  it("clears logs", async () => {
    render(<DebugPanel />);

    const message = {
      type: MESSAGE_TYPES.ANALYZE_RESULT,
      id: "msg-1",
      payload: {
        tweetId: "tweet-1",
        topic: "Test Topic",
        confidence: 0.8,
        tweetVector: { social: 0.5, economic: 0.5, populist: 0.5 },
        fallacies: [],
      },
    };

    const listener = mockAddListener.mock.calls[0][0];
    await act(async () => {
      listener(message);
    });

    await waitFor(() => {
      expect(screen.getAllByText((content) => content.includes("Test Topic"))).toHaveLength(1);
    });

    fireEvent.click(screen.getByTestId("debug-clear-button"));

    expect(screen.getByText("No logs to display")).toBeDefined();
  });
});
