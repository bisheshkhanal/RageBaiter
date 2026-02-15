import { vi } from "vitest";

type Listener<TArgs extends unknown[]> = (...args: TArgs) => void;

const createEvent = <TArgs extends unknown[]>() => {
  const listeners: Array<Listener<TArgs>> = [];

  return {
    listeners,
    addListener: vi.fn((listener: Listener<TArgs>) => {
      listeners.push(listener);
    }),
    removeListener: vi.fn((listener: Listener<TArgs>) => {
      const index = listeners.indexOf(listener);

      if (index >= 0) {
        listeners.splice(index, 1);
      }
    }),
    hasListener: vi.fn((listener: Listener<TArgs>) => listeners.includes(listener)),
  };
};

export const createChromeMock = () => {
  const onInstalled = createEvent<[]>();
  const onMessage = createEvent<[unknown, unknown, (response?: unknown) => void]>();
  const onTabUpdated = createEvent<
    [
      number,
      {
        status?: string;
        url?: string;
      },
      {
        id?: number;
        url?: string;
      },
    ]
  >();
  const onTabActivated = createEvent<
    [
      {
        tabId: number;
        windowId?: number;
      },
    ]
  >();

  return {
    runtime: {
      onInstalled,
      onMessage,
      sendMessage: vi.fn((_message: unknown, callback?: (response: unknown) => void) => {
        callback?.({ ok: true, payload: undefined });
      }),
      lastError: undefined as { message: string } | undefined,
      getURL: vi.fn((path: string) => `chrome-extension://test/${path}`),
    },
    tabs: {
      onUpdated: onTabUpdated,
      onActivated: onTabActivated,
      sendMessage: vi.fn(
        (_tabId: number, _message: unknown, callback?: (response: unknown) => void) => {
          callback?.({ ok: true, payload: undefined });
        }
      ),
      get: vi.fn(async (tabId: number) => ({ id: tabId, url: "https://x.com/home" })),
      query: vi.fn(async () => []),
    },
    action: {
      setBadgeText: vi.fn(async () => undefined),
      setBadgeBackgroundColor: vi.fn(async () => undefined),
    },
    sidePanel: {
      setPanelBehavior: vi.fn(async () => undefined),
    },
    storage: {
      local: {
        get: vi.fn(async () => ({})),
        set: vi.fn(async () => undefined),
        remove: vi.fn(async () => undefined),
      },
      sync: {
        get: vi.fn(async () => ({})),
        set: vi.fn(async () => undefined),
        remove: vi.fn(async () => undefined),
      },
      onChanged:
        createEvent<[{ [key: string]: { oldValue?: unknown; newValue?: unknown } }, string]>(),
    },
  };
};
