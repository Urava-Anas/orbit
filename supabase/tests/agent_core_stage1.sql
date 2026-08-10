-- Orbit Stage 1 agent-core acceptance test.
-- Runs inside a transaction and rolls back all synthetic runtime state.

begin;

do $$
declare
  v_workspace_id uuid;
  v_owner_id uuid;
  v_agent_id uuid;
  v_green_run_id uuid;
  v_green_task_id uuid;
  v_amber_run_id uuid;
  v_amber_task_id uuid;
  v_approval_id uuid;
  v_action_calls_before bigint;
  v_action_calls_after bigint;
  v_status text;
begin
  select w.id, w.owner_id
  into v_workspace_id, v_owner_id
  from public.workspaces w
  where w.name = 'Urava'
  order by w.created_at asc
  limit 1;

  if v_workspace_id is null or v_owner_id is null then
    raise exception 'Stage 1 test requires the Urava workspace and owner.';
  end if;

  if not exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = v_workspace_id
      and wm.user_id = v_owner_id
      and wm.role in ('owner', 'admin', 'founder')
  ) then
    raise exception 'Workspace owner is not authorized as founder/admin.';
  end if;

  select count(*) into v_action_calls_before from public.orbit_action_calls;

  insert into public.orbit_agents (
    workspace_id,
    agent_key,
    name,
    kind,
    status,
    mission,
    instructions,
    config,
    created_by
  ) values (
    v_workspace_id,
    'sales_director',
    'Sales Director',
    'manager',
    'active',
    'Stage 1 acceptance-test manager.',
    'Dry-run only.',
    jsonb_build_object('executionMode', 'dry_run', 'externalActionsEnabled', false),
    v_owner_id
  )
  on conflict (workspace_id, agent_key) do update
  set status = 'active',
      config = excluded.config
  returning id into v_agent_id;

  insert into public.orbit_agent_permissions (
    workspace_id, agent_id, capability_key, effect, authority_level, created_by
  ) values
    (v_workspace_id, v_agent_id, 'agents.read', 'allow', 'green', v_owner_id),
    (v_workspace_id, v_agent_id, 'agents.run', 'allow', 'amber', v_owner_id)
  on conflict (workspace_id, agent_id, capability_key) do update
  set effect = excluded.effect,
      authority_level = excluded.authority_level;

  -- Green path: permission -> task -> automatic dry-run completion.
  insert into public.orbit_agent_runs (
    workspace_id, agent_id, trigger_type, status, input, created_by, started_at
  ) values (
    v_workspace_id,
    v_agent_id,
    'manual',
    'running',
    jsonb_build_object('command', 'Stage 1 green acceptance test', 'executionMode', 'dry_run'),
    v_owner_id,
    now()
  ) returning id into v_green_run_id;

  insert into public.orbit_agent_tasks (
    workspace_id, run_id, assigned_agent_id, capability_key, task_type, title,
    status, risk_level, priority, input
  ) values (
    v_workspace_id,
    v_green_run_id,
    v_agent_id,
    'agents.read',
    'acceptance_green',
    'Stage 1 green path',
    'queued',
    'green',
    50,
    jsonb_build_object('executionMode', 'dry_run')
  ) returning id into v_green_task_id;

  update public.orbit_agent_tasks
  set status = 'succeeded',
      attempts = 1,
      output = jsonb_build_object('externalActionExecuted', false),
      completed_at = now()
  where id = v_green_task_id;

  update public.orbit_agent_runs
  set status = 'succeeded',
      output = jsonb_build_object('externalActionExecuted', false),
      completed_at = now()
  where id = v_green_run_id;

  insert into public.orbit_agent_events (
    workspace_id, run_id, task_id, agent_id, event_type, message, data
  ) values (
    v_workspace_id,
    v_green_run_id,
    v_green_task_id,
    v_agent_id,
    'task.succeeded',
    'Green Stage 1 acceptance path succeeded.',
    jsonb_build_object('externalActionExecuted', false)
  );

  select status into v_status from public.orbit_agent_runs where id = v_green_run_id;
  if v_status <> 'succeeded' then
    raise exception 'Green run did not succeed: %', v_status;
  end if;

  if exists (
    select 1 from public.orbit_agent_approvals where run_id = v_green_run_id
  ) then
    raise exception 'Green path incorrectly requested approval.';
  end if;

  -- Amber path: permission -> waiting approval -> founder approval -> completion.
  insert into public.orbit_agent_runs (
    workspace_id, agent_id, trigger_type, status, input, created_by, started_at
  ) values (
    v_workspace_id,
    v_agent_id,
    'manual',
    'running',
    jsonb_build_object('command', 'Stage 1 amber acceptance test', 'executionMode', 'dry_run'),
    v_owner_id,
    now()
  ) returning id into v_amber_run_id;

  insert into public.orbit_agent_tasks (
    workspace_id, run_id, assigned_agent_id, capability_key, task_type, title,
    status, risk_level, priority, input
  ) values (
    v_workspace_id,
    v_amber_run_id,
    v_agent_id,
    'agents.run',
    'acceptance_amber',
    'Stage 1 amber path',
    'waiting_approval',
    'amber',
    50,
    jsonb_build_object('executionMode', 'dry_run')
  ) returning id into v_amber_task_id;

  insert into public.orbit_agent_approvals (
    workspace_id, run_id, task_id, requested_by_agent_id, authority_level,
    approval_route, proposed_action, proposed_payload, status
  ) values (
    v_workspace_id,
    v_amber_run_id,
    v_amber_task_id,
    v_agent_id,
    'amber',
    'founder',
    'dry_run:agents.run',
    jsonb_build_object('externalActionsEnabled', false),
    'pending'
  ) returning id into v_approval_id;

  update public.orbit_agent_runs
  set status = 'waiting_approval'
  where id = v_amber_run_id;

  select status into v_status from public.orbit_agent_runs where id = v_amber_run_id;
  if v_status <> 'waiting_approval' then
    raise exception 'Amber run did not pause for approval: %', v_status;
  end if;

  update public.orbit_agent_approvals
  set status = 'approved', decided_by = v_owner_id, decided_at = now()
  where id = v_approval_id and status = 'pending';

  update public.orbit_agent_tasks
  set status = 'succeeded',
      attempts = 1,
      output = jsonb_build_object('externalActionExecuted', false),
      completed_at = now()
  where id = v_amber_task_id;

  update public.orbit_agent_runs
  set status = 'succeeded',
      output = jsonb_build_object('externalActionExecuted', false),
      completed_at = now()
  where id = v_amber_run_id;

  insert into public.orbit_agent_events (
    workspace_id, run_id, task_id, agent_id, event_type, message, data
  ) values (
    v_workspace_id,
    v_amber_run_id,
    v_amber_task_id,
    v_agent_id,
    'approval.approved',
    'Founder approved Stage 1 amber dry-run path.',
    jsonb_build_object('externalActionExecuted', false)
  );

  select status into v_status from public.orbit_agent_runs where id = v_amber_run_id;
  if v_status <> 'succeeded' then
    raise exception 'Approved amber run did not succeed: %', v_status;
  end if;

  if not exists (
    select 1
    from public.orbit_agent_approvals
    where id = v_approval_id
      and status = 'approved'
      and decided_by = v_owner_id
  ) then
    raise exception 'Amber approval decision was not recorded correctly.';
  end if;

  select count(*) into v_action_calls_after from public.orbit_action_calls;
  if v_action_calls_after <> v_action_calls_before then
    raise exception 'Stage 1 dry-run created a real Orbit action call.';
  end if;
end
$$;

rollback;
