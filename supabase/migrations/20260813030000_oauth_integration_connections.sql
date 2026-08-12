create table if not exists public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null,
  status text not null default 'connected',
  provider_installation_id text,
  provider_account_id text,
  provider_account_name text,
  provider_account_type text,
  access_token_ciphertext text,
  refresh_token_ciphertext text,
  token_expires_at timestamptz,
  scopes text[] not null default '{}',
  selected_assets jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  connected_by uuid references auth.users(id) on delete set null,
  connected_at timestamptz not null default now(),
  disconnected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint integration_connections_provider_check check (
    provider in ('github','vercel','google_search_console','google_analytics','meta','instagram','linkedin')
  ),
  constraint integration_connections_status_check check (
    status in ('connected','attention','disconnected')
  ),
  constraint integration_connections_workspace_provider_unique unique (workspace_id, provider)
);

create index if not exists integration_connections_workspace_idx
  on public.integration_connections(workspace_id);

create index if not exists integration_connections_provider_idx
  on public.integration_connections(provider);

alter table public.integration_connections enable row level security;

drop policy if exists integration_connections_select_admin on public.integration_connections;
create policy integration_connections_select_admin
on public.integration_connections
for select to authenticated
using ((select private.is_workspace_admin(integration_connections.workspace_id)));

drop policy if exists integration_connections_insert_admin on public.integration_connections;
create policy integration_connections_insert_admin
on public.integration_connections
for insert to authenticated
with check ((select private.is_workspace_admin(integration_connections.workspace_id)));

drop policy if exists integration_connections_update_admin on public.integration_connections;
create policy integration_connections_update_admin
on public.integration_connections
for update to authenticated
using ((select private.is_workspace_admin(integration_connections.workspace_id)))
with check ((select private.is_workspace_admin(integration_connections.workspace_id)));

drop policy if exists integration_connections_delete_admin on public.integration_connections;
create policy integration_connections_delete_admin
on public.integration_connections
for delete to authenticated
using ((select private.is_workspace_admin(integration_connections.workspace_id)));

comment on table public.integration_connections is
'Organisation-scoped OAuth and provider app installations. Provider secrets are encrypted server-side before storage and are never exposed to browsers.';
