# SHARED CONTRACT GUIDE

## OVERVIEW

`shared/src` is the public contract package for backend and extension: types, thresholds, vector math, and political filtering.

## WHERE TO LOOK

| Task                      | Location                      | Notes                                     |
| ------------------------- | ----------------------------- | ----------------------------------------- |
| Cross-package data shapes | `types.ts`                    | Phase1/Phase2, vectors, quota, thresholds |
| Public package surface    | `index.ts`                    | Re-export boundary; keep this intentional |
| Shared constants          | `constants.ts`                | Thresholds and numeric bounds             |
| Vector utilities          | `vector-math.ts`              | Exported runtime helpers                  |
| Political filtering       | `political-keyword-filter.ts` | Shared detector used beyond one workspace |
| Tests                     | `*.test.ts`                   | Shared is unit-test oriented              |

## LOCAL COMMANDS

```bash
pnpm --filter @ragebaiter/shared lint
pnpm --filter @ragebaiter/shared typecheck
pnpm --filter @ragebaiter/shared build
pnpm --filter @ragebaiter/shared test:unit
pnpm --filter @ragebaiter/shared benchmark:political-filter
```

## CONVENTIONS

- Package entrypoint is `index.ts`; downstream consumers should rely on exported surface, not deep private imports.
- Build emits `dist/index.js` and `dist/index.d.ts`; package metadata points consumers there.
- Shared changes must stay conservative: backend and extension both depend on this workspace.
- Tests are plain `src/**/*.test.ts`; there is no separate local e2e harness here.

## ANTI-PATTERNS

- Do not add backend-only or extension-only behavior here unless it is truly shared runtime or type contract.
- Do not rename exported fields casually; extension fetchers and backend analyzers/routes compile against these shapes.
- Do not leave useful types un-exported from `index.ts` if they are part of the intended package surface.

## GOTCHAS

- This workspace is small, but it is high blast-radius: seemingly minor type edits can break multiple workspaces at once.
- `political-keyword-filter.benchmark.ts` exists as a maintained performance path; keep filter changes measurable.
