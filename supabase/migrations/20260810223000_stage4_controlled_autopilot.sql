-- Orbit Stage 4: controlled real-world Autopilot.
-- Default posture is fail-closed: Autopilot OFF, kill switch engaged,
-- external actions disabled. Agents may only act through the centralized gateway.

insert into public.capabilities (capability_key, module_key, description, risk_level)
values
  ('autopilot.read', 'command', 'View Autopilot state, preflight, policies, action queue, and incidents.', 'green'),
  ('autopilot.preflight', 'command', 'Run a read-only Autopilot safety and capacity preflight.', 'green'),
  ('autopilot.manage', 'command', 'Configure, start, pause, or stop workspace Autopilot.', 'red'),
  ('autopilot.action_request', 'command', 'Create a governed request for an irreversible Stage 4 action.', 'red'),
  ('autopilot.action_execute', 'command', 'Execute an approved Stage 4 action through the centralized gateway.', 'red'),
  ('cash.payment_request', 'cash', 'Send approved payment instructions without charging, collecting, refunding, or moving money.', 'red')
on conflict (capability_key) do update
set module_key = excluded.module_key,
    description = excluded.description,
    risk_level = excluded.risk_level;

create table if not exists public.orbit_autopilot_configs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  state text not null default 'off',
  mode text not null default 'approval',
  external_actions_enabled boolean not null default false,
  kill_switch_engaged boolean not null default true,
  timezone text not null default 'Asia/Karachi',
  working_hours_start time not null default '09:00',
  working_hours_end time not null default '20:00',
  working_days smallint[] not null default array[1,2,3,4,5,6]::smallint[],
  max_daily_outbound integer not null default 20,
  min_seconds_between_outbound integer not null default 120,
  max_open_opportunities integer not null default 100,
  max_active_projects integer not null default 10,
  max_consecutive_failures smallint not null default 3,
  consecutive_failures smallint not null default 0,
  last_external_action_at timestamptz,
  last_preflight_at timestamptz,
  last_preflight_result text,
  blocked_reason text,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orbit_autopilot_configs_workspace_key unique (workspace_id),
  constraint orbit_autopilot_configs_workspace_id_id_key unique (workspace_id,id),
  constraint orbit_autopilot_configs_state_check check (state in ('off','checking','running','pausing','degraded','blocked')),
  constraint orbit_autopilot_configs_mode_check check (mode in ('simulation','approval','policy')),
  constraint orbit_autopilot_configs_timezone_check check (char_length(timezone) between 1 and 80),
  constraint orbit_autopilot_configs_working_days_check check (working_days <@ array[0,1,2,3,4,5,6]::smallint[] and cardinality(working_days) between 1 and 7),
  constraint orbit_autopilot_configs_daily_check check (max_daily_outbound between 1 and 500),
  constraint orbit_autopilot_configs_interval_check check (min_seconds_between_outbound between 0 and 86400),
  constraint orbit_autopilot_configs_open_sales_check check (max_open_opportunities between 1 and 10000),
  constraint orbit_autopilot_configs_projects_check check (max_active_projects between 1 and 1000),
  constraint orbit_autopilot_configs_failures_check check (max_consecutive_failures between 1 and 20 and consecutive_failures between 0 and 20),
  constraint orbit_autopilot_configs_preflight_result_check check ((last_preflight_result is null) or last_preflight_result in ('pass','degraded','blocked')),
  constraint orbit_autopilot_configs_blocked_reason_check check ((blocked_reason is null) or char_length(blocked_reason) <= 2000)
);

create table if not exists public.orbit_autopilot_policy_grants (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  capability_key text not null references public.capabilities(capability_key) on delete restrict,
  enabled boolean not null default true,
  approval_mode text not null default 'manual',
  constraints jsonb not null default '{}'::jsonb,
  approved_by uuid not null references auth.users(id) on delete restrict,
  approved_at timestamptz not null default now(),
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orbit_autopilot_policy_grants_workspace_id_id_key unique (workspace_id,id),
  constraint orbit_autopilot_policy_grants_capability_key unique (workspace_id,capability_key),
  constraint orbit_autopilot_policy_grants_mode_check check (approval_mode in ('manual','policy')),
  constraint orbit_autopilot_policy_grants_dates_check check ((valid_until is null) or valid_until > valid_from)
);

