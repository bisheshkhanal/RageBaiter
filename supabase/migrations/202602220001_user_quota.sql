create table if not exists public.user_quota (
  id bigint generated always as identity primary key,
  user_id bigint not null unique references public.users (id) on delete cascade,
  analyses_used integer not null default 0,
  reset_date timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint user_quota_analyses_used_nonneg check (analyses_used >= 0)
);

create index if not exists user_quota_user_id_idx
  on public.user_quota using btree (user_id);

alter table public.user_quota enable row level security;

drop policy if exists user_quota_select_own on public.user_quota;
create policy user_quota_select_own
  on public.user_quota
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.users u
      where u.id = user_quota.user_id
        and u.auth_id = (select auth.uid())
    )
  );

drop policy if exists user_quota_insert_own on public.user_quota;
create policy user_quota_insert_own
  on public.user_quota
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.users u
      where u.id = user_quota.user_id
        and u.auth_id = (select auth.uid())
    )
  );

drop policy if exists user_quota_update_own on public.user_quota;
create policy user_quota_update_own
  on public.user_quota
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.users u
      where u.id = user_quota.user_id
        and u.auth_id = (select auth.uid())
    )
  );

create or replace function public.increment_quota(p_user_id bigint)
returns json
language plpgsql
security definer
as $$
declare
  v_analyses_used integer;
  v_reset_date timestamptz;
  v_limit integer := 50;
  v_current_month timestamptz;
begin
  v_current_month := date_trunc('month', timezone('utc', now()));
  
  update public.user_quota
  set 
    analyses_used = analyses_used + 1,
    updated_at = timezone('utc', now())
  where user_id = p_user_id
    and analyses_used < v_limit
    and reset_date >= v_current_month
  returning analyses_used, reset_date into v_analyses_used, v_reset_date;
  
  if not found then
    select analyses_used, reset_date into v_analyses_used, v_reset_date
    from public.user_quota
    where user_id = p_user_id;
    
    return json_build_object(
      'success', false,
      'analyses_used', v_analyses_used,
      'limit', v_limit,
      'resets_at', v_reset_date
    );
  end if;
  
  return json_build_object(
    'success', true,
    'analyses_used', v_analyses_used,
    'limit', v_limit,
    'resets_at', v_reset_date
  );
end;
$$;

create or replace function public.get_or_create_quota(p_user_id bigint)
returns json
language plpgsql
security definer
as $$
declare
  v_analyses_used integer;
  v_reset_date timestamptz;
  v_limit integer := 50;
  v_current_month timestamptz;
begin
  v_current_month := date_trunc('month', timezone('utc', now()));
  
  select analyses_used, reset_date into v_analyses_used, v_reset_date
  from public.user_quota
  where user_id = p_user_id;
  
  if not found then
    insert into public.user_quota (user_id, analyses_used, reset_date)
    values (p_user_id, 0, v_current_month)
    returning analyses_used, reset_date into v_analyses_used, v_reset_date;
  elsif v_reset_date < v_current_month then
    update public.user_quota
    set analyses_used = 0, reset_date = v_current_month, updated_at = timezone('utc', now())
    where user_id = p_user_id
    returning analyses_used, reset_date into v_analyses_used, v_reset_date;
  end if;
  
  return json_build_object(
    'analyses_used', v_analyses_used,
    'limit', v_limit,
    'resets_at', v_reset_date
  );
end;
$$;
