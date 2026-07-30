-- Orbit Plus connection layer for private Custom GPT Actions.
-- The plaintext action key never enters the database; only a SHA-256 hash is stored.

create table if not exists public.orbit_action_keys (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  token_prefix text not null check (char_length(token_prefix) between 8 and 24),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  scopes text[] not null default array[
    'foundry.read',
    'students.read',
    'students.write',
    'tasks.write',
    'submissions.write',
    'integrations.write',
    'audit.read'
  ]::text[],
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete restrict
);

create index if not exists orbit_action_keys_workspace_active_idx
  on public.orbit_action_keys(workspace_id, created_at desc)
  where revoked_at is null;

alter table public.orbit_action_keys enable row level security;
revoke all on table public.orbit_action_keys from public, anon, authenticated;

create table if not exists public.orbit_action_calls (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action_key_id uuid references public.orbit_action_keys(id) on delete set null,
  operation text not null check (char_length(operation) between 2 and 120),
  request_id uuid not null,
  request_summary jsonb not null default '{}'::jsonb,
  response_summary jsonb not null default '{}'::jsonb,
  status text not null default 'started'
    check (status in ('started', 'succeeded', 'failed', 'denied')),
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (workspace_id, request_id)
);

create index if not exists orbit_action_calls_workspace_created_idx
  on public.orbit_action_calls(workspace_id, created_at desc);

alter table public.orbit_action_calls enable row level security;

grant select on table public.orbit_action_calls to authenticated;
revoke insert, update, delete on table public.orbit_action_calls from public, anon, authenticated;

create policy orbit_action_calls_select_admin
on public.orbit_action_calls
for select
to authenticated
using ((select private.is_workspace_admin(workspace_id)));

