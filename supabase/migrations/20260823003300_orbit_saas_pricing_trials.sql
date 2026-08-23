create table if not exists public.orbit_workspace_subscriptions (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  plan_key text not null default 'business' check (plan_key in ('founder','business','autopilot','enterprise')),
  status text not null default 'trialing' check (status in ('trialing','active','past_due','cancelled','comped')),
  billing_interval text not null default 'monthly' check (billing_interval in ('monthly','yearly','custom')),
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  current_period_ends_at timestamptz,
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  price_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (trial_ends_at is null or trial_started_at is null or trial_ends_at > trial_started_at)
);

create table if not exists public.orbit_plan_change_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  requested_plan_key text not null check (requested_plan_key in ('founder','business','autopilot','enterprise')),
  billing_interval text not null check (billing_interval in ('monthly','yearly','custom')),
  requested_by uuid not null references auth.users(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','accepted','rejected','cancelled')),
  note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists orbit_plan_change_requests_workspace_created_idx
  on public.orbit_plan_change_requests (workspace_id, created_at desc);

alter table public.orbit_workspace_subscriptions enable row level security;
alter table public.orbit_plan_change_requests enable row level security;

create policy orbit_workspace_subscriptions_select_member
  on public.orbit_workspace_subscriptions
  for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));

create policy orbit_plan_change_requests_select_member
  on public.orbit_plan_change_requests
  for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));

create policy orbit_plan_change_requests_insert_admin
  on public.orbit_plan_change_requests
  for insert to authenticated
  with check (
    (select private.is_workspace_admin(workspace_id))
    and requested_by = (select auth.uid())
  );

grant select on public.orbit_workspace_subscriptions to authenticated;
grant select, insert on public.orbit_plan_change_requests to authenticated;

create or replace function public.orbit_start_workspace_trial()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.orbit_workspace_subscriptions (
    workspace_id,
    plan_key,
    status,
    billing_interval,
    trial_started_at,
    trial_ends_at,
    price_snapshot
  ) values (
    new.id,
    'business',
    'trialing',
    'monthly',
    now(),
    now() + interval '15 days',
    jsonb_build_object(
      'catalog_version', 1,
      'trial_plan', 'business',
      'trial_days', 15,
      'monthly_cents', 7900,
      'yearly_cents', 79000,
      'currency', 'USD'
    )
  ) on conflict (workspace_id) do nothing;
  return new;
end;
$$;

revoke all on function public.orbit_start_workspace_trial() from public;

drop trigger if exists orbit_workspace_trial_after_insert on public.workspaces;
create trigger orbit_workspace_trial_after_insert
after insert on public.workspaces
for each row execute function public.orbit_start_workspace_trial();

insert into public.orbit_workspace_subscriptions (
  workspace_id,
  plan_key,
  status,
  billing_interval,
  price_snapshot
)
select
  w.id,
  'business',
  'comped',
  'monthly',
  jsonb_build_object(
    'catalog_version', 1,
    'source', 'legacy_workspace',
    'monthly_cents', 7900,
    'yearly_cents', 79000,
    'currency', 'USD'
  )
from public.workspaces w
on conflict (workspace_id) do nothing;
