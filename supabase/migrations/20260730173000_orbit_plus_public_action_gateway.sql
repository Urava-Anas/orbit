-- Self-contained Orbit GPT Action gateway for ChatGPT Plus.
-- Public RPCs accept only revocable Orbit action tokens and never expose raw tables.

create or replace function private.require_orbit_action_key(
  action_token text,
  required_scope text
)
returns table (
  action_key_id uuid,
  workspace_id uuid,
  actor_id uuid
)
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  matched_key public.orbit_action_keys%rowtype;
begin
  if action_token is null
    or action_token !~ '^orb_live_[A-Za-z0-9_-]{32,120}$'
    or char_length(action_token) > 160
  then
    raise exception 'Invalid Orbit action key' using errcode = '42501';
  end if;

  select key_row.*
  into matched_key
  from public.orbit_action_keys key_row
  where key_row.token_hash = encode(extensions.digest(action_token, 'sha256'), 'hex')
    and key_row.revoked_at is null
    and (key_row.expires_at is null or key_row.expires_at > now())
    and required_scope = any(key_row.scopes)
    and exists (
      select 1
      from public.workspace_members member
      where member.workspace_id = key_row.workspace_id
        and member.user_id = key_row.actor_id
        and member.role in ('owner', 'admin')
    )
  limit 1;

  if matched_key.id is null then
    raise exception 'Invalid Orbit action key' using errcode = '42501';
  end if;

  update public.orbit_action_keys
  set last_used_at = now()
  where id = matched_key.id;

  return query
  select matched_key.id, matched_key.workspace_id, matched_key.actor_id;
end;
$$;

create or replace function private.begin_orbit_action_call(
  target_key_id uuid,
  target_workspace_id uuid,
  target_actor_id uuid,
  target_operation text,
  target_request_id uuid,
  target_request_summary jsonb
)
returns table (
  call_id uuid,
  replayed boolean,
  prior_response jsonb
)
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  existing_call public.orbit_action_calls%rowtype;
  new_call_id uuid;
begin
  select call_row.*
  into existing_call
  from public.orbit_action_calls call_row
  where call_row.workspace_id = target_workspace_id
    and call_row.request_id = target_request_id
  for update;

  if existing_call.id is not null then
    if existing_call.operation <> target_operation
      or existing_call.action_key_id is distinct from target_key_id
    then
      raise exception 'Request ID was already used for another Orbit action'
        using errcode = '23505';
    end if;

    if existing_call.status = 'succeeded' then
      return query
      select existing_call.id, true, existing_call.response_summary;
      return;
    end if;

    if existing_call.status = 'started' then
      raise exception 'Orbit action request is already processing'
        using errcode = '55000';
    end if;

    update public.orbit_action_calls
    set status = 'started',
        request_summary = coalesce(target_request_summary, '{}'::jsonb),
        response_summary = '{}'::jsonb,
        error_code = null,
        completed_at = null
    where id = existing_call.id;

    return query
    select existing_call.id, false, '{}'::jsonb;
    return;
  end if;

  insert into public.orbit_action_calls (
    workspace_id,
    actor_id,
    action_key_id,
    operation,
    request_id,
    request_summary,
    status
  )
  values (
    target_workspace_id,
    target_actor_id,
    target_key_id,
    target_operation,
    target_request_id,
    coalesce(target_request_summary, '{}'::jsonb),
    'started'
  )
  returning id into new_call_id;

  return query select new_call_id, false, '{}'::jsonb;
end;
$$;

create or replace function private.complete_orbit_action_call(
  target_call_id uuid,
  target_status text,
  target_response_summary jsonb,
  target_error_code text default null
)
returns void
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
begin
  if target_status not in ('succeeded', 'failed', 'denied') then
    raise exception 'Invalid Orbit action completion state' using errcode = '22023';
  end if;

  update public.orbit_action_calls
  set status = target_status,
      response_summary = coalesce(target_response_summary, '{}'::jsonb),
      error_code = target_error_code,
      completed_at = now()
  where id = target_call_id;
end;
$$;

revoke all on function private.require_orbit_action_key(text, text) from public, anon, authenticated;
revoke all on function private.begin_orbit_action_call(uuid, uuid, uuid, text, uuid, jsonb) from public, anon, authenticated;
revoke all on function private.complete_orbit_action_call(uuid, text, jsonb, text) from public, anon, authenticated;

