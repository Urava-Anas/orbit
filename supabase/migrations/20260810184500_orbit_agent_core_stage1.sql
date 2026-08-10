-- Orbit Stage 1: shared agent-control layer.
-- Additive only: existing sales, Foundry, audit, and action-gateway tables are reused.

insert into public.capabilities (capability_key, module_key, description, risk_level)
values
  ('agents.read', 'command', 'Read agent definitions, runs, tasks, approvals, and execution history.', 'green'),
  ('agents.run', 'command', 'Start or continue an Orbit agent run within approved authority.', 'amber'),
  ('agents.manage', 'command', 'Create, configure, pause, or disable Orbit agents and their permissions.', 'red'),
  ('agents.approve', 'command', 'Approve or reject red-authority agent actions.', 'red')
on conflict (capability_key) do update
set module_key = excluded.module_key,
    description = excluded.description,
    risk_level = excluded.risk_level;

create table if not exists public.orbit_agents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  supervisor_agent_id uuid,
  agent_key text not null,
  name text not null,
  kind text not null default 'specialist',
  status text not null default 'draft',
  mission text not null,
  instructions text not null default '',
  model_provider text,
  model_name text,
  input_schema jsonb not null default '{}'::jsonb,
  output_schema jsonb not null default '{}'::jsonb,
  config jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orbit_agents_agent_key_check check (agent_key ~ '^[a-z][a-z0-9_]{1,63}$'),
  constraint orbit_agents_name_check check (char_length(name) between 2 and 120),
  constraint orbit_agents_kind_check check (kind in ('manager', 'specialist')),
  constraint orbit_agents_status_check check (status in ('draft', 'active', 'paused', 'disabled')),
  constraint orbit_agents_mission_check check (char_length(mission) between 3 and 1000),
  constraint orbit_agents_workspace_agent_key_key unique (workspace_id, agent_key),
  constraint orbit_agents_workspace_id_id_key unique (workspace_id, id),
  constraint orbit_agents_supervisor_fk foreign key (workspace_id, supervisor_agent_id)
    references public.orbit_agents(workspace_id, id) on delete restrict
);

create table if not exists public.orbit_agent_permissions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  agent_id uuid not null,
  capability_key text not null references public.capabilities(capability_key) on delete restrict,
  effect text not null default 'allow',
  authority_level text not null default 'green',
  conditions jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orbit_agent_permissions_effect_check check (effect in ('allow', 'deny')),
  constraint orbit_agent_permissions_authority_check check (authority_level in ('green', 'amber', 'red')),
  constraint orbit_agent_permissions_workspace_agent_key unique (workspace_id, agent_id, capability_key),
  constraint orbit_agent_permissions_agent_fk foreign key (workspace_id, agent_id)
    references public.orbit_agents(workspace_id, id) on delete cascade
);

create table if not exists public.orbit_agent_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  agent_id uuid not null,
  parent_run_id uuid,
  request_id uuid not null default gen_random_uuid(),
  trigger_type text not null default 'manual',
  status text not null default 'queued',
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  error jsonb,
  idempotency_key text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  constraint orbit_agent_runs_trigger_check check (trigger_type in ('manual', 'system', 'agent', 'schedule')),
  constraint orbit_agent_runs_status_check check (status in ('queued', 'running', 'waiting_approval', 'succeeded', 'failed', 'cancelled')),
  constraint orbit_agent_runs_workspace_id_id_key unique (workspace_id, id),
  constraint orbit_agent_runs_agent_fk foreign key (workspace_id, agent_id)
    references public.orbit_agents(workspace_id, id) on delete restrict,
  constraint orbit_agent_runs_parent_fk foreign key (workspace_id, parent_run_id)
    references public.orbit_agent_runs(workspace_id, id) on delete restrict
);

create table if not exists public.orbit_agent_tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  run_id uuid not null,
  assigned_agent_id uuid not null,
  parent_task_id uuid,
  task_type text not null,
  title text not null,
  status text not null default 'queued',
  risk_level text not null default 'green',
  priority smallint not null default 50,
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  error jsonb,
  attempts smallint not null default 0,
  max_attempts smallint not null default 3,
  idempotency_key text,
  scheduled_at timestamptz not null default now(),
  locked_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orbit_agent_tasks_status_check check (status in ('queued', 'running', 'blocked', 'waiting_approval', 'succeeded', 'failed', 'cancelled')),
  constraint orbit_agent_tasks_risk_check check (risk_level in ('green', 'amber', 'red')),
  constraint orbit_agent_tasks_priority_check check (priority between 0 and 100),
  constraint orbit_agent_tasks_attempts_check check (attempts >= 0 and max_attempts between 1 and 20 and attempts <= max_attempts),
  constraint orbit_agent_tasks_title_check check (char_length(title) between 2 and 240),
  constraint orbit_agent_tasks_workspace_id_id_key unique (workspace_id, id),
  constraint orbit_agent_tasks_run_fk foreign key (workspace_id, run_id)
    references public.orbit_agent_runs(workspace_id, id) on delete cascade,
  constraint orbit_agent_tasks_agent_fk foreign key (workspace_id, assigned_agent_id)
    references public.orbit_agents(workspace_id, id) on delete restrict,
  constraint orbit_agent_tasks_parent_fk foreign key (workspace_id, parent_task_id)
    references public.orbit_agent_tasks(workspace_id, id) on delete restrict
);