create or replace function public.orbit_action_assign_task(
  action_workspace_id uuid,
  action_actor_id uuid,
  action_request_id uuid,
  target_student_id uuid,
  task_title text,
  task_instructions_roman_urdu text,
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
set statement_timeout = '8s'
as $$
declare
  command_result record;
begin
  if not exists (
    select 1
    from public.workspace_members member
    where member.workspace_id = action_workspace_id
      and member.user_id = action_actor_id
      and member.role in ('owner', 'admin')
  ) then
    raise exception 'Orbit action actor is not a workspace administrator'
      using errcode = '42501';
  end if;

  perform set_config('request.jwt.claim.sub', action_actor_id::text, true);

  select *
  into command_result
  from public.create_foundry_task_assignment_command(
    action_workspace_id,
    target_student_id,
    action_request_id,
    task_title,
    task_instructions_roman_urdu,
    task_department,
    task_difficulty,
    task_skill_dimension,
    task_points,
    assignment_due_at
  );

  return jsonb_build_object(
    'taskId', command_result.task_id,
    'assignmentId', command_result.assignment_id
  );
end;
$$;

create or replace function public.orbit_action_update_student(
  action_workspace_id uuid,
  action_actor_id uuid,
  action_request_id uuid,
  target_student_id uuid,
  target_health_status text,
  target_next_action text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set statement_timeout = '8s'
as $$
declare
  updated_student record;
begin
  if not exists (
    select 1
    from public.workspace_members member
    where member.workspace_id = action_workspace_id
      and member.user_id = action_actor_id
      and member.role in ('owner', 'admin')
  ) then
    raise exception 'Orbit action actor is not a workspace administrator'
      using errcode = '42501';
  end if;

  if target_health_status not in ('green', 'yellow', 'red', 'gold') then
    raise exception 'Invalid student health status' using errcode = '22023';
  end if;

  insert into public.foundry_command_receipts (
    workspace_id,
    actor_id,
    request_id,
    command_type,
    primary_entity_id
  )
  values (
    action_workspace_id,
    action_actor_id,
    action_request_id,
    'orbit_action_update_student',
    target_student_id
  )
  on conflict (actor_id, request_id) do nothing;

  update public.foundry_students student
  set health_status = target_health_status,
      next_action = nullif(btrim(target_next_action), ''),
      updated_at = now()
  where student.workspace_id = action_workspace_id
    and student.id = target_student_id
  returning student.id, student.full_name, student.health_status, student.next_action
  into updated_student;

  if updated_student.id is null then
    raise exception 'Student was not found in this workspace' using errcode = 'P0002';
  end if;

  insert into public.audit_events (
    workspace_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    action_workspace_id,
    action_actor_id,
    'orbit_action.student_updated',
    'foundry_student',
    target_student_id,
    jsonb_build_object(
      'request_id', action_request_id,
      'health_status', target_health_status,
      'next_action', nullif(btrim(target_next_action), ''),
      'source', 'chatgpt_custom_action'
    )
  );

  return jsonb_build_object(
    'studentId', updated_student.id,
    'fullName', updated_student.full_name,
    'healthStatus', updated_student.health_status,
    'nextAction', updated_student.next_action
  );
end;
$$;

create or replace function public.orbit_action_review_submission(
  action_workspace_id uuid,
  action_actor_id uuid,
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
set statement_timeout = '8s'
as $$
declare
  command_result record;
begin
  if not exists (
    select 1
    from public.workspace_members member
    where member.workspace_id = action_workspace_id
      and member.user_id = action_actor_id
      and member.role in ('owner', 'admin')
  ) then
    raise exception 'Orbit action actor is not a workspace administrator'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.foundry_submissions submission
    where submission.workspace_id = action_workspace_id
      and submission.id = target_submission_id
  ) then
    raise exception 'Submission was not found in this workspace' using errcode = 'P0002';
  end if;

  perform set_config('request.jwt.claim.sub', action_actor_id::text, true);

  select *
  into command_result
  from public.review_foundry_submission_command(
    target_submission_id,
    action_request_id,
    review_decision,
    review_feedback,
    review_score
  );

  return jsonb_build_object(
    'submissionId', command_result.submission_id,
    'status', command_result.submission_status
  );
end;
$$;

create or replace function public.orbit_action_queue_sync(
  action_workspace_id uuid,
  action_actor_id uuid,
  action_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set statement_timeout = '8s'
as $$
declare
  queued_count integer;
begin
  if not exists (
    select 1
    from public.workspace_members member
    where member.workspace_id = action_workspace_id
      and member.user_id = action_actor_id
      and member.role in ('owner', 'admin')
  ) then
    raise exception 'Orbit action actor is not a workspace administrator'
      using errcode = '42501';
  end if;

  insert into public.foundry_command_receipts (
    workspace_id,
    actor_id,
    request_id,
    command_type
  )
  values (
    action_workspace_id,
    action_actor_id,
    action_request_id,
    'orbit_action_queue_sync'
  )
  on conflict (actor_id, request_id) do nothing;

  perform set_config('request.jwt.claim.sub', action_actor_id::text, true);
  queued_count := public.queue_foundry_full_sync(action_workspace_id);

  return jsonb_build_object('queued', queued_count);
end;
$$;

revoke all on function public.orbit_action_assign_task(uuid, uuid, uuid, uuid, text, text, text, text, text, smallint, timestamptz) from public, anon, authenticated;
revoke all on function public.orbit_action_update_student(uuid, uuid, uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.orbit_action_review_submission(uuid, uuid, uuid, uuid, text, text, smallint) from public, anon, authenticated;
revoke all on function public.orbit_action_queue_sync(uuid, uuid, uuid) from public, anon, authenticated;

grant execute on function public.orbit_action_assign_task(uuid, uuid, uuid, uuid, text, text, text, text, text, smallint, timestamptz) to service_role;
grant execute on function public.orbit_action_update_student(uuid, uuid, uuid, uuid, text, text) to service_role;
grant execute on function public.orbit_action_review_submission(uuid, uuid, uuid, uuid, text, text, smallint) to service_role;
grant execute on function public.orbit_action_queue_sync(uuid, uuid, uuid) to service_role;
