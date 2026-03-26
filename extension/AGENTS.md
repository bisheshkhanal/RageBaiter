# EXTENSION WORKSPACE GUIDE

## OVERVIEW

Chrome MV3 workspace for tweet detection, background orchestration, popup/sidepanel UI, and browser-level tests.

## WHERE TO LOOK

| Task                                       | Location                                                               | Notes                                         |
| ------------------------------------------ | ---------------------------------------------------------------------- | --------------------------------------------- |
| Message routing / alarms / queues          | `src/background/service-worker.ts`                                     | Central MV3 orchestration surface             |
| Analyze pipeline                           | `src/background/pipeline.ts`                                           | Concurrency, TTL cache, phase flow            |
| Backend HTTP mapping                       | `src/background/phase1-fetcher.ts`, `src/background/phase2-fetcher.ts` | Consumes shared analysis types                |
| Message contract                           | `src/messaging/protocol.ts`, `src/messaging/runtime.ts`                | Source of truth for runtime payloads          |
| DOM observation and intervention injection | `src/content/content-script.tsx`                                       | Largest content-side hotspot                  |
| Quiz/debug/settings UI                     | `src/sidepanel/`                                                       | `sidepanel.tsx` is the state hub              |
| Browser tests                              | `e2e/`, `playwright.config.ts`                                         | Builds extension before running               |
| Unit/integration tests                     | `tests/`, `vitest.config.ts`                                           | Integration tests use `*.integration.test.ts` |

## LOCAL COMMANDS

```bash
pnpm --filter @ragebaiter/extension dev
pnpm --filter @ragebaiter/extension build
pnpm --filter @ragebaiter/extension lint
pnpm --filter @ragebaiter/extension typecheck
pnpm --filter @ragebaiter/extension test:unit
pnpm --filter @ragebaiter/extension test:integration
pnpm --filter @ragebaiter/extension test:e2e
```

## CONVENTIONS

- `vite.config.ts` picks `public/manifest.dev.json` vs `public/manifest.prod.json` by mode.
- Build output is `dist/`; Chrome should load `extension/dist` as unpacked.
- Background/content/sidepanel are intentionally separate domains; do not blur responsibilities unless a shared contract truly emerges.
- Runtime messaging should flow through `src/messaging/*`, not ad hoc payload shapes.
- Unit tests run in `jsdom` with global `chrome` stubbing from `../__tests__/setup/extension.setup.ts`.
- Integration tests live in `tests/**/*.integration.test.ts`; Playwright specs live in `e2e/*.spec.ts`.

## ANTI-PATTERNS

- Do not change `MESSAGE_TYPES` or payload envelopes in only one runtime surface.
- Do not bypass fetcher layers when talking to backend analyze endpoints; that is where shared types and response normalization live.
- Do not assume e2e is headless-safe by default; Playwright config runs Chromium with the built extension loaded and `headless: false`.
- Do not treat `content-script.tsx` as simple UI code; it owns selectors, observers, injection, and the visualization bridge.
- Do not rely on bundle-size enforcement from `build`; perf reporting is report-only today.

## GOTCHAS

- `playwright.config.ts` serves fixtures from `e2e/fixtures` and rebuilds the extension in `global-setup.ts`.
- `service-worker.ts` owns quota fetches, feedback queue behavior, and alarm scheduling, so side effects tend to collect there.
- `sidepanel.tsx` mixes quiz, auth-adjacent privacy actions, and debug/settings state; changes can ripple across multiple tabs/views.