create table if not exists public.orbit_agent_approvals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  run_id uuid not null,
  task_id uuid not null,
  requested_by_agent_id uuid not null,
  authority_level text not null,
  proposed_action text not null,
  proposed_payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  decision_reason text,
  decided_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  decided_at timestamptz,
  constraint orbit_agent_approvals_authority_check check (authority_level in ('amber', 'red')),
  constraint orbit_agent_approvals_status_check check (status in ('pending', 'approved', 'rejected', 'expired', 'cancelled')),
  constraint orbit_agent_approvals_action_check check (char_length(proposed_action) between 2 and 160),
  constraint orbit_agent_approvals_workspace_id_id_key unique (workspace_id, id),
  constraint orbit_agent_approvals_run_fk foreign key (workspace_id, run_id)
    references public.orbit_agent_runs(workspace_id, id) on delete cascade,
  constraint orbit_agent_approvals_task_fk foreign key (workspace_id, task_id)
    references public.orbit_agent_tasks(workspace_id, id) on delete cascade,
  constraint orbit_agent_approvals_agent_fk foreign key (workspace_id, requested_by_agent_id)
    references public.orbit_agents(workspace_id, id) on delete restrict
);

create table if not exists public.orbit_agent_events (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  run_id uuid not null,
  task_id uuid,
  agent_id uuid not null,
  level text not null default 'info',
  event_type text not null,
  message text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint orbit_agent_events_level_check check (level in ('debug', 'info', 'warn', 'error')),
  constraint orbit_agent_events_event_type_check check (char_length(event_type) between 2 and 120),
  constraint orbit_agent_events_message_check check (char_length(message) between 1 and 2000),
  constraint orbit_agent_events_run_fk foreign key (workspace_id, run_id)
    references public.orbit_agent_runs(workspace_id, id) on delete cascade,
  constraint orbit_agent_events_task_fk foreign key (workspace_id, task_id)
    references public.orbit_agent_tasks(workspace_id, id) on delete cascade,
  constraint orbit_agent_events_agent_fk foreign key (workspace_id, agent_id)
    references public.orbit_agents(workspace_id, id) on delete restrict
);

create unique index if not exists orbit_agent_runs_idempotency_key_unique
  on public.orbit_agent_runs(workspace_id, idempotency_key)
  where idempotency_key is not null;

