-- Enable RLS on analyzed_tweets.
-- The service_role key (used by backend) bypasses RLS automatically via BYPASSRLS privilege.
-- This blocks direct anon/authenticated access from the visualization client.
alter table public.analyzed_tweets enable row level security;
