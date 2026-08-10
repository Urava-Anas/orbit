-- Stage 1 completion: every task records the exact capability that authorized it.

alter table public.orbit_agent_tasks
  add column if not exists capability_key text;

update public.orbit_agent_tasks
set capability_key = 'agents.read'
where capability_key is null;

alter table public.orbit_agent_tasks
  alter column capability_key set not null;

alter table public.orbit_agent_tasks
  drop constraint if exists orbit_agent_tasks_capability_key_fkey;

alter table public.orbit_agent_tasks
  add constraint orbit_agent_tasks_capability_key_fkey
  foreign key (capability_key)
  references public.capabilities(capability_key)
  on delete restrict;

create index if not exists orbit_agent_tasks_capability_idx
  on public.orbit_agent_tasks(capability_key);

alter table public.orbit_agent_approvals
  add column if not exists approval_route text not null default 'founder';

alter table public.orbit_agent_approvals
  drop constraint if exists orbit_agent_approvals_route_check;

alter table public.orbit_agent_approvals
  add constraint orbit_agent_approvals_route_check
  check (approval_route in ('supervisor', 'founder'));

create index if not exists orbit_agent_approvals_route_idx
  on public.orbit_agent_approvals(workspace_id, status, approval_route, created_at asc);
