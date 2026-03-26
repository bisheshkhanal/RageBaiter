import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthGate } from "../src/components/AuthGate.js";

type ChromeMock = ReturnType<typeof import("../../__tests__/mocks/chrome.js").createChromeMock>;

const getChromeMock = (): ChromeMock => {
  return (globalThis as unknown as { chrome: ChromeMock }).chrome;
};

describe("AuthGate", () => {
  beforeEach(() => {
    const chromeMock = getChromeMock();

    (
      chromeMock.storage.local.get as unknown as {
        mockImplementation: (impl: (keys: string | string[]) => Promise<unknown>) => void;
      }
    ).mockImplementation(async (keys: string | string[]) => {
      const storage = {
        backendUrl: "http://localhost:3001",
        authToken: undefined,
        accessToken: undefined,
      };

      if (typeof keys === "string") {
        return { [keys]: storage[keys as keyof typeof storage] };
      }

      if (Array.isArray(keys)) {
        return keys.reduce(
          (acc, key) => ({
            ...acc,
            [key]: storage[key as keyof typeof storage],
          }),
          {}
        );
      }

      return storage;
    });

    chromeMock.storage.local.set.mockResolvedValue(undefined);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ success: true }),
      }))
    );
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the login gate for unauthenticated users", async () => {
    render(
      <AuthGate>
        <div data-testid="protected-content">Protected</div>
      </AuthGate>
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Sign In" })).toBeDefined();
    });

    expect(screen.queryByTestId("protected-content")).toBeNull();
  });

  it("stores tokens and reveals children after a successful login", async () => {
    const chromeMock = getChromeMock();

    render(
      <AuthGate>
        <div data-testid="protected-content">Protected</div>
      </AuthGate>
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Sign In" })).toBeDefined();
    });

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "user@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret123" } });

    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        session: {
          accessToken: "auth-token",
          refreshToken: "refresh-token",
        },
      }),
    } as Response);

    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));

    await waitFor(() => {
      expect(chromeMock.storage.local.set).toHaveBeenCalledWith({
        authToken: "auth-token",
        refreshToken: "refresh-token",
      });
      expect(screen.getByTestId("protected-content")).toBeDefined();
    });
  });

  it("switches to verify-email after signup returns no session", async () => {
    render(
      <AuthGate>
        <div data-testid="protected-content">Protected</div>
      </AuthGate>
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Sign In" })).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: "Sign up" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Create Account" })).toBeDefined();
    });

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "new@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret123" } });

    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        session: null,
      }),
    } as Response);

    fireEvent.click(screen.getByRole("button", { name: "Create Account" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "I've Verified My Email" })).toBeDefined();
      expect(screen.getByText(/We sent a confirmation link to new@example\.com/)).toBeDefined();
    });
  });

  it("reacts to storage changes that add an auth token", async () => {
    const chromeMock = getChromeMock();

    render(
      <AuthGate>
        <div data-testid="protected-content">Protected</div>
      </AuthGate>
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Sign In" })).toBeDefined();
    });

    const listener = chromeMock.storage.onChanged.listeners[0];
    expect(listener).toBeDefined();

    act(() => {
      listener(
        {
          authToken: {
            oldValue: undefined,
            newValue: "storage-token",
          },
        },
        "local"
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId("protected-content")).toBeDefined();
    });
  });

  it("shows backend validation errors in the gate", async () => {
    render(
      <AuthGate>
        <div data-testid="protected-content">Protected</div>
      </AuthGate>
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Sign In" })).toBeDefined();
    });

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "user@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "wrong-pass" } });

    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        success: false,
        error: { message: "Invalid credentials" },
      }),
    } as Response);

    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));

    await waitFor(() => {
      expect(screen.getByText("Invalid credentials")).toBeDefined();
    });
  });

  it("shows connection errors when fetch fails", async () => {
    render(
      <AuthGate>
        <div data-testid="protected-content">Protected</div>
      </AuthGate>
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Sign In" })).toBeDefined();
    });

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "user@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret123" } });

    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockRejectedValueOnce(new Error("Network unavailable"));

    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));

    await waitFor(() => {
      expect(screen.getByText("Network unavailable")).toBeDefined();
    });
  });
});

describe("signup journey (verify-email -> manual login -> protected content)", () => {
  const getChromeMock = (): ChromeMock => {
    return (globalThis as unknown as { chrome: ChromeMock }).chrome;
  };

  beforeEach(() => {
    const chromeMock = getChromeMock();

    (
      chromeMock.storage.local.get as unknown as {
        mockImplementation: (impl: (keys: string | string[]) => Promise<unknown>) => void;
      }
    ).mockImplementation(async (keys: string | string[]) => {
      const storage = {
        backendUrl: "http://localhost:3001",
        authToken: undefined,
        accessToken: undefined,
      };

      if (typeof keys === "string") {
        return { [keys]: storage[keys as keyof typeof storage] };
      }

      if (Array.isArray(keys)) {
        return keys.reduce(
          (acc, key) => ({
            ...acc,
            [key]: storage[key as keyof typeof storage],
          }),
          {}
        );
      }

      return storage;
    });

    chromeMock.storage.local.set.mockResolvedValue(undefined);
  });

  it("proves the intended UX journey: signup -> verify-email -> manual login -> protected content", async () => {
    const chromeMock = getChromeMock();
    const fetchMock = vi.mocked(globalThis.fetch);

    render(
      <AuthGate>
        <div data-testid="protected-content">Protected</div>
      </AuthGate>
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Sign In" })).toBeDefined();
    });
    expect(screen.queryByTestId("protected-content")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Sign up" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Create Account" })).toBeDefined();
    });

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "journey@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret123" } });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        session: null,
      }),
    } as Response);

    fireEvent.click(screen.getByRole("button", { name: "Create Account" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "I've Verified My Email" })).toBeDefined();
      expect(screen.getByText(/journey@example\.com/)).toBeDefined();
    });
    expect(screen.queryByTestId("protected-content")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "I've Verified My Email" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Sign In" })).toBeDefined();
    });

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "journey@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret123" } });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        session: {
          accessToken: "journey-auth-token",
          refreshToken: "journey-refresh-token",
        },
      }),
    } as Response);

    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));

    await waitFor(() => {
      expect(chromeMock.storage.local.set).toHaveBeenCalledWith({
        authToken: "journey-auth-token",
        refreshToken: "journey-refresh-token",
      });
      expect(screen.getByTestId("protected-content")).toBeDefined();
    });
  });
});
