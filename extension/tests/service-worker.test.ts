import { afterEach, describe, expect, it, vi } from "vitest";

import { createLlmSdkMock } from "../../__tests__/mocks/llm.js";
import { createSupabaseClientMock } from "../../__tests__/mocks/supabase.js";

describe("service worker bootstrap", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("registers chrome listeners and keeps deterministic dependency mocks available", async () => {
    const supabase = createSupabaseClientMock([{ id: "1" }]);
    const llm = createLlmSdkMock({ score: 42 });

    await import("../src/background/service-worker.js");

    const chromeMock = (globalThis as unknown as { chrome: unknown }).chrome as ReturnType<
      typeof import("../../__tests__/mocks/chrome.js").createChromeMock
    >;

    expect(chromeMock.runtime.onInstalled.addListener).toHaveBeenCalledTimes(1);
    expect(chromeMock.runtime.onMessage.addListener).toHaveBeenCalledTimes(1);
    expect(chromeMock.sidePanel.setPanelBehavior).toHaveBeenCalledWith({
      openPanelOnActionClick: false,
    });

    const rows = await supabase.from("users").select();
    const analysis = await llm.analyzeText("demo");

    expect(rows.data).toEqual([{ id: "1" }]);
    expect(analysis.score).toBe(42);
  });
});
