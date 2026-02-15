create extension if not exists vector with schema extensions;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'feedback_type'
      and n.nspname = 'public'
  ) then
    create type public.feedback_type as enum ('acknowledged', 'agreed', 'dismissed');
  end if;
end
$$;

create table if not exists public.users (
  id bigint generated always as identity primary key,
  auth_id uuid not null unique references auth.users (id) on delete cascade,
  vector_social double precision not null,
  vector_economic double precision not null,
  vector_populist double precision not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.analyzed_tweets (
  id bigint generated always as identity primary key,
  tweet_id text not null,
  tweet_text text not null,
  vector_social double precision not null,
  vector_economic double precision not null,
  vector_populist double precision not null,
  fallacies jsonb not null default '[]'::jsonb,
  topic text,
  analyzed_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null
);

create table if not exists public.user_feedback (
  id bigint generated always as identity primary key,
  user_id bigint not null references public.users (id) on delete cascade,
  tweet_id text not null references public.analyzed_tweets (tweet_id) on delete cascade,
  feedback_type public.feedback_type not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.quiz_responses (
  id bigint generated always as identity primary key,
  user_id bigint not null references public.users (id) on delete cascade,
  answers jsonb not null,
  resulting_vector double precision[3] not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint quiz_responses_resulting_vector_len check (array_length(resulting_vector, 1) = 3)
);

create unique index if not exists analyzed_tweets_tweet_id_idx
  on public.analyzed_tweets using btree (tweet_id);

create index if not exists users_auth_id_idx
  on public.users using btree (auth_id);

create index if not exists user_feedback_user_id_idx
  on public.user_feedback using btree (user_id);

create index if not exists quiz_responses_user_id_idx
  on public.quiz_responses using btree (user_id);

alter table public.users enable row level security;
alter table public.user_feedback enable row level security;
alter table public.quiz_responses enable row level security;

drop policy if exists users_select_own on public.users;
create policy users_select_own
  on public.users
  for select
  to authenticated
  using ((select auth.uid()) = auth_id);

drop policy if exists users_insert_own on public.users;
create policy users_insert_own
  on public.users
  for insert
  to authenticated
  with check ((select auth.uid()) = auth_id);

drop policy if exists users_update_own on public.users;
create policy users_update_own
  on public.users
  for update
  to authenticated
  using ((select auth.uid()) = auth_id)
  with check ((select auth.uid()) = auth_id);

drop policy if exists users_delete_own on public.users;
create policy users_delete_own
  on public.users
  for delete
  to authenticated
  using ((select auth.uid()) = auth_id);

drop policy if exists user_feedback_select_own on public.user_feedback;
create policy user_feedback_select_own
  on public.user_feedback
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.users u
      where u.id = user_feedback.user_id
        and u.auth_id = (select auth.uid())
    )
  );

drop policy if exists user_feedback_insert_own on public.user_feedback;
create policy user_feedback_insert_own
  on public.user_feedback
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.users u
      where u.id = user_feedback.user_id
        and u.auth_id = (select auth.uid())
    )
  );

drop policy if exists user_feedback_update_own on public.user_feedback;
create policy user_feedback_update_own
  on public.user_feedback
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.users u
      where u.id = user_feedback.user_id
        and u.auth_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.users u
      where u.id = user_feedback.user_id
        and u.auth_id = (select auth.uid())
    )
  );

drop policy if exists user_feedback_delete_own on public.user_feedback;
create policy user_feedback_delete_own
  on public.user_feedback
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.users u
      where u.id = user_feedback.user_id
        and u.auth_id = (select auth.uid())
    )
  );

drop policy if exists quiz_responses_select_own on public.quiz_responses;
create policy quiz_responses_select_own
  on public.quiz_responses
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.users u
      where u.id = quiz_responses.user_id
        and u.auth_id = (select auth.uid())
    )
  );

drop policy if exists quiz_responses_insert_own on public.quiz_responses;
create policy quiz_responses_insert_own
  on public.quiz_responses
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.users u
      where u.id = quiz_responses.user_id
        and u.auth_id = (select auth.uid())
    )
  );

drop policy if exists quiz_responses_update_own on public.quiz_responses;
create policy quiz_responses_update_own
  on public.quiz_responses
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.users u
      where u.id = quiz_responses.user_id
        and u.auth_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.users u
      where u.id = quiz_responses.user_id
        and u.auth_id = (select auth.uid())
    )
  );

drop policy if exists quiz_responses_delete_own on public.quiz_responses;
create policy quiz_responses_delete_own
  on public.quiz_responses
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.users u
      where u.id = quiz_responses.user_id
        and u.auth_id = (select auth.uid())
    )
  );
