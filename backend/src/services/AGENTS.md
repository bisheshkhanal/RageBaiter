# BACKEND SERVICES GUIDE

## OVERVIEW

`backend/src/services` holds the highest-complexity backend logic: LLM analyzers, cache adapters, quota accounting, and auth-related helpers.

## WHERE TO LOOK

| Task                     | Location                                                        | Notes                                             |
| ------------------------ | --------------------------------------------------------------- | ------------------------------------------------- |
| Phase 1 analysis         | `phase1-analyzer.ts`                                            | Prompting, parsing, retry behavior                |
| Gemini-specific analysis | `gemini-analyzer.ts`                                            | Provider-specific request/response handling       |
| Phase 2 analysis         | `phase2-analyzer.ts`                                            | Provider multiplexing, normalization, quota paths |
| Cache behavior           | `phase1-cache.ts`, `phase2-cache.ts`, `tweet-analysis-cache.ts` | TTL and persistence logic                         |
| Quota logic              | `quota-service.ts`                                              | Feeds quota endpoint and phase2 exhaustion paths  |
| Auth integration         | `supabase-auth.ts`                                              | Backend-side auth helper surface                  |

## LOCAL COMMANDS

```bash
pnpm --filter @ragebaiter/backend lint
pnpm --filter @ragebaiter/backend typecheck
pnpm --filter @ragebaiter/backend build
pnpm --filter @ragebaiter/backend test:unit
pnpm --filter @ragebaiter/backend test:integration
```

## CONVENTIONS

- Service code is strict TypeScript and lives behind route handlers; keep HTTP parsing in `routes/`, not in service files.
- Analyzer services normalize model output into shared contract shapes rather than leaking provider-specific formats.
- Cache and quota helpers are part of request behavior, not optional extras; route semantics depend on them.
- Unit tests sit beside services where practical (`*.test.ts`); backend integration tests live under `src/**/*.integration.test.ts` outside this folder too.

## ANTI-PATTERNS

- Do not return loosely parsed model output; analyzer layers are expected to enforce structured/normalized results.
- Do not hardwire route-only concerns into services when they belong in `routes/` or middleware.
- Do not change quota or cache semantics without checking `routes/analyze-phase2.ts`, `routes/quota.ts`, and extension fetch expectations.
- Do not treat missing provider credentials as impossible; several flows are designed to degrade or branch on missing keys.

## GOTCHAS

- `phase2-analyzer.ts` is the densest service hotspot; review provider branching and normalization before editing it.
- `quota-service.ts` and cache services influence externally visible API behavior even though they look internal.
- Backend routes often serialize snake_case fields; keep the service layer shape boundaries clear when making changes.
