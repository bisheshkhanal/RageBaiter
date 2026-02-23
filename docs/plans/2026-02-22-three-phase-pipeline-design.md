# Three-Phase Tweet Analysis Pipeline Design

**Date**: 2026-02-22
**Status**: Approved
**Author**: Sisyphus (Ultrawork Mode)

## Overview

This document captures the design decisions for RageBaiter's three-phase tweet analysis pipeline with freemium quota model.

## Architecture

### Current (Problem)

```
Tweet → Keyword Filter → Gemini (full analysis) → Decision Engine → Show/Hide
                              ↑
                    Expensive, computes everything
```

### New (Solution)

```
Tweet → Keyword Filter → Phase 1 (vector+fallacies, lite model, free)
                              ↓
                        Decision Engine (local math)
                              ↓
                    shouldIntervene === true?
                    ↓                    ↓
                   YES                   NO
                    ↓                    ↓
        Phase 2 (socratic, counts     Done
        against quota, BYOK optional)
                    ↓
              Show Intervention
```

## Design Decisions

| Decision          | Choice                                                                           | Rationale                                           |
| ----------------- | -------------------------------------------------------------------------------- | --------------------------------------------------- |
| Phase 1 model     | `gemini-2.0-flash-lite`                                                          | Cheapest, fastest. Sufficient for vector inference  |
| Phase 2 free tier | `gemini-2.5-flash` (developer key)                                               | Existing model, good quality                        |
| Phase 2 BYOK      | OpenAI (gpt-4o-mini) + Anthropic (claude-3-5-sonnet) + Google (gemini-2.0-flash) | Maximum flexibility per user request                |
| BYOK approach     | API key input field                                                              | OpenAI does not support ChatGPT Plus OAuth          |
| Key storage       | Client-side only (`chrome.storage.local`)                                        | Security - key never leaves user's machine          |
| Phase 2 call flow | Backend proxy (key per-request)                                                  | CORS handling, rate limiting, consistency           |
| Quota             | 50 Phase 2 calls/month per user                                                  | Balanced freemium model                             |
| Quota reset       | Monthly (calendar month)                                                         | Predictable, aligns with billing                    |
| Auth              | Sign-in required for all app usage                                               | Per-user quota tracking via Supabase                |
| Cache strategy    | Phase 1 global (by tweetId), Phase 2 per-user (tweetId+userId)                   | Phase 1 is objective, Phase 2 could be personalized |

## API Endpoints

### POST /api/analyze/phase1

- **Auth**: Not required
- **Body**: `{tweetId, tweetText}`
- **Response**: `{tweet_id, analysis: {tweet_vector, fallacies, topic, confidence}, source, latency_ms}`
- **Caching**: Global by tweetId

### POST /api/analyze/phase2

- **Auth**: Required
- **Body**: `{tweetId, tweetText, phase1Result, provider?, apiKey?}`
- **Response**: `{success: true, analysis: Phase2Analysis}` or `{success: false, error: QuotaExhaustedError}`
- **Quota**: Decremented if no BYOK key provided
- **Caching**: Per-user by tweetId+userId

### GET /api/quota

- **Auth**: Required
- **Response**: `{used, limit, remaining, resetsAt, hasOwnKey}`

## Database Schema

### user_quota

```sql
CREATE TABLE user_quota (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE REFERENCES users(id),
  analyses_used INTEGER NOT NULL DEFAULT 0,
  reset_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### phase1_cache

```sql
CREATE TABLE phase1_cache (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tweet_id TEXT NOT NULL UNIQUE,
  tweet_text TEXT NOT NULL,
  vector_social DOUBLE PRECISION NOT NULL,
  vector_economic DOUBLE PRECISION NOT NULL,
  vector_populist DOUBLE PRECISION NOT NULL,
  fallacies JSONB NOT NULL DEFAULT '[]',
  topic TEXT,
  confidence DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);
```

### phase2_cache

```sql
CREATE TABLE phase2_cache (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tweet_id TEXT NOT NULL,
  user_id BIGINT NOT NULL REFERENCES users(id),
  counter_argument TEXT NOT NULL,
  logic_failure TEXT NOT NULL,
  claim TEXT NOT NULL,
  mechanism TEXT NOT NULL,
  data_check TEXT NOT NULL,
  socratic_challenge TEXT NOT NULL,
  provider TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  UNIQUE(tweet_id, user_id)
);
```

## Files Created/Modified

### Backend (New)

- `backend/src/services/phase1-analyzer.ts`
- `backend/src/services/phase2-analyzer.ts`
- `backend/src/services/quota-service.ts`
- `backend/src/services/phase1-cache.ts`
- `backend/src/services/phase2-cache.ts`
- `backend/src/routes/analyze-phase1.ts`
- `backend/src/routes/analyze-phase2.ts`
- `backend/src/routes/quota.ts`

### Backend (Modified)

- `backend/src/index.ts` - Route registration

### Extension (New)

- `extension/src/background/phase1-fetcher.ts`
- `extension/src/background/phase2-fetcher.ts`
- `extension/src/components/AuthGate.tsx`
- `extension/src/sidepanel/UpgradePrompt.tsx`

### Extension (Modified)

- `extension/src/lib/llm-config.ts` - BYOK storage helpers
- `extension/src/background/pipeline.ts` - Two-phase flow
- `extension/src/messaging/protocol.ts` - New message types

### Shared (Modified)

- `shared/src/types.ts` - Phase1Analysis, Phase2Analysis, QuotaStatus, etc.

### Supabase (New)

- `supabase/migrations/202602220001_user_quota.sql`
- `supabase/migrations/202602220002_phase_caches.sql`

## Open Questions (Resolved)

1. ~~BYOK Provider Priority~~ → Default to OpenAI, add primary provider setting
2. ~~Quota Reset Timing~~ → 1st of month UTC midnight
3. ~~Phase 2 Fallback~~ → Show Phase 1-only intervention (not silent)
4. ~~Legacy /api/analyze~~ → Keep working with deprecation warning

## Risk Mitigations (from Oracle)

| Risk                                       | Mitigation                                        |
| ------------------------------------------ | ------------------------------------------------- |
| Provider mismatch (Gemini vs OpenAI drift) | Strict schema validation with type guards         |
| Race conditions in quota                   | Atomic increment via Supabase RPC                 |
| Vector contract drift                      | Reuse exact vector parsing from existing analyzer |
| Traffic spikes on Phase 1                  | Internal rate limiting + budget caps              |