create table if not exists public.orbit_autopilot_preflight_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  config_id uuid not null,
  result text not null,
  checks jsonb not null default '[]'::jsonb,
  active_agent_count smallint not null default 0,
  open_opportunity_count integer not null default 0,
  active_project_count integer not null default 0,
  pending_action_count integer not null default 0,
  critical_incident_count integer not null default 0,
  gateway_configured boolean not null default false,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint orbit_autopilot_preflight_workspace_id_id_key unique (workspace_id,id),
  constraint orbit_autopilot_preflight_result_check check (result in ('pass','degraded','blocked')),
  constraint orbit_autopilot_preflight_counts_check check (
    active_agent_count >= 0 and open_opportunity_count >= 0 and active_project_count >= 0 and pending_action_count >= 0 and critical_incident_count >= 0
  ),
  constraint orbit_autopilot_preflight_config_fk foreign key (workspace_id,config_id)
    references public.orbit_autopilot_configs(workspace_id,id) on delete cascade
);

create table if not exists public.orbit_external_action_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  request_id uuid not null default gen_random_uuid(),
  opportunity_id uuid not null,
  run_id uuid not null,
  task_id uuid not null,
  agent_id uuid not null,
  capability_key text not null references public.capabilities(capability_key) on delete restrict,
  authority_level text not null default 'red',
  channel text not null,
  destination text,
  artifact_refs jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  payload_hash text not null,
  status text not null default 'draft',
  approval_source text not null default 'none',
  approval_id uuid,
  policy_grant_id uuid,
  idempotency_key text not null,
  attempts smallint not null default 0,
  max_attempts smallint not null default 3,
  scheduled_at timestamptz not null default now(),
  locked_at timestamptz,
  lock_expires_at timestamptz,
  provider text,
  provider_request_id text,
  response_summary jsonb not null default '{}'::jsonb,
  error jsonb,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  quarantined_at timestamptz,
  constraint orbit_external_action_requests_workspace_id_id_key unique (workspace_id,id),
  constraint orbit_external_action_requests_request_key unique (workspace_id,request_id),
  constraint orbit_external_action_requests_idempotency_key unique (workspace_id,idempotency_key),
  constraint orbit_external_action_requests_opportunity_fk foreign key (workspace_id,opportunity_id)
    references public.orbit_sales_opportunities(workspace_id,id) on delete cascade,
  constraint orbit_external_action_requests_run_fk foreign key (workspace_id,run_id)
    references public.orbit_agent_runs(workspace_id,id) on delete cascade,
  constraint orbit_external_action_requests_task_fk foreign key (workspace_id,task_id)
    references public.orbit_agent_tasks(workspace_id,id) on delete cascade,
  constraint orbit_external_action_requests_agent_fk foreign key (workspace_id,agent_id)
    references public.orbit_agents(workspace_id,id) on delete restrict,
  constraint orbit_external_action_requests_approval_fk foreign key (workspace_id,approval_id)
    references public.orbit_agent_approvals(workspace_id,id) on delete set null,
  constraint orbit_external_action_requests_policy_fk foreign key (workspace_id,policy_grant_id)
    references public.orbit_autopilot_policy_grants(workspace_id,id) on delete set null,
  constraint orbit_external_action_requests_authority_check check (authority_level in ('amber','red')),
  constraint orbit_external_action_requests_channel_check check (channel in ('email','whatsapp','phone','manual','system')),
  constraint orbit_external_action_requests_destination_check check ((destination is null) or char_length(destination) <= 500),
  constraint orbit_external_action_requests_payload_hash_check check (char_length(payload_hash) = 64),
  constraint orbit_external_action_requests_status_check check (status in ('draft','waiting_approval','approved','queued','executing','succeeded','failed','blocked','cancelled','quarantined')),
  constraint orbit_external_action_requests_approval_source_check check (approval_source in ('none','manual','policy')),
  constraint orbit_external_action_requests_attempts_check check (attempts >= 0 and max_attempts between 1 and 20 and attempts <= max_attempts),
  constraint orbit_external_action_requests_idempotency_check check (char_length(idempotency_key) between 1 and 180),
  constraint orbit_external_action_requests_provider_check check ((provider is null) or char_length(provider) <= 120),
  constraint orbit_external_action_requests_provider_request_check check ((provider_request_id is null) or char_length(provider_request_id) <= 500)
);

