-- Add auth_id column to analyzed_tweets for per-user daily cap tracking
-- This allows counting analyses per user within a time window

alter table public.analyzed_tweets
  add column if not exists auth_id uuid references auth.users (id) on delete set null;

create index if not exists analyzed_tweets_auth_id_analyzed_at_idx
  on public.analyzed_tweets (auth_id, analyzed_at desc)
  where auth_id is not null;
