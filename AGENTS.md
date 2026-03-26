# PROJECT KNOWLEDGE BASE

**Generated:** 2026-03-25
**Commit:** 0707afd
**Branch:** master

## OVERVIEW

RageBaiter is a pnpm/Turborepo monorepo for a Chrome MV3 extension, a Hono backend, a shared TypeScript contract package, and a separate React visualization app. The highest-risk boundaries are shared analysis types, extension runtime messaging, and backend phase-analysis services.

## STRUCTURE

```text
RageBaiter/
├── extension/      # MV3 extension: content script, service worker, popup, sidepanel, e2e
├── backend/        # Hono API, auth, analyze routes, quota and cache services
├── shared/         # Cross-package types, thresholds, vector math, political filtering
├── visualization/  # Separate React app for drift/vector visualization
├── __tests__/      # shared setup/mocks for extension Vitest
├── docs/           # store, setup, and screenshot guidance
├── scripts/        # repo-level automation such as perf-check
└── supabase/       # migrations and DB setup files
```

## WHERE TO LOOK

| Task                   | Location                                                    | Notes                                            |
| ---------------------- | ----------------------------------------------------------- | ------------------------------------------------ |
| Run repo-wide checks   | `package.json`, `turbo.json`                                | Root scripts wrap `turbo run ...`                |
| Extension architecture | `extension/`, `extension/AGENTS.md`                         | Background/content/sidepanel contracts live here |
| Backend AI behavior    | `backend/src/services/AGENTS.md`                            | Phase analyzers, quota, cache, auth helpers      |
| Shared types/constants | `shared/src/AGENTS.md`                                      | Changes ripple into backend and extension        |
| Backend route wiring   | `backend/src/index.ts`, `backend/src/routes/`               | Mounted under `/api/*`                           |
| Visualization behavior | `visualization/src/`                                        | Separate app; no `@ragebaiter/shared` dependency |
| Test layout            | `vitest.workspace.ts`, `extension/e2e/`, `extension/tests/` | Vitest workspaces exclude visualization          |

## CODE MAP

| Symbol / Surface      | Type            | Location                                     | Role                                                     |
| --------------------- | --------------- | -------------------------------------------- | -------------------------------------------------------- |
| `app`                 | Hono app        | `backend/src/index.ts`                       | Wires CORS, auth, rate limits, and `/api/*` routes       |
| `/api/analyze/phase1` | route           | `backend/src/routes/analyze-phase1.ts`       | Phase 1 analysis API                                     |
| `/api/analyze/phase2` | route           | `backend/src/routes/analyze-phase2.ts`       | Phase 2 analysis + quota/BYOK behavior                   |
| `shared` exports      | package surface | `shared/src/index.ts`                        | Re-exports shared types, constants, vector math, filters |
| service worker        | runtime entry   | `extension/src/background/service-worker.ts` | Message routing, queueing, quota, alarms                 |
| content script        | runtime entry   | `extension/src/content/content-script.tsx`   | Tweet detection, DOM injection, visualization bridge     |
| sidepanel             | UI entry        | `extension/src/sidepanel/sidepanel.tsx`      | Quiz, settings, debug, privacy actions                   |
| visualization app     | app entry       | `visualization/src/main.tsx`                 | Separate React app bootstrapping                         |

## CONVENTIONS

- Root scripts are authoritative: `lint`, `typecheck`, `build`, `test`, `test:unit`, `test:integration`, `test:e2e`, `format`.
- Formatting is check-only at root: `pnpm format` runs `prettier --check .`.
- TS strictness is intentionally high: `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitOverride`.
- ESLint flat config enforces `@typescript-eslint/consistent-type-imports`.
- Turbo caches `build` outputs only; lint/typecheck/test tasks declare no outputs.
- Workspace packages are exactly `extension`, `backend`, `shared`, `visualization`.

## ANTI-PATTERNS (THIS PROJECT)

- Do not treat `shared/src` as local-only utility code; it is the cross-package contract surface.
- Do not assume CI is push-triggered; `.github/workflows/ci.yml` is `workflow_dispatch` only.
- Do not expect extension bundle budgets to fail builds automatically; `extension` build calls `perf-check` in `--report-only` mode.
- Do not duplicate parent AGENTS content in child files; child files should add only local commands, hazards, and contracts.
- Do not request broader Chrome permissions casually; docs explicitly justify least-privilege choices like `activeTab` over `tabs`.

## UNIQUE STYLES

- Backend HTTP contracts often use snake_case payload fields even when extension code is camelCase internally.
- Extension runtime is split by responsibility: `background/`, `content/`, `sidepanel/`, and `messaging/` rather than one shared UI surface.
- Visualization is intentionally decoupled from `@ragebaiter/shared`; its integration boundary is bridge messages and Supabase, not workspace types.

## COMMANDS

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm build
pnpm test
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm test:e2e:install
pnpm format
pnpm turbo run dev --parallel
```

## NOTES

- Node engine is `>=20.11.0`; README recommends Node 22 for local work.
- Extension e2e is Playwright-only and builds the extension again in `extension/e2e/global-setup.ts`.
- Visualization is real product code, but it is smaller and more standard than extension/backend; avoid adding nested AGENTS there unless local complexity grows.
