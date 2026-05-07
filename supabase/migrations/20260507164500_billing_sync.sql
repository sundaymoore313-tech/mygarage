create table if not exists public.user_billing (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan_tier text not null default 'free' check (plan_tier in ('free', 'paid')),
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  subscription_status text,
  billing_email text,
  current_period_end timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists user_billing_set_updated_at on public.user_billing;
create trigger user_billing_set_updated_at
before update on public.user_billing
for each row
execute function public.set_updated_at();

create or replace function public.handle_new_user_billing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_billing (user_id, plan_tier, billing_email)
  values (new.id, 'free', new.email)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_billing on auth.users;
create trigger on_auth_user_created_billing
after insert on auth.users
for each row
execute function public.handle_new_user_billing();

alter table public.user_billing enable row level security;

drop policy if exists "Users can read own billing" on public.user_billing;
create policy "Users can read own billing"
on public.user_billing
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Service role manages billing" on public.user_billing;
create policy "Service role manages billing"
on public.user_billing
for all
to service_role
using (true)
with check (true);