create table if not exists public.orbit_autopilot_incidents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  action_request_id uuid,
  severity text not null,
  incident_code text not null,
  summary text not null,
  details jsonb not null default '{}'::jsonb,
  status text not null default 'open',
  created_by uuid references auth.users(id) on delete set null,
  resolved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint orbit_autopilot_incidents_workspace_id_id_key unique (workspace_id,id),
  constraint orbit_autopilot_incidents_action_fk foreign key (workspace_id,action_request_id)
    references public.orbit_external_action_requests(workspace_id,id) on delete set null,
  constraint orbit_autopilot_incidents_severity_check check (severity in ('info','warning','critical')),
  constraint orbit_autopilot_incidents_code_check check (char_length(incident_code) between 2 and 120),
  constraint orbit_autopilot_incidents_summary_check check (char_length(summary) between 2 and 2000),
  constraint orbit_autopilot_incidents_status_check check (status in ('open','resolved','ignored'))
);

create index if not exists orbit_autopilot_configs_state_idx
  on public.orbit_autopilot_configs(workspace_id,state,updated_at desc);
create index if not exists orbit_autopilot_configs_created_by_idx
  on public.orbit_autopilot_configs(created_by);
create index if not exists orbit_autopilot_configs_updated_by_idx
  on public.orbit_autopilot_configs(updated_by);

create index if not exists orbit_autopilot_policy_capability_idx
  on public.orbit_autopilot_policy_grants(workspace_id,capability_key,enabled);
create index if not exists orbit_autopilot_policy_approved_by_idx
  on public.orbit_autopilot_policy_grants(approved_by);
create index if not exists orbit_autopilot_policy_created_by_idx
  on public.orbit_autopilot_policy_grants(created_by);

create index if not exists orbit_autopilot_preflight_config_idx
  on public.orbit_autopilot_preflight_runs(workspace_id,config_id,created_at desc);
create index if not exists orbit_autopilot_preflight_created_by_idx
  on public.orbit_autopilot_preflight_runs(created_by);

create index if not exists orbit_external_action_queue_idx
  on public.orbit_external_action_requests(workspace_id,status,scheduled_at,created_at)
  where status in ('waiting_approval','approved','queued','executing','failed');
create index if not exists orbit_external_action_opportunity_idx
  on public.orbit_external_action_requests(workspace_id,opportunity_id,created_at desc);
create index if not exists orbit_external_action_run_idx
  on public.orbit_external_action_requests(workspace_id,run_id);
create index if not exists orbit_external_action_task_idx
  on public.orbit_external_action_requests(workspace_id,task_id);
create index if not exists orbit_external_action_agent_idx
  on public.orbit_external_action_requests(workspace_id,agent_id);
create index if not exists orbit_external_action_capability_idx
  on public.orbit_external_action_requests(workspace_id,capability_key,created_at desc);
create index if not exists orbit_external_action_approval_idx
  on public.orbit_external_action_requests(workspace_id,approval_id)
  where approval_id is not null;
create index if not exists orbit_external_action_policy_idx
  on public.orbit_external_action_requests(workspace_id,policy_grant_id)
  where policy_grant_id is not null;
create index if not exists orbit_external_action_created_by_idx
  on public.orbit_external_action_requests(created_by);

create index if not exists orbit_autopilot_incidents_open_idx
  on public.orbit_autopilot_incidents(workspace_id,severity,created_at desc)
  where status='open';
create index if not exists orbit_autopilot_incidents_action_idx
  on public.orbit_autopilot_incidents(workspace_id,action_request_id)
  where action_request_id is not null;
create index if not exists orbit_autopilot_incidents_created_by_idx
  on public.orbit_autopilot_incidents(created_by)
  where created_by is not null;
create index if not exists orbit_autopilot_incidents_resolved_by_idx
  on public.orbit_autopilot_incidents(resolved_by)
  where resolved_by is not null;

create trigger orbit_autopilot_configs_set_updated_at
before update on public.orbit_autopilot_configs
for each row execute function private.set_updated_at();

