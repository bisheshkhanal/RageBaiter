create extension if not exists pg_cron schema extensions;

select cron.schedule(
  'cleanup-expired-tweets',
  '0 2 * * *',
  $$delete from public.analyzed_tweets where expires_at < now()$$
);
