alter table public.users
  alter column vector_social set default 0.0,
  alter column vector_economic set default 0.0,
  alter column vector_populist set default 0.0;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (auth_id, vector_social, vector_economic, vector_populist)
  values (new.id, 0.0, 0.0, 0.0)
  on conflict (auth_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
