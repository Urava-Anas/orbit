-- Recover the production Apex Control Center server-side data model.
-- These tables intentionally use RLS with no client policies; Apex application
-- access is mediated by trusted server actions and service-role data access.

create table if not exists public.apex_authorized_users (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  role text not null default 'dispatcher' check (role in ('founder','admin','dispatcher','viewer')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, email)
);

create table if not exists public.apex_carriers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  legal_name text not null,
  dba_name text,
  mc_number text,
  dot_number text,
  email text,
  phone text,
  equipment text[] not null default '{}'::text[],
  fleet_size integer,
  home_state text,
  preferred_lanes text,
  status text not null default 'prospect' check (status in ('prospect','qualified','approved','blocked','inactive')),
  risk_level text not null default 'unknown' check (risk_level in ('unknown','green','amber','red')),
  safety_summary jsonb not null default '{}'::jsonb,
  source_summary jsonb not null default '{}'::jsonb,
  last_verified_at timestamptz,
  last_contacted_at timestamptz,
  next_follow_up_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.apex_carrier_checks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  carrier_id uuid not null references public.apex_carriers(id) on delete cascade,
  source text not null,
  external_ref text,
  verdict text not null default 'unknown' check (verdict in ('unknown','clear','review','block')),
  result jsonb not null default '{}'::jsonb,
  checked_at timestamptz not null default now(),
  checked_by text,
  created_at timestamptz not null default now()
);

create table if not exists public.apex_loads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  load_ref text,
  broker_name text,
  origin text not null,
  destination text not null,
  pickup_at timestamptz,
  delivery_at timestamptz,
  equipment text,
  rate numeric,
  miles integer,
  carrier_id uuid references public.apex_carriers(id) on delete set null,
  status text not null default 'new' check (status in ('new','quoted','offered','approved','booked','in_transit','delivered','cancelled','hold')),
  approval_required boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.apex_interactions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  carrier_id uuid references public.apex_carriers(id) on delete cascade,
  channel text not null check (channel in ('email','phone','sms','chat','internal')),
  direction text not null check (direction in ('inbound','outbound','internal')),
  subject text,
  summary text not null,
  external_thread_ref text,
  happened_at timestamptz not null default now(),
  created_by text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.apex_tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null,
  detail text,
  task_type text not null default 'operations',
  status text not null default 'open' check (status in ('open','in_progress','blocked','done')),
  priority text not null default 'medium' check (priority in ('low','medium','high','critical')),
  owner_email text,
  due_at timestamptz,
  related_type text,
  related_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.apex_integrations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider_key text not null,
  display_name text not null,
  category text not null,
  status text not null default 'not_connected' check (status in ('not_connected','configured','connected','degraded','blocked')),
  capabilities jsonb not null default '[]'::jsonb,
  last_checked_at timestamptz,
  last_error text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, provider_key)
);

create table if not exists public.apex_dispatch_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_email text,
  event_type text not null,
  entity_type text,
  entity_id uuid,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.apex_authorized_users enable row level security;
alter table public.apex_carriers enable row level security;
alter table public.apex_carrier_checks enable row level security;
alter table public.apex_loads enable row level security;
alter table public.apex_interactions enable row level security;
alter table public.apex_tasks enable row level security;
alter table public.apex_integrations enable row level security;
alter table public.apex_dispatch_events enable row level security;