create or replace function public.create_orbit_action_key(
  target_workspace_id uuid,
  target_name text,
  target_token_prefix text,
  target_token_hash text,
  target_scopes text[],
  target_expires_at timestamptz
)
returns table (
  id uuid,
  workspace_id uuid,
  actor_id uuid,
  name text,
  token_prefix text,
  scopes text[],
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  current_user_id uuid := (select auth.uid());
  allowed_scopes constant text[] := array[
    'foundry.read',
    'students.read',
    'students.write',
    'tasks.write',
    'submissions.write',
    'integrations.write',
    'audit.read'
  ]::text[];
begin
  if current_user_id is null
    or not (select private.is_workspace_admin(target_workspace_id))
  then
    raise exception 'Workspace administrator access required' using errcode = '42501';
  end if;

  if char_length(btrim(target_name)) not between 2 and 120
    or target_token_prefix !~ '^orb_live_[A-Za-z0-9_-]{0,16}$'
    or target_token_hash !~ '^[0-9a-f]{64}$'
    or target_expires_at <= now()
    or target_expires_at > now() + interval '366 days'
    or target_scopes is null
    or cardinality(target_scopes) = 0
    or exists (
      select 1
      from unnest(target_scopes) requested_scope
      where not (requested_scope = any(allowed_scopes))
    )
  then
    raise exception 'Invalid Orbit action key configuration' using errcode = '22023';
  end if;

  return query
  insert into public.orbit_action_keys (
    workspace_id,
    actor_id,
    name,
    token_prefix,
    token_hash,
    scopes,
    expires_at,
    created_by
  )
  values (
    target_workspace_id,
    current_user_id,
    btrim(target_name),
    target_token_prefix,
    target_token_hash,
    target_scopes,
    target_expires_at,
    current_user_id
  )
  returning
    orbit_action_keys.id,
    orbit_action_keys.workspace_id,
    orbit_action_keys.actor_id,
    orbit_action_keys.name,
    orbit_action_keys.token_prefix,
    orbit_action_keys.scopes,
    orbit_action_keys.last_used_at,
    orbit_action_keys.expires_at,
    orbit_action_keys.revoked_at,
    orbit_action_keys.created_at;
end;
$$;

create or replace function public.list_orbit_action_keys(
  target_workspace_id uuid
)
returns table (
  id uuid,
  workspace_id uuid,
  actor_id uuid,
  name text,
  token_prefix text,
  scopes text[],
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
begin
  if (select auth.uid()) is null
    or not (select private.is_workspace_admin(target_workspace_id))
  then
    raise exception 'Workspace administrator access required' using errcode = '42501';
  end if;

  return query
  select
    key_row.id,
    key_row.workspace_id,
    key_row.actor_id,
    key_row.name,
    key_row.token_prefix,
    key_row.scopes,
    key_row.last_used_at,
    key_row.expires_at,
    key_row.revoked_at,
    key_row.created_at
  from public.orbit_action_keys key_row
  where key_row.workspace_id = target_workspace_id
  order by key_row.created_at desc;
end;
$$;

create or replace function public.revoke_orbit_action_key(
  target_workspace_id uuid,
  target_key_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  affected_count integer;
begin
  if (select auth.uid()) is null
    or not (select private.is_workspace_admin(target_workspace_id))
  then
    raise exception 'Workspace administrator access required' using errcode = '42501';
  end if;

  update public.orbit_action_keys
  set revoked_at = coalesce(revoked_at, now())
  where workspace_id = target_workspace_id
    and id = target_key_id;

  get diagnostics affected_count = row_count;
  return affected_count = 1;
end;
$$;

revoke all on function public.create_orbit_action_key(uuid, text, text, text, text[], timestamptz) from public, anon;
revoke all on function public.list_orbit_action_keys(uuid) from public, anon;
revoke all on function public.revoke_orbit_action_key(uuid, uuid) from public, anon;
grant execute on function public.create_orbit_action_key(uuid, text, text, text, text[], timestamptz) to authenticated;
grant execute on function public.list_orbit_action_keys(uuid) to authenticated;
grant execute on function public.revoke_orbit_action_key(uuid, uuid) to authenticated;

create or replace function public.orbit_gpt_health(
  action_token text,
  action_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set statement_timeout = '8s'
as $$
declare
  key_context record;
  call_context record;
  result jsonb;
  student_count integer;
  failed_count integer;
begin
  begin
    select * into key_context
    from private.require_orbit_action_key(action_token, 'foundry.read');
  exception when others then
    return jsonb_build_object(
      'ok', false,
      'httpStatus', 401,
      'error', 'invalid_key',
      'message', 'Orbit action key is invalid, expired, revoked, or lacks access.'
    );
  end;

  begin
    select * into call_context
    from private.begin_orbit_action_call(
      key_context.action_key_id,
      key_context.workspace_id,
      key_context.actor_id,
      'health',
      action_request_id,
      '{}'::jsonb
    );
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'httpStatus', 409, 'error', 'duplicate_request');
  when object_not_in_prerequisite_state then
    return jsonb_build_object('ok', false, 'httpStatus', 409, 'error', 'request_in_progress');
  end;

  if call_context.replayed then
    return call_context.prior_response || jsonb_build_object('replayed', true);
  end if;

  begin
    select count(*) into student_count
    from public.foundry_students
    where workspace_id = key_context.workspace_id;

    select count(*) into failed_count
    from public.orbit_action_calls
    where workspace_id = key_context.workspace_id
      and status = 'failed'
      and created_at >= now() - interval '24 hours';

    result := jsonb_build_object(
      'ok', true,
      'status', 'healthy',
      'checkedAt', now(),
      'metrics', jsonb_build_object(
        'students', student_count,
        'failedActionsLast24Hours', failed_count
      ),
      'requestId', action_request_id,
      'callId', call_context.call_id
    );

    perform private.complete_orbit_action_call(
      call_context.call_id,
      'succeeded',
      result,
      null
    );
    return result;
  exception when others then
    result := jsonb_build_object(
      'ok', false,
      'httpStatus', 500,
      'error', 'health_query_failed',
      'message', 'Orbit health data could not be loaded.',
      'requestId', action_request_id,
      'callId', call_context.call_id
    );
    perform private.complete_orbit_action_call(
      call_context.call_id,
      'failed',
      result,
      sqlstate
    );
    return result;
  end;
end;
$$;

create or replace function public.orbit_gpt_summary(
  action_token text,
  action_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set statement_timeout = '8s'
as $$
declare
  key_context record;
  call_context record;
  result jsonb;
  total_students integer;
  active_students integer;
  connected_students integer;
  at_risk_students integer;
  studio_ready_students integer;
  pending_submissions integer;
  open_assignments integer;
  integration_items integer;
  attention jsonb;
  integration_queue jsonb;
begin
  begin
    select * into key_context
    from private.require_orbit_action_key(action_token, 'foundry.read');
  exception when others then
    return jsonb_build_object(
      'ok', false,
      'httpStatus', 401,
      'error', 'invalid_key',
      'message', 'Orbit action key is invalid, expired, revoked, or lacks access.'
    );
  end;

  begin
    select * into call_context
    from private.begin_orbit_action_call(
      key_context.action_key_id,
      key_context.workspace_id,
      key_context.actor_id,
      'summary',
      action_request_id,
      '{}'::jsonb
    );
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'httpStatus', 409, 'error', 'duplicate_request');
  when object_not_in_prerequisite_state then
    return jsonb_build_object('ok', false, 'httpStatus', 409, 'error', 'request_in_progress');
  end;

  if call_context.replayed then
    return call_context.prior_response || jsonb_build_object('replayed', true);
  end if;

  begin
    select
      count(*),
      count(*) filter (where lifecycle_status not in ('inactive', 'graduated', 'rejected')),
      count(*) filter (where auth_user_id is not null),
      count(*) filter (where health_status in ('yellow', 'red')),
      count(*) filter (where studio_eligible)
    into
      total_students,
      active_students,
      connected_students,
      at_risk_students,
      studio_ready_students
    from public.foundry_students
    where workspace_id = key_context.workspace_id;

    select count(*) into pending_submissions
    from public.foundry_submissions
    where workspace_id = key_context.workspace_id
      and status in ('submitted', 'under_review');

    select count(*) into open_assignments
    from public.foundry_task_assignments
    where workspace_id = key_context.workspace_id
      and status not in ('completed', 'submitted', 'under_review');

    select count(*) into integration_items
    from public.foundry_external_deliveries
    where workspace_id = key_context.workspace_id
      and status in ('pending', 'processing', 'failed');

    select coalesce(jsonb_agg(to_jsonb(attention_row)), '[]'::jsonb)
    into attention
    from (
      select
        id as "studentId",
        foundry_id as "foundryId",
        full_name as "fullName",
        health_status as "healthStatus",
        progress_percent as "progressPercent",
        next_action as "nextAction"
      from public.foundry_students
      where workspace_id = key_context.workspace_id
        and health_status in ('yellow', 'red')
      order by
        case health_status when 'red' then 0 else 1 end,
        progress_percent,
        foundry_id
      limit 10
    ) attention_row;

    select coalesce(jsonb_agg(to_jsonb(delivery_row)), '[]'::jsonb)
    into integration_queue
    from (
      select
        id,
        student_id as "studentId",
        channel,
        status,
        attempt_count as "attemptCount",
        last_error as "lastError",
        created_at as "createdAt"
      from public.foundry_external_deliveries
      where workspace_id = key_context.workspace_id
        and status in ('pending', 'processing', 'failed')
      order by created_at desc
      limit 20
    ) delivery_row;

    result := jsonb_build_object(
      'ok', true,
      'metrics', jsonb_build_object(
        'students', total_students,
        'activeStudents', active_students,
        'connectedStudents', connected_students,
        'atRiskStudents', at_risk_students,
        'studioReadyStudents', studio_ready_students,
        'submissionsAwaitingReview', pending_submissions,
        'openAssignments', open_assignments,
        'integrationItemsNeedingWork', integration_items
      ),
      'needsAttention', attention,
      'integrationQueue', integration_queue,
      'requestId', action_request_id,
      'callId', call_context.call_id
    );

    perform private.complete_orbit_action_call(
      call_context.call_id,
      'succeeded',
      result,
      null
    );
    return result;
  exception when others then
    result := jsonb_build_object(
      'ok', false,
      'httpStatus', 500,
      'error', 'summary_query_failed',
      'message', 'Orbit founder summary could not be loaded.',
      'requestId', action_request_id,
      'callId', call_context.call_id
    );
    perform private.complete_orbit_action_call(
      call_context.call_id,
      'failed',
      result,
      sqlstate
    );
    return result;
  end;
end;
$$;

create or replace function public.orbit_gpt_students(
  action_token text,
  action_request_id uuid,
  target_health text default null,
  target_lifecycle text default null,
  target_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set statement_timeout = '8s'
as $$
declare
  key_context record;
  call_context record;
  result jsonb;
  students jsonb;
  safe_limit integer := least(greatest(coalesce(target_limit, 50), 1), 100);
begin
  begin
    select * into key_context
    from private.require_orbit_action_key(action_token, 'students.read');
  exception when others then
    return jsonb_build_object(
      'ok', false,
      'httpStatus', 401,
      'error', 'invalid_key',
      'message', 'Orbit action key is invalid, expired, revoked, or lacks access.'
    );
  end;

  begin
    select * into call_context
    from private.begin_orbit_action_call(
      key_context.action_key_id,
      key_context.workspace_id,
      key_context.actor_id,
      'students',
      action_request_id,
      jsonb_build_object('health', target_health, 'lifecycle', target_lifecycle, 'limit', safe_limit)
    );
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'httpStatus', 409, 'error', 'duplicate_request');
  when object_not_in_prerequisite_state then
    return jsonb_build_object('ok', false, 'httpStatus', 409, 'error', 'request_in_progress');
  end;

  if call_context.replayed then
    return call_context.prior_response || jsonb_build_object('replayed', true);
  end if;

  begin
    select coalesce(jsonb_agg(to_jsonb(student_row)), '[]'::jsonb)
    into students
    from (
      select
        id,
        foundry_id as "foundryId",
        full_name as "fullName",
        email,
        department,
        level,
        lifecycle_status as "lifecycleStatus",
        health_status as "healthStatus",
        progress_percent as "progressPercent",
        device_access as "deviceAccess",
        preferred_language as "preferredLanguage",
        main_goal as "mainGoal",
        next_action as "nextAction",
        studio_eligible as "studioEligible",
        (auth_user_id is not null) as "orbitConnected",
        updated_at as "updatedAt"
      from public.foundry_students
      where workspace_id = key_context.workspace_id
        and (target_health is null or health_status = target_health)
        and (target_lifecycle is null or lifecycle_status = target_lifecycle)
      order by foundry_id
      limit safe_limit
    ) student_row;

    result := jsonb_build_object(
      'ok', true,
      'students', students,
      'count', jsonb_array_length(students),
      'requestId', action_request_id,
      'callId', call_context.call_id
    );

    perform private.complete_orbit_action_call(
      call_context.call_id,
      'succeeded',
      result,
      null
    );
    return result;
  exception when others then
    result := jsonb_build_object(
      'ok', false,
      'httpStatus', 500,
      'error', 'students_query_failed',
      'message', 'Orbit students could not be loaded.',
      'requestId', action_request_id,
      'callId', call_context.call_id
    );
    perform private.complete_orbit_action_call(
      call_context.call_id,
      'failed',
      result,
      sqlstate
    );
    return result;
  end;
end;
$$;

create or replace function public.orbit_gpt_audit(
  action_token text,
  action_request_id uuid,
  target_limit integer default 25
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set statement_timeout = '8s'
as $$
declare
  key_context record;
  call_context record;
  result jsonb;
  actions jsonb;
  safe_limit integer := least(greatest(coalesce(target_limit, 25), 1), 100);
begin
  begin
    select * into key_context
    from private.require_orbit_action_key(action_token, 'audit.read');
  exception when others then
    return jsonb_build_object(
      'ok', false,
      'httpStatus', 401,
      'error', 'invalid_key',
      'message', 'Orbit action key is invalid, expired, revoked, or lacks access.'
    );
  end;

  begin
    select * into call_context
    from private.begin_orbit_action_call(
      key_context.action_key_id,
      key_context.workspace_id,
      key_context.actor_id,
      'audit',
      action_request_id,
      jsonb_build_object('limit', safe_limit)
    );
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'httpStatus', 409, 'error', 'duplicate_request');
  when object_not_in_prerequisite_state then
    return jsonb_build_object('ok', false, 'httpStatus', 409, 'error', 'request_in_progress');
  end;

  if call_context.replayed then
    return call_context.prior_response || jsonb_build_object('replayed', true);
  end if;

  begin
    select coalesce(jsonb_agg(to_jsonb(action_row)), '[]'::jsonb)
    into actions
    from (
      select
        id,
        operation,
        request_id as "requestId",
        request_summary as "requestSummary",
        response_summary as "responseSummary",
        status,
        error_code as "errorCode",
        created_at as "createdAt",
        completed_at as "completedAt"
      from public.orbit_action_calls
      where workspace_id = key_context.workspace_id
        and id <> call_context.call_id
      order by created_at desc
      limit safe_limit
    ) action_row;

    result := jsonb_build_object(
      'ok', true,
      'actions', actions,
      'count', jsonb_array_length(actions),
      'requestId', action_request_id,
      'callId', call_context.call_id
    );

    perform private.complete_orbit_action_call(
      call_context.call_id,
      'succeeded',
      result,
      null
    );
    return result;
  exception when others then
    result := jsonb_build_object(
      'ok', false,
      'httpStatus', 500,
      'error', 'audit_query_failed',
      'message', 'Orbit action audit could not be loaded.',
      'requestId', action_request_id,
      'callId', call_context.call_id
    );
    perform private.complete_orbit_action_call(
      call_context.call_id,
      'failed',
      result,
      sqlstate
    );
    return result;
  end;
end;
$$;

create or replace function public.orbit_gpt_assign_task(
  action_token text,
  action_request_id uuid,
  target_student_id uuid,
  task_title text,
  task_instructions text,
  task_department text,
  task_difficulty text,
  task_skill_dimension text,
  task_points smallint,
  assignment_due_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set statement_timeout = '10s'
as $$
declare
  key_context record;
  call_context record;
  result jsonb;
begin
  begin
    select * into key_context
    from private.require_orbit_action_key(action_token, 'tasks.write');
  exception when others then
    return jsonb_build_object(
      'ok', false,
      'httpStatus', 401,
      'error', 'invalid_key',
      'message', 'Orbit action key is invalid, expired, revoked, or lacks access.'
    );
  end;

  begin
    select * into call_context
    from private.begin_orbit_action_call(
      key_context.action_key_id,
      key_context.workspace_id,
      key_context.actor_id,
      'assign-task',
      action_request_id,
      jsonb_build_object(
        'studentId', target_student_id,
        'title', left(task_title, 180),
        'department', task_department,
        'difficulty', task_difficulty,
        'dueAt', assignment_due_at
      )
    );
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'httpStatus', 409, 'error', 'duplicate_request');
  when object_not_in_prerequisite_state then
    return jsonb_build_object('ok', false, 'httpStatus', 409, 'error', 'request_in_progress');
  end;

  if call_context.replayed then
    return call_context.prior_response || jsonb_build_object('replayed', true);
  end if;

  begin
    result := public.orbit_action_assign_task(
      key_context.workspace_id,
      key_context.actor_id,
      action_request_id,
      target_student_id,
      task_title,
      task_instructions,
      task_department,
      task_difficulty,
      task_skill_dimension,
      task_points,
      assignment_due_at
    );

    result := jsonb_build_object(
      'ok', true,
      'result', result,
      'requestId', action_request_id,
      'callId', call_context.call_id
    );
    perform private.complete_orbit_action_call(call_context.call_id, 'succeeded', result, null);
    return result;
  exception when others then
    result := jsonb_build_object(
      'ok', false,
      'httpStatus', 400,
      'error', 'task_assignment_failed',
      'message', 'Orbit could not create and assign this task.',
      'requestId', action_request_id,
      'callId', call_context.call_id
    );
    perform private.complete_orbit_action_call(call_context.call_id, 'failed', result, sqlstate);
    return result;
  end;
end;
$$;

create or replace function public.orbit_gpt_update_student(
  action_token text,
  action_request_id uuid,
  target_student_id uuid,
  target_health_status text,
  target_next_action text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set statement_timeout = '10s'
as $$
declare
  key_context record;
  call_context record;
  result jsonb;
begin
  begin
    select * into key_context
    from private.require_orbit_action_key(action_token, 'students.write');
  exception when others then
    return jsonb_build_object(
      'ok', false,
      'httpStatus', 401,
      'error', 'invalid_key',
      'message', 'Orbit action key is invalid, expired, revoked, or lacks access.'
    );
  end;

  begin
    select * into call_context
    from private.begin_orbit_action_call(
      key_context.action_key_id,
      key_context.workspace_id,
      key_context.actor_id,
      'update-student',
      action_request_id,
      jsonb_build_object(
        'studentId', target_student_id,
        'healthStatus', target_health_status,
        'hasNextAction', nullif(btrim(target_next_action), '') is not null
      )
    );
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'httpStatus', 409, 'error', 'duplicate_request');
  when object_not_in_prerequisite_state then
    return jsonb_build_object('ok', false, 'httpStatus', 409, 'error', 'request_in_progress');
  end;

  if call_context.replayed then
    return call_context.prior_response || jsonb_build_object('replayed', true);
  end if;

  begin
    result := public.orbit_action_update_student(
      key_context.workspace_id,
      key_context.actor_id,
      action_request_id,
      target_student_id,
      target_health_status,
      target_next_action
    );

    result := jsonb_build_object(
      'ok', true,
      'result', result,
      'requestId', action_request_id,
      'callId', call_context.call_id
    );
    perform private.complete_orbit_action_call(call_context.call_id, 'succeeded', result, null);
    return result;
  exception when others then
    result := jsonb_build_object(
      'ok', false,
      'httpStatus', 400,
      'error', 'student_update_failed',
      'message', 'Orbit could not update this student signal.',
      'requestId', action_request_id,
      'callId', call_context.call_id
    );
    perform private.complete_orbit_action_call(call_context.call_id, 'failed', result, sqlstate);
    return result;
  end;
end;
$$;

create or replace function public.orbit_gpt_review_submission(
  action_token text,
  action_request_id uuid,
  target_submission_id uuid,
  review_decision text,
  review_feedback text,
  review_score smallint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set statement_timeout = '10s'
as $$
declare
  key_context record;
  call_context record;
  result jsonb;
begin
  begin
    select * into key_context
    from private.require_orbit_action_key(action_token, 'submissions.write');
  exception when others then
    return jsonb_build_object(
      'ok', false,
      'httpStatus', 401,
      'error', 'invalid_key',
      'message', 'Orbit action key is invalid, expired, revoked, or lacks access.'
    );
  end;

  begin
    select * into call_context
    from private.begin_orbit_action_call(
      key_context.action_key_id,
      key_context.workspace_id,
      key_context.actor_id,
      'review-submission',
      action_request_id,
      jsonb_build_object(
        'submissionId', target_submission_id,
        'decision', review_decision,
        'score', review_score
      )
    );
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'httpStatus', 409, 'error', 'duplicate_request');
  when object_not_in_prerequisite_state then
    return jsonb_build_object('ok', false, 'httpStatus', 409, 'error', 'request_in_progress');
  end;

  if call_context.replayed then
    return call_context.prior_response || jsonb_build_object('replayed', true);
  end if;

  begin
    result := public.orbit_action_review_submission(
      key_context.workspace_id,
      key_context.actor_id,
      action_request_id,
      target_submission_id,
      review_decision,
      review_feedback,
      review_score
    );

    result := jsonb_build_object(
      'ok', true,
      'result', result,
      'requestId', action_request_id,
      'callId', call_context.call_id
    );
    perform private.complete_orbit_action_call(call_context.call_id, 'succeeded', result, null);
    return result;
  exception when others then
    result := jsonb_build_object(
      'ok', false,
      'httpStatus', 400,
      'error', 'submission_review_failed',
      'message', 'Orbit could not save this submission review.',
      'requestId', action_request_id,
      'callId', call_context.call_id
    );
    perform private.complete_orbit_action_call(call_context.call_id, 'failed', result, sqlstate);
    return result;
  end;
end;
$$;

create or replace function public.orbit_gpt_queue_sync(
  action_token text,
  action_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set statement_timeout = '10s'
as $$
declare
  key_context record;
  call_context record;
  result jsonb;
begin
  begin
    select * into key_context
    from private.require_orbit_action_key(action_token, 'integrations.write');
  exception when others then
    return jsonb_build_object(
      'ok', false,
      'httpStatus', 401,
      'error', 'invalid_key',
      'message', 'Orbit action key is invalid, expired, revoked, or lacks access.'
    );
  end;

  begin
    select * into call_context
    from private.begin_orbit_action_call(
      key_context.action_key_id,
      key_context.workspace_id,
      key_context.actor_id,
      'queue-sync',
      action_request_id,
      '{}'::jsonb
    );
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'httpStatus', 409, 'error', 'duplicate_request');
  when object_not_in_prerequisite_state then
    return jsonb_build_object('ok', false, 'httpStatus', 409, 'error', 'request_in_progress');
  end;

  if call_context.replayed then
    return call_context.prior_response || jsonb_build_object('replayed', true);
  end if;

  begin
    result := public.orbit_action_queue_sync(
      key_context.workspace_id,
      key_context.actor_id,
      action_request_id
    );

    result := jsonb_build_object(
      'ok', true,
      'result', result,
      'requestId', action_request_id,
      'callId', call_context.call_id
    );
    perform private.complete_orbit_action_call(call_context.call_id, 'succeeded', result, null);
    return result;
  exception when others then
    result := jsonb_build_object(
      'ok', false,
      'httpStatus', 400,
      'error', 'sync_queue_failed',
      'message', 'Orbit could not queue the integration synchronization.',
      'requestId', action_request_id,
      'callId', call_context.call_id
    );
    perform private.complete_orbit_action_call(call_context.call_id, 'failed', result, sqlstate);
    return result;
  end;
end;
$$;

revoke all on function public.orbit_gpt_health(text, uuid) from public;
revoke all on function public.orbit_gpt_summary(text, uuid) from public;
revoke all on function public.orbit_gpt_students(text, uuid, text, text, integer) from public;
revoke all on function public.orbit_gpt_audit(text, uuid, integer) from public;
revoke all on function public.orbit_gpt_assign_task(text, uuid, uuid, text, text, text, text, text, smallint, timestamptz) from public;
revoke all on function public.orbit_gpt_update_student(text, uuid, uuid, text, text) from public;
revoke all on function public.orbit_gpt_review_submission(text, uuid, uuid, text, text, smallint) from public;
revoke all on function public.orbit_gpt_queue_sync(text, uuid) from public;

grant execute on function public.orbit_gpt_health(text, uuid) to anon, authenticated;
grant execute on function public.orbit_gpt_summary(text, uuid) to anon, authenticated;
grant execute on function public.orbit_gpt_students(text, uuid, text, text, integer) to anon, authenticated;
grant execute on function public.orbit_gpt_audit(text, uuid, integer) to anon, authenticated;
grant execute on function public.orbit_gpt_assign_task(text, uuid, uuid, text, text, text, text, text, smallint, timestamptz) to anon, authenticated;
grant execute on function public.orbit_gpt_update_student(text, uuid, uuid, text, text) to anon, authenticated;
grant execute on function public.orbit_gpt_review_submission(text, uuid, uuid, text, text, smallint) to anon, authenticated;
grant execute on function public.orbit_gpt_queue_sync(text, uuid) to anon, authenticated;
