import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SidePanel } from "../src/sidepanel/sidepanel.js";

type ChromeMock = ReturnType<typeof import("../../__tests__/mocks/chrome.js").createChromeMock>;

const getChromeMock = (): ChromeMock => {
  return (globalThis as unknown as { chrome: ChromeMock }).chrome;
};

describe("SidePanel Auth & Logout", () => {
  beforeEach(() => {
    const chromeMock = getChromeMock();

    (
      chromeMock.storage.local.get as unknown as {
        mockImplementation: (impl: (keys: string | string[]) => Promise<unknown>) => void;
      }
    ).mockImplementation(async (keys: string | string[]) => {
      const storage = {
        backendUrl: "http://localhost:3001",
        authToken: "fake-auth-token",
        accessToken: "fake-auth-token",
        userVector: { social: 0, economic: 0, populist: 0, x: 0, y: 0 },
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

    chromeMock.storage.local.remove.mockResolvedValue(undefined);
    chromeMock.storage.local.set.mockResolvedValue(undefined);

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/auth/me")) {
          return {
            ok: true,
            json: async () => ({ success: true, user: { id: "1" } }),
          };
        }
        if (url.includes("/api/auth/logout")) {
          return {
            ok: true,
            json: async () => ({ success: true }),
          };
        }
        return {
          ok: true,
          json: async () => ({}),
        };
      })
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders the sidepanel when authenticated", async () => {
    render(<SidePanel />);

    await waitFor(() => {
      expect(screen.getByText("RageBaiter")).toBeDefined();
    });
  });

  it("logs out and clears local auth state", async () => {
    const chromeMock = getChromeMock();
    render(<SidePanel />);

    await waitFor(() => {
      expect(screen.getByText("RageBaiter")).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Log Out" })).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: "Log Out" }));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "http://localhost:3001/api/auth/logout",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer fake-auth-token",
          }),
        })
      );
    });

    await waitFor(() => {
      expect(chromeMock.storage.local.remove).toHaveBeenCalledWith([
        "authToken",
        "refreshToken",
        "accessToken",
      ]);
    });

    act(() => {
      chromeMock.storage.onChanged.listeners.forEach((listener) => {
        listener(
          {
            authToken: {
              oldValue: "fake-auth-token",
              newValue: undefined,
            },
            accessToken: {
              oldValue: "fake-auth-token",
              newValue: undefined,
            },
          },
          "local"
        );
      });
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Sign In" })).toBeDefined();
      expect(screen.queryByRole("button", { name: "Log Out" })).toBeNull();
    });
  });

  it("clears local auth state even if backend logout fails", async () => {
    const chromeMock = getChromeMock();

    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockImplementation(async (url: string | Request | URL) => {
      const urlStr = url.toString();
      if (urlStr.includes("/api/auth/logout")) {
        return {
          ok: false,
          status: 500,
          json: async () => ({ error: "Internal Server Error" }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({ success: true }),
      } as Response;
    });

    render(<SidePanel />);

    await waitFor(() => {
      expect(screen.getByText("RageBaiter")).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Log Out" })).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: "Log Out" }));

    await waitFor(() => {
      expect(chromeMock.storage.local.remove).toHaveBeenCalledWith([
        "authToken",
        "refreshToken",
        "accessToken",
      ]);
    });

    act(() => {
      chromeMock.storage.onChanged.listeners.forEach((listener) => {
        listener(
          {
            authToken: {
              oldValue: "fake-auth-token",
              newValue: undefined,
            },
            accessToken: {
              oldValue: "fake-auth-token",
              newValue: undefined,
            },
          },
          "local"
        );
      });
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Sign In" })).toBeDefined();
      expect(screen.queryByRole("button", { name: "Log Out" })).toBeNull();
    });
  });
});
