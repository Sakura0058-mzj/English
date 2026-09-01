create table if not exists public.user_app_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function public.set_user_app_data_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists user_app_data_updated_at on public.user_app_data;
create trigger user_app_data_updated_at
before update on public.user_app_data
for each row execute function public.set_user_app_data_updated_at();

alter table public.user_app_data enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update on public.user_app_data to authenticated;

drop policy if exists "Users can read their own app data" on public.user_app_data;
create policy "Users can read their own app data"
on public.user_app_data for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own app data" on public.user_app_data;
create policy "Users can insert their own app data"
on public.user_app_data for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own app data" on public.user_app_data;
create policy "Users can update their own app data"
on public.user_app_data for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
