create table if not exists public.orbit_workflow_registry (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  workflow_key text not null,
  domain text not null,
  display_name text not null,
  owner_module text not null,
  system_of_record text not null default 'orbit_postgres',
  execution_surface text not null default 'orbit',
  criticality text not null default 'standard'
    check (criticality in ('standard','revenue','financial','sensitive','safety')),
  routing_status text not null default 'planned'
    check (routing_status in ('planned','partial','routed','verified')),
  required_event_types text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, workflow_key)
);

create index if not exists orbit_workflow_registry_workspace_status_idx
  on public.orbit_workflow_registry(workspace_id, routing_status, domain);

drop trigger if exists set_orbit_workflow_registry_updated_at on public.orbit_workflow_registry;
create trigger set_orbit_workflow_registry_updated_at
before update on public.orbit_workflow_registry
for each row execute function private.set_updated_at();

alter table public.orbit_workflow_registry enable row level security;

revoke all on public.orbit_workflow_registry from anon, authenticated;
grant select, insert, update, delete on public.orbit_workflow_registry to authenticated;

create policy orbit_workflow_registry_select_member
on public.orbit_workflow_registry
for select
to authenticated
using ((select private.is_workspace_member(orbit_workflow_registry.workspace_id)));

create policy orbit_workflow_registry_insert_admin
on public.orbit_workflow_registry
for insert
to authenticated
with check (
  (select private.is_workspace_admin(orbit_workflow_registry.workspace_id))
  and (select private.orbit_workspace_can_write(orbit_workflow_registry.workspace_id))
);

create policy orbit_workflow_registry_update_admin
on public.orbit_workflow_registry
for update
to authenticated
using (
  (select private.is_workspace_admin(orbit_workflow_registry.workspace_id))
  and (select private.orbit_workspace_can_write(orbit_workflow_registry.workspace_id))
)
with check (
  (select private.is_workspace_admin(orbit_workflow_registry.workspace_id))
  and (select private.orbit_workspace_can_write(orbit_workflow_registry.workspace_id))
);

create policy orbit_workflow_registry_delete_admin
on public.orbit_workflow_registry
for delete
to authenticated
using (
  (select private.is_workspace_admin(orbit_workflow_registry.workspace_id))
  and (select private.orbit_workspace_can_write(orbit_workflow_registry.workspace_id))
);
