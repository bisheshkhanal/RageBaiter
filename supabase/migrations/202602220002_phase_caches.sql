create table if not exists public.phase1_cache (
  id bigint generated always as identity primary key,
  tweet_id text not null unique,
  tweet_text text not null,
  vector_social double precision not null,
  vector_economic double precision not null,
  vector_populist double precision not null,
  fallacies jsonb not null default '[]'::jsonb,
  topic text,
  confidence double precision not null,
  created_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null
);

create table if not exists public.phase2_cache (
  id bigint generated always as identity primary key,
  tweet_id text not null,
  user_id bigint not null references public.users (id) on delete cascade,
  counter_argument text not null,
  logic_failure text not null,
  claim text not null,
  mechanism text not null,
  data_check text not null,
  socratic_challenge text not null,
  provider text,
  created_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null,
  constraint phase2_cache_unique unique (tweet_id, user_id)
);

create unique index if not exists phase1_cache_tweet_id_idx
  on public.phase1_cache using btree (tweet_id);

create index if not exists phase1_cache_expires_at_idx
  on public.phase1_cache using btree (expires_at);

create index if not exists phase2_cache_tweet_user_idx
  on public.phase2_cache using btree (tweet_id, user_id);

create index if not exists phase2_cache_expires_at_idx
  on public.phase2_cache using btree (expires_at);

create index if not exists phase2_cache_user_id_idx
  on public.phase2_cache using btree (user_id);

alter table public.phase2_cache enable row level security;

drop policy if exists phase2_cache_select_own on public.phase2_cache;
create policy phase2_cache_select_own
  on public.phase2_cache
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.users u
      where u.id = phase2_cache.user_id
        and u.auth_id = (select auth.uid())
    )
  );

drop policy if exists phase2_cache_insert_own on public.phase2_cache;
create policy phase2_cache_insert_own
  on public.phase2_cache
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.users u
      where u.id = phase2_cache.user_id
        and u.auth_id = (select auth.uid())
    )
  );
