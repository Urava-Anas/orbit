create table if not exists public.relay_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  category text not null default 'general',
  subject_template text not null default '',
  status text not null default 'draft' check (status in ('draft','active','archived')),
  current_version integer not null default 1,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id,name)
);

create table if not exists public.relay_template_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  template_id uuid not null references public.relay_templates(id) on delete cascade,
  version integer not null,
  schema jsonb not null default '{"blocks":[]}'::jsonb,
  variable_keys text[] not null default '{}',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique(template_id,version)
);

create table if not exists public.relay_modules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  module_type text not null default 'custom',
  schema jsonb not null,
  is_system boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id,name)
);

alter table public.relay_templates enable row level security;
alter table public.relay_template_versions enable row level security;
alter table public.relay_modules enable row level security;

create policy "relay_templates_workspace_read" on public.relay_templates for select
using (public.is_workspace_member(workspace_id));
create policy "relay_templates_workspace_write" on public.relay_templates for all
using (public.is_workspace_admin(workspace_id)) with check (public.is_workspace_admin(workspace_id));

create policy "relay_versions_workspace_read" on public.relay_template_versions for select
using (public.is_workspace_member(workspace_id));
create policy "relay_versions_workspace_write" on public.relay_template_versions for all
using (public.is_workspace_admin(workspace_id)) with check (public.is_workspace_admin(workspace_id));

create policy "relay_modules_workspace_read" on public.relay_modules for select
using (public.is_workspace_member(workspace_id));
create policy "relay_modules_workspace_write" on public.relay_modules for all
using (public.is_workspace_admin(workspace_id)) with check (public.is_workspace_admin(workspace_id));

create index if not exists relay_templates_workspace_idx on public.relay_templates(workspace_id,updated_at desc);
create index if not exists relay_versions_template_idx on public.relay_template_versions(template_id,version desc);
create index if not exists relay_modules_workspace_idx on public.relay_modules(workspace_id,updated_at desc);