create trigger orbit_autopilot_policy_grants_set_updated_at
before update on public.orbit_autopilot_policy_grants
for each row execute function private.set_updated_at();

create trigger orbit_external_action_requests_set_updated_at
before update on public.orbit_external_action_requests
for each row execute function private.set_updated_at();

alter table public.orbit_autopilot_configs enable row level security;
alter table public.orbit_autopilot_policy_grants enable row level security;
alter table public.orbit_autopilot_preflight_runs enable row level security;
alter table public.orbit_external_action_requests enable row level security;
alter table public.orbit_autopilot_incidents enable row level security;

create policy orbit_autopilot_configs_select_member on public.orbit_autopilot_configs
for select using ((select private.is_workspace_member(workspace_id)));
create policy orbit_autopilot_configs_insert_admin on public.orbit_autopilot_configs
for insert with check ((select private.is_workspace_admin(workspace_id)));
create policy orbit_autopilot_configs_update_admin on public.orbit_autopilot_configs
for update using ((select private.is_workspace_admin(workspace_id))) with check ((select private.is_workspace_admin(workspace_id)));
create policy orbit_autopilot_configs_delete_admin on public.orbit_autopilot_configs
for delete using ((select private.is_workspace_admin(workspace_id)));

create policy orbit_autopilot_policy_select_member on public.orbit_autopilot_policy_grants
for select using ((select private.is_workspace_member(workspace_id)));
create policy orbit_autopilot_policy_insert_admin on public.orbit_autopilot_policy_grants
for insert with check ((select private.is_workspace_admin(workspace_id)));
create policy orbit_autopilot_policy_update_admin on public.orbit_autopilot_policy_grants
for update using ((select private.is_workspace_admin(workspace_id))) with check ((select private.is_workspace_admin(workspace_id)));
create policy orbit_autopilot_policy_delete_admin on public.orbit_autopilot_policy_grants
for delete using ((select private.is_workspace_admin(workspace_id)));

create policy orbit_autopilot_preflight_select_member on public.orbit_autopilot_preflight_runs
for select using ((select private.is_workspace_member(workspace_id)));
create policy orbit_autopilot_preflight_insert_admin on public.orbit_autopilot_preflight_runs
for insert with check ((select private.is_workspace_admin(workspace_id)));
create policy orbit_autopilot_preflight_delete_admin on public.orbit_autopilot_preflight_runs
for delete using ((select private.is_workspace_admin(workspace_id)));

create policy orbit_external_action_select_member on public.orbit_external_action_requests
for select using ((select private.is_workspace_member(workspace_id)));
create policy orbit_external_action_insert_admin on public.orbit_external_action_requests
for insert with check ((select private.is_workspace_admin(workspace_id)));
create policy orbit_external_action_update_admin on public.orbit_external_action_requests
for update using ((select private.is_workspace_admin(workspace_id))) with check ((select private.is_workspace_admin(workspace_id)));
create policy orbit_external_action_delete_admin on public.orbit_external_action_requests
for delete using ((select private.is_workspace_admin(workspace_id)));

create policy orbit_autopilot_incidents_select_member on public.orbit_autopilot_incidents
for select using ((select private.is_workspace_member(workspace_id)));
create policy orbit_autopilot_incidents_insert_admin on public.orbit_autopilot_incidents
for insert with check ((select private.is_workspace_admin(workspace_id)));
create policy orbit_autopilot_incidents_update_admin on public.orbit_autopilot_incidents
for update using ((select private.is_workspace_admin(workspace_id))) with check ((select private.is_workspace_admin(workspace_id)));
create policy orbit_autopilot_incidents_delete_admin on public.orbit_autopilot_incidents
for delete using ((select private.is_workspace_admin(workspace_id)));

revoke all on table public.orbit_autopilot_configs, public.orbit_autopilot_policy_grants,
  public.orbit_autopilot_preflight_runs, public.orbit_external_action_requests,
  public.orbit_autopilot_incidents from anon;

grant select,insert,update,delete on table public.orbit_autopilot_configs,
  public.orbit_autopilot_policy_grants, public.orbit_external_action_requests,
  public.orbit_autopilot_incidents to authenticated;
grant select,insert,delete on table public.orbit_autopilot_preflight_runs to authenticated;
