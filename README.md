# RageBaiter

## Mission
RageBaiter is a Manifest V3 Chrome extension built to nudge Twitter/X users out of echo chambers. It passively monitors tweets, analyzes political bias and logical fallacies with LLM-powered vectors, compares them against each user’s political compass, and surfaces Socratic interventions when bias-confirming content is detected.

## Technology stack
| Layer | Technology |
| --- | --- |
| Extension runtime | Chrome Extension MV3 + Vite (CRXJS) |
| UI | React 19 + Tailwind CSS |
| State | Zustand |
| Shared logic | TypeScript, vite/tsconfigs, shared vector/math helpers |
| Backend | Hono (Node 22) targeting edge deployments with Supabase/Postgres + pgvector + Gemini + OpenAI/Anthropic fallbacks |
| Tooling | pnpm, Turborepo, ESLint 9 flat config, Prettier, Vitest/Playwright |

## Getting started
1. `pnpm install` from the repo root.
2. Copy `.env.example` to `.env` and fill in the required API keys, Supabase URL/Key, extension IDs, and LLM credentials.
3. Build/run workspaces with Turborepo (example): `pnpm turbo run build` or `pnpm turbo run dev --parallel`.
4. Load `extension/dist` into Chrome as an unpacked extension (or use the Vite dev server) once the extension workspace has been built.
5. Start the backend locally via `pnpm --filter backend dev` (or the equivalent script) and point the extension at that endpoint while testing.

## Project layout
- `extension/`: React/Tailwind UI, content scripts, background/service worker, badge, popup, and side panel.
- `backend/`: Hono API routes for quiz, analysis, feedback, auth, and cache layers.
- `shared/`: Vector math, constants, and types reused in both extension and backend.
- `__tests__/`: Placeholder for unit, integration, and e2e suites (Vitest + Playwright).
- `.github/workflows/`: Intended CI for lint/test/build (to be filled).
- `PRD.md`: Detailed product requirements/instructions (kept private; ignored so it stays local only).

## Testing & validation
- `pnpm turbo run test` after unit/integration setup (tbd).
- `pnpm turbo run lint` to keep shared ESLint rules clean.
- `pnpm turbo run build` to verify Turborepo pipelines.

If you add workspace scripts, keep them in `package.json` so the root Turborepo commands can orchestrate the extension, backend, and shared packages.
