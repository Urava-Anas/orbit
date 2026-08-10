-- Cover Stage 1 agent foreign keys so deletes, joins, and integrity checks scale cleanly.

create index if not exists orbit_agents_supervisor_idx
  on public.orbit_agents(workspace_id, supervisor_agent_id)
  where supervisor_agent_id is not null;
create index if not exists orbit_agents_created_by_idx
  on public.orbit_agents(created_by)
  where created_by is not null;

create index if not exists orbit_agent_permissions_capability_idx
  on public.orbit_agent_permissions(capability_key);
create index if not exists orbit_agent_permissions_created_by_idx
  on public.orbit_agent_permissions(created_by)
  where created_by is not null;

create index if not exists orbit_agent_runs_parent_idx
  on public.orbit_agent_runs(workspace_id, parent_run_id)
  where parent_run_id is not null;
create index if not exists orbit_agent_runs_created_by_idx
  on public.orbit_agent_runs(created_by)
  where created_by is not null;

create index if not exists orbit_agent_tasks_run_idx
  on public.orbit_agent_tasks(workspace_id, run_id);
create index if not exists orbit_agent_tasks_parent_idx
  on public.orbit_agent_tasks(workspace_id, parent_task_id)
  where parent_task_id is not null;

create index if not exists orbit_agent_approvals_run_idx
  on public.orbit_agent_approvals(workspace_id, run_id);
create index if not exists orbit_agent_approvals_task_idx
  on public.orbit_agent_approvals(workspace_id, task_id);
create index if not exists orbit_agent_approvals_agent_idx
  on public.orbit_agent_approvals(workspace_id, requested_by_agent_id);
create index if not exists orbit_agent_approvals_decided_by_idx
  on public.orbit_agent_approvals(decided_by)
  where decided_by is not null;

create index if not exists orbit_agent_events_agent_idx
  on public.orbit_agent_events(workspace_id, agent_id);
