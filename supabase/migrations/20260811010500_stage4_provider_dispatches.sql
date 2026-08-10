-- Orbit Stage 4 provider dispatch ledger.
-- This is a second idempotency barrier at the provider boundary so a race between
-- the worker and a founder-triggered execution cannot produce duplicate sends.

create table if not exists public.orbit_provider_dispatches (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  action_request_id uuid not null,
  request_id uuid not null,
  idempotency_key text not null,
  channel text not null,
  provider text,
  status text not null default 'started',
  provider_request_id text,
  response_summary jsonb not null default '{}'::jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint orbit_provider_dispatches_workspace_id_id_key unique (workspace_id,id),
  constraint orbit_provider_dispatches_idempotency_key unique (workspace_id,idempotency_key),
  constraint orbit_provider_dispatches_request_key unique (workspace_id,request_id),
  constraint orbit_provider_dispatches_action_fk foreign key (workspace_id,action_request_id)
    references public.orbit_external_action_requests(workspace_id,id) on delete cascade,
  constraint orbit_provider_dispatches_channel_check check (channel in ('email','whatsapp')),
  constraint orbit_provider_dispatches_status_check check (status in ('started','succeeded','failed','blocked')),
  constraint orbit_provider_dispatches_idempotency_check check (char_length(idempotency_key) between 1 and 180),
  constraint orbit_provider_dispatches_provider_check check ((provider is null) or char_length(provider) <= 120),
  constraint orbit_provider_dispatches_provider_request_check check ((provider_request_id is null) or char_length(provider_request_id) <= 500),
  constraint orbit_provider_dispatches_error_code_check check ((error_code is null) or char_length(error_code) <= 160)
);

create index if not exists orbit_provider_dispatches_action_idx
  on public.orbit_provider_dispatches(workspace_id,action_request_id);
create index if not exists orbit_provider_dispatches_status_idx
  on public.orbit_provider_dispatches(workspace_id,status,created_at desc);

create trigger orbit_provider_dispatches_set_updated_at
before update on public.orbit_provider_dispatches
for each row execute function private.set_updated_at();

alter table public.orbit_provider_dispatches enable row level security;

create policy orbit_provider_dispatches_select_member on public.orbit_provider_dispatches
for select using ((select private.is_workspace_member(workspace_id)));
create policy orbit_provider_dispatches_insert_admin on public.orbit_provider_dispatches
for insert with check ((select private.is_workspace_admin(workspace_id)));
create policy orbit_provider_dispatches_update_admin on public.orbit_provider_dispatches
for update using ((select private.is_workspace_admin(workspace_id))) with check ((select private.is_workspace_admin(workspace_id)));
create policy orbit_provider_dispatches_delete_admin on public.orbit_provider_dispatches
for delete using ((select private.is_workspace_admin(workspace_id)));

revoke all on table public.orbit_provider_dispatches from anon;
grant select,insert,update,delete on table public.orbit_provider_dispatches to authenticated;
