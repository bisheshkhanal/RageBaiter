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

  return {
    runtime: {
      onInstalled,
      onMessage,
      sendMessage: vi.fn(),
      getURL: vi.fn((path: string) => `chrome-extension://test/${path}`),
    },
    sidePanel: {
      setPanelBehavior: vi.fn(async () => undefined),
    },
    storage: {
      local: {
        get: vi.fn(async () => ({})),
        set: vi.fn(async () => undefined),
      },
    },
  };
};
