import { beforeEach, vi } from "vitest";

import { createChromeMock } from "../mocks/chrome.js";

beforeEach(() => {
  vi.stubGlobal("chrome", createChromeMock());
});