create unique index if not exists orbit_agent_tasks_idempotency_key_unique
  on public.orbit_agent_tasks(workspace_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists orbit_agents_workspace_status_idx
  on public.orbit_agents(workspace_id, status);
create index if not exists orbit_agent_permissions_agent_idx
  on public.orbit_agent_permissions(workspace_id, agent_id);
create index if not exists orbit_agent_runs_workspace_status_idx
  on public.orbit_agent_runs(workspace_id, status, created_at desc);
create index if not exists orbit_agent_runs_agent_idx
  on public.orbit_agent_runs(workspace_id, agent_id, created_at desc);
create index if not exists orbit_agent_tasks_queue_idx
  on public.orbit_agent_tasks(workspace_id, status, priority desc, scheduled_at asc);
create index if not exists orbit_agent_tasks_agent_idx
  on public.orbit_agent_tasks(workspace_id, assigned_agent_id, status);
create index if not exists orbit_agent_approvals_pending_idx
  on public.orbit_agent_approvals(workspace_id, status, created_at asc);
create index if not exists orbit_agent_events_run_idx
  on public.orbit_agent_events(workspace_id, run_id, created_at asc);
create index if not exists orbit_agent_events_task_idx
  on public.orbit_agent_events(workspace_id, task_id, created_at asc)
  where task_id is not null;

create trigger orbit_agents_set_updated_at
before update on public.orbit_agents
for each row execute function private.set_updated_at();

create trigger orbit_agent_permissions_set_updated_at
before update on public.orbit_agent_permissions
for each row execute function private.set_updated_at();

create trigger orbit_agent_tasks_set_updated_at
before update on public.orbit_agent_tasks
for each row execute function private.set_updated_at();

alter table public.orbit_agents enable row level security;
alter table public.orbit_agent_permissions enable row level security;
alter table public.orbit_agent_runs enable row level security;
alter table public.orbit_agent_tasks enable row level security;
alter table public.orbit_agent_approvals enable row level security;
alter table public.orbit_agent_events enable row level security;

create policy orbit_agents_select_member on public.orbit_agents
for select using ((select private.is_workspace_member(workspace_id)));
create policy orbit_agents_insert_admin on public.orbit_agents
for insert with check ((select private.is_workspace_admin(workspace_id)));
create policy orbit_agents_update_admin on public.orbit_agents
for update using ((select private.is_workspace_admin(workspace_id)))
with check ((select private.is_workspace_admin(workspace_id)));
create policy orbit_agents_delete_admin on public.orbit_agents
for delete using ((select private.is_workspace_admin(workspace_id)));

create policy orbit_agent_permissions_select_member on public.orbit_agent_permissions
for select using ((select private.is_workspace_member(workspace_id)));
create policy orbit_agent_permissions_insert_admin on public.orbit_agent_permissions
for insert with check ((select private.is_workspace_admin(workspace_id)));
create policy orbit_agent_permissions_update_admin on public.orbit_agent_permissions
for update using ((select private.is_workspace_admin(workspace_id)))
with check ((select private.is_workspace_admin(workspace_id)));
create policy orbit_agent_permissions_delete_admin on public.orbit_agent_permissions
for delete using ((select private.is_workspace_admin(workspace_id)));

create policy orbit_agent_runs_select_admin on public.orbit_agent_runs
for select using ((select private.is_workspace_admin(workspace_id)));
create policy orbit_agent_runs_insert_admin on public.orbit_agent_runs
for insert with check ((select private.is_workspace_admin(workspace_id)));
create policy orbit_agent_runs_update_admin on public.orbit_agent_runs
for update using ((select private.is_workspace_admin(workspace_id)))
with check ((select private.is_workspace_admin(workspace_id)));
create policy orbit_agent_runs_delete_admin on public.orbit_agent_runs
for delete using ((select private.is_workspace_admin(workspace_id)));

create policy orbit_agent_tasks_select_admin on public.orbit_agent_tasks
for select using ((select private.is_workspace_admin(workspace_id)));
create policy orbit_agent_tasks_insert_admin on public.orbit_agent_tasks
for insert with check ((select private.is_workspace_admin(workspace_id)));
create policy orbit_agent_tasks_update_admin on public.orbit_agent_tasks
for update using ((select private.is_workspace_admin(workspace_id)))
with check ((select private.is_workspace_admin(workspace_id)));
create policy orbit_agent_tasks_delete_admin on public.orbit_agent_tasks
for delete using ((select private.is_workspace_admin(workspace_id)));

create policy orbit_agent_approvals_select_admin on public.orbit_agent_approvals
for select using ((select private.is_workspace_admin(workspace_id)));
create policy orbit_agent_approvals_insert_admin on public.orbit_agent_approvals
for insert with check ((select private.is_workspace_admin(workspace_id)));
create policy orbit_agent_approvals_update_admin on public.orbit_agent_approvals
for update using ((select private.is_workspace_admin(workspace_id)))
with check ((select private.is_workspace_admin(workspace_id)));
create policy orbit_agent_approvals_delete_admin on public.orbit_agent_approvals
for delete using ((select private.is_workspace_admin(workspace_id)));

create policy orbit_agent_events_select_admin on public.orbit_agent_events
for select using ((select private.is_workspace_admin(workspace_id)));
create policy orbit_agent_events_insert_admin on public.orbit_agent_events
for insert with check ((select private.is_workspace_admin(workspace_id)));
create policy orbit_agent_events_delete_admin on public.orbit_agent_events
for delete using ((select private.is_workspace_admin(workspace_id)));

revoke all on table public.orbit_agents from anon;
revoke all on table public.orbit_agent_permissions from anon;
revoke all on table public.orbit_agent_runs from anon;
revoke all on table public.orbit_agent_tasks from anon;
revoke all on table public.orbit_agent_approvals from anon;
revoke all on table public.orbit_agent_events from anon;

grant select, insert, update, delete on table public.orbit_agents to authenticated;
grant select, insert, update, delete on table public.orbit_agent_permissions to authenticated;
grant select, insert, update, delete on table public.orbit_agent_runs to authenticated;
grant select, insert, update, delete on table public.orbit_agent_tasks to authenticated;
grant select, insert, update, delete on table public.orbit_agent_approvals to authenticated;
grant select, insert, delete on table public.orbit_agent_events to authenticated;
