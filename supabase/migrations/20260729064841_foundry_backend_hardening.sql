-- Foundry backend hardening
--
-- This migration is additive for the currently deployed application. It adds
-- atomic/idempotent command RPCs, stricter learner visibility, state-machine
-- guards, durable notifications, and a retryable integration outbox. A
-- follow-up migration locks writes to the command paths after the application
-- has been deployed with the new RPC calls.

alter table public.foundry_submissions
  add column attempt_number integer;

with ranked_attempts as (
  select
    id,
    row_number() over (
      partition by workspace_id, assignment_id
      order by submitted_at, created_at, id
    )::integer as attempt_number
  from public.foundry_submissions
)
update public.foundry_submissions submission
set attempt_number = ranked.attempt_number
from ranked_attempts ranked
where ranked.id = submission.id;

alter table public.foundry_submissions
  alter column attempt_number set not null;

-- The pre-command application allowed repeated clicks to create multiple
-- active rows for one assignment. Preserve every historical row, but mark
-- all except the newest active attempt as superseded before enforcing the
-- one-active-attempt invariant.
alter table public.foundry_submissions
  drop constraint foundry_submissions_status_check;

alter table public.foundry_submissions
  add constraint foundry_submissions_status_check
  check (
    status in (
      'submitted',
      'under_review',
      'revision_required',
      'accepted',
      'superseded'
    )
  );

with ranked_active_attempts as (
  select
    id,
    row_number() over (
      partition by workspace_id, assignment_id
      order by attempt_number desc, submitted_at desc, created_at desc, id desc
    ) as active_rank
  from public.foundry_submissions
  where status in ('submitted', 'under_review')
)
update public.foundry_submissions submission
set status = 'superseded'
from ranked_active_attempts ranked
where ranked.id = submission.id
  and ranked.active_rank > 1;

alter table public.foundry_submissions
  add constraint foundry_submissions_attempt_positive
  check (attempt_number > 0);

create unique index foundry_submissions_assignment_attempt_unique_idx
  on public.foundry_submissions(
    workspace_id,
    assignment_id,
    attempt_number
  );

create unique index foundry_submissions_one_open_attempt_idx
  on public.foundry_submissions(workspace_id, assignment_id)
  where status in ('submitted', 'under_review');

create unique index foundry_submissions_one_accepted_attempt_idx
  on public.foundry_submissions(workspace_id, assignment_id)
  where status = 'accepted';

create table public.foundry_command_receipts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  request_id uuid not null,
  command_type text not null
    check (
      command_type in (
        'create_class',
        'create_task_assignment',
        'submit_assignment',
        'review_submission'
      )
    ),
  primary_entity_id uuid,
  secondary_entity_id uuid,
  created_at timestamptz not null default now(),
  unique (actor_id, request_id)
);

create index foundry_command_receipts_workspace_created_idx
  on public.foundry_command_receipts(workspace_id, created_at desc);

create table public.foundry_notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  student_id uuid not null,
  kind text not null
    check (
      kind in (
        'assignment_assigned',
        'revision_requested',
        'submission_accepted'
      )
    ),
  title text not null check (char_length(title) between 2 and 180),
  body text not null check (char_length(body) between 2 and 1000),
  source_type text not null
    check (source_type in ('assignment', 'submission')),
  source_id uuid not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint foundry_notifications_student_same_workspace
    foreign key (workspace_id, student_id)
    references public.foundry_students(workspace_id, id)
    on delete cascade,
  unique (
    workspace_id,
    student_id,
    kind,
    source_type,
    source_id
  )
);

create index foundry_notifications_student_unread_idx
  on public.foundry_notifications(student_id, created_at desc)
  where read_at is null;
create index foundry_notifications_workspace_created_idx
  on public.foundry_notifications(workspace_id, created_at desc);

create table public.foundry_outbox_events (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  topic text not null check (char_length(topic) between 3 and 120),
  aggregate_type text not null
    check (char_length(aggregate_type) between 2 and 80),
  aggregate_id uuid not null,
  operation text not null check (operation in ('insert', 'update')),
  actor_id uuid references auth.users(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'succeeded', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  processed_at timestamptz,
  last_error text check (
    last_error is null or char_length(last_error) <= 2000
  ),
  created_at timestamptz not null default now()
);

create index foundry_outbox_pending_idx
  on public.foundry_outbox_events(available_at, id)
  where status in ('pending', 'failed');
create index foundry_outbox_stale_processing_idx
  on public.foundry_outbox_events(locked_at, id)
  where status = 'processing';
create index foundry_outbox_workspace_created_idx
  on public.foundry_outbox_events(workspace_id, created_at desc);

alter table public.foundry_command_receipts enable row level security;
alter table public.foundry_notifications enable row level security;
alter table public.foundry_outbox_events enable row level security;

create policy foundry_command_receipts_select_authorised
on public.foundry_command_receipts for select
to authenticated
using (
  actor_id = (select auth.uid())
  or (select private.has_capability(workspace_id, 'foundry.manage'))
);

create policy foundry_command_receipts_insert_actor
on public.foundry_command_receipts for insert
to authenticated
with check (
  actor_id = (select auth.uid())
  and (
    (select private.has_capability(workspace_id, 'foundry.manage'))
    or (select private.has_capability(workspace_id, 'foundry.review'))
    or (
      (select private.has_capability(workspace_id, 'foundry.learn'))
      and (select private.is_foundry_student(workspace_id))
    )
  )
);

create policy foundry_notifications_select_authorised
on public.foundry_notifications for select
to authenticated
using (
  (select private.has_capability(workspace_id, 'foundry.manage'))
  or (select private.has_capability(workspace_id, 'foundry.review'))
  or (
    (select private.has_capability(workspace_id, 'foundry.learn'))
    and (select private.is_foundry_student(workspace_id, student_id))
  )
);

create policy foundry_notifications_mark_own_read
on public.foundry_notifications for update
to authenticated
using (
  (select private.has_capability(workspace_id, 'foundry.learn'))
  and (select private.is_foundry_student(workspace_id, student_id))
)
with check (
  (select private.has_capability(workspace_id, 'foundry.learn'))
  and (select private.is_foundry_student(workspace_id, student_id))
);

create policy foundry_outbox_select_manage
on public.foundry_outbox_events for select
to authenticated
using ((select private.has_capability(workspace_id, 'foundry.manage')));

revoke all on public.foundry_command_receipts
  from public, anon, authenticated;
revoke all on public.foundry_notifications
  from public, anon, authenticated;
revoke all on public.foundry_outbox_events
  from public, anon, authenticated;

grant select, insert on public.foundry_command_receipts to authenticated;
grant select on public.foundry_notifications to authenticated;
grant update (read_at) on public.foundry_notifications to authenticated;
grant select on public.foundry_outbox_events to authenticated;

grant select, insert, update, delete
  on public.foundry_command_receipts,
     public.foundry_notifications,
     public.foundry_outbox_events
  to service_role;
grant usage, select
  on sequence public.foundry_outbox_events_id_seq
  to service_role;

create or replace function private.student_can_view_foundry_class(
  target_workspace_id uuid,
  target_department text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.foundry_students student
    where student.workspace_id = target_workspace_id
      and student.auth_user_id = (select auth.uid())
      and student.lifecycle_status <> 'rejected'
      and (
        target_department is null
        or student.department = target_department
      )
  );
$$;

create or replace function private.student_can_view_foundry_task(
  target_workspace_id uuid,
  target_task_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.foundry_task_assignments assignment
    join public.foundry_students student
      on student.workspace_id = assignment.workspace_id
     and student.id = assignment.student_id
    where assignment.workspace_id = target_workspace_id
      and assignment.task_id = target_task_id
      and student.auth_user_id = (select auth.uid())
      and student.lifecycle_status <> 'rejected'
  );
$$;

revoke all
  on function private.student_can_view_foundry_class(uuid, text)
  from public, anon;
revoke all
  on function private.student_can_view_foundry_task(uuid, uuid)
  from public, anon;
grant execute
  on function private.student_can_view_foundry_class(uuid, text)
  to authenticated;
grant execute
  on function private.student_can_view_foundry_task(uuid, uuid)
  to authenticated;

drop policy if exists foundry_classes_select_authorised
  on public.foundry_classes;
create policy foundry_classes_select_authorised
on public.foundry_classes for select
to authenticated
using (
  (select private.has_capability(workspace_id, 'foundry.manage'))
  or (select private.has_capability(workspace_id, 'foundry.review'))
  or (
    (select private.has_capability(workspace_id, 'foundry.learn'))
    and (
      select private.student_can_view_foundry_class(
        workspace_id,
        department
      )
    )
  )
);

drop policy if exists foundry_tasks_select_authorised
  on public.foundry_tasks;
create policy foundry_tasks_select_authorised
on public.foundry_tasks for select
to authenticated
using (
  (select private.has_capability(workspace_id, 'foundry.manage'))
  or (select private.has_capability(workspace_id, 'foundry.review'))
  or (
    status = 'published'
    and (select private.has_capability(workspace_id, 'foundry.learn'))
    and (
      select private.student_can_view_foundry_task(
        workspace_id,
        id
      )
    )
  )
);

create or replace function private.assign_foundry_attempt_number()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.attempt_number is null then
    select coalesce(max(submission.attempt_number), 0) + 1
    into new.attempt_number
    from public.foundry_submissions submission
    where submission.workspace_id = new.workspace_id
      and submission.assignment_id = new.assignment_id;
  end if;

  return new;
end;
$$;

revoke all on function private.assign_foundry_attempt_number()
  from public, anon, authenticated;

create trigger foundry_submissions_assign_attempt
  before insert on public.foundry_submissions
  for each row execute function private.assign_foundry_attempt_number();

create or replace function private.guard_foundry_student_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if current_user = 'authenticated'
      and new.auth_user_id is not null
    then
      raise exception 'Student identities must be claimed through verified access'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.workspace_id is distinct from old.workspace_id
    or new.id is distinct from old.id
    or new.foundry_id is distinct from old.foundry_id
  then
    raise exception 'Foundry student identifiers are immutable'
      using errcode = '23514';
  end if;

  if current_user = 'authenticated'
    and new.auth_user_id is distinct from old.auth_user_id
  then
    raise exception 'Student identities must be changed through access review'
      using errcode = '42501';
  end if;

  if current_user = 'authenticated'
    and old.auth_user_id is not null
    and lower(btrim(coalesce(new.email, '')))
      is distinct from lower(btrim(coalesce(old.email, '')))
  then
    raise exception 'Connected sign-in email is immutable'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace function private.guard_foundry_assignment_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  transition_allowed boolean := false;
begin
  if new.workspace_id is distinct from old.workspace_id
    or new.id is distinct from old.id
    or new.task_id is distinct from old.task_id
    or new.student_id is distinct from old.student_id
    or new.assigned_by is distinct from old.assigned_by
    or new.recovery_for_assignment_id
      is distinct from old.recovery_for_assignment_id
    or new.created_at is distinct from old.created_at
  then
    raise exception 'Foundry assignment identity is immutable'
      using errcode = '23514';
  end if;

  if new.status is not distinct from old.status then
    if old.status in ('completed', 'recovery_assigned')
      and new is distinct from old
    then
      raise exception 'Terminal assignments cannot be edited'
        using errcode = '23514';
    end if;
    return new;
  end if;

  transition_allowed := case old.status
    when 'assigned' then
      new.status in ('in_progress', 'submitted', 'missed')
    when 'in_progress' then
      new.status in ('submitted', 'missed')
    when 'submitted' then
      new.status in ('under_review', 'revision_required', 'completed')
    when 'under_review' then
      new.status in ('revision_required', 'completed')
    when 'revision_required' then
      new.status in ('submitted', 'missed')
    when 'missed' then
      new.status = 'recovery_assigned'
    else false
  end;

  if not transition_allowed then
    raise exception 'Invalid Foundry assignment transition: % -> %',
      old.status,
      new.status
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function private.guard_foundry_submission_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  transition_allowed boolean := false;
begin
  if new.workspace_id is distinct from old.workspace_id
    or new.id is distinct from old.id
    or new.assignment_id is distinct from old.assignment_id
    or new.student_id is distinct from old.student_id
    or new.attempt_number is distinct from old.attempt_number
    or new.submitted_at is distinct from old.submitted_at
    or new.created_at is distinct from old.created_at
  then
    raise exception 'Foundry submission identity is immutable'
      using errcode = '23514';
  end if;

  if old.status in ('accepted', 'revision_required', 'superseded')
    and new is distinct from old
  then
    raise exception 'Closed submissions are immutable'
      using errcode = '23514';
  end if;

  if new.status is not distinct from old.status then
    return new;
  end if;

  transition_allowed := case old.status
    when 'submitted' then
      new.status in ('under_review', 'revision_required', 'accepted')
    when 'under_review' then
      new.status in ('revision_required', 'accepted')
    else false
  end;

  if not transition_allowed then
    raise exception 'Invalid Foundry submission transition: % -> %',
      old.status,
      new.status
      using errcode = '23514';
  end if;

  if new.status in ('accepted', 'revision_required') then
    if new.feedback is null
      or char_length(btrim(new.feedback)) < 3
      or new.score is null
      or new.reviewed_at is null
      or new.reviewed_by is null
    then
      raise exception 'A reviewed submission requires feedback, score, reviewer, and time'
        using errcode = '23514';
    end if;

    if current_user = 'authenticated'
      and new.reviewed_by <> (select auth.uid())
    then
      raise exception 'Reviewer identity must match the signed-in user'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.guard_foundry_student_identity()
  from public, anon, authenticated;
revoke all on function private.guard_foundry_assignment_transition()
  from public, anon, authenticated;
revoke all on function private.guard_foundry_submission_transition()
  from public, anon, authenticated;

create trigger foundry_students_guard_identity
  before insert or update on public.foundry_students
  for each row execute function private.guard_foundry_student_identity();
create trigger foundry_assignments_guard_transition
  before update on public.foundry_task_assignments
  for each row execute function private.guard_foundry_assignment_transition();
create trigger foundry_submissions_guard_transition
  before update on public.foundry_submissions
  for each row execute function private.guard_foundry_submission_transition();

create or replace function private.create_foundry_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  task_title text;
begin
  if tg_table_name = 'foundry_task_assignments'
    and tg_op = 'INSERT'
  then
    select task.title
    into task_title
    from public.foundry_tasks task
    where task.workspace_id = new.workspace_id
      and task.id = new.task_id;

    insert into public.foundry_notifications (
      workspace_id,
      student_id,
      kind,
      title,
      body,
      source_type,
      source_id
    )
    values (
      new.workspace_id,
      new.student_id,
      'assignment_assigned',
      coalesce(task_title, 'Naya task'),
      'Aap ka naya task ready hai. Today tab mein pehla step dekhein.',
      'assignment',
      new.id
    )
    on conflict do nothing;
  elsif tg_table_name = 'foundry_submissions'
    and tg_op = 'UPDATE'
    and new.status is distinct from old.status
    and new.status in ('accepted', 'revision_required')
  then
    insert into public.foundry_notifications (
      workspace_id,
      student_id,
      kind,
      title,
      body,
      source_type,
      source_id
    )
    values (
      new.workspace_id,
      new.student_id,
      case
        when new.status = 'accepted' then 'submission_accepted'
        else 'revision_requested'
      end,
      case
        when new.status = 'accepted' then 'Task accepted'
        else 'Revision ready'
      end,
      case
        when new.status = 'accepted'
          then 'Shabash — feedback aur updated progress dekhein.'
        else 'Feedback parhein, bataya gaya step revise karein, phir dobara submit karein.'
      end,
      'submission',
      new.id
    )
    on conflict do nothing;
  end if;

  return new;
end;
$$;

create or replace function private.enqueue_foundry_outbox_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  record_workspace_id uuid := new.workspace_id;
  record_id uuid := new.id;
begin
  insert into public.foundry_outbox_events (
    workspace_id,
    topic,
    aggregate_type,
    aggregate_id,
    operation,
    actor_id,
    payload
  )
  values (
    record_workspace_id,
    'foundry.' || tg_table_name || '.' || lower(tg_op),
    tg_table_name,
    record_id,
    lower(tg_op),
    (select auth.uid()),
    jsonb_build_object(
      'record_id',
      record_id,
      'occurred_at',
      now()
    )
  );

  return new;
end;
$$;

revoke all on function private.create_foundry_notifications()
  from public, anon, authenticated;
revoke all on function private.enqueue_foundry_outbox_event()
  from public, anon, authenticated;

create trigger foundry_assignments_create_notification
  after insert on public.foundry_task_assignments
  for each row execute function private.create_foundry_notifications();
create trigger foundry_submissions_create_notification
  after update of status on public.foundry_submissions
  for each row execute function private.create_foundry_notifications();

create trigger foundry_students_enqueue_outbox
  after insert or update on public.foundry_students
  for each row execute function private.enqueue_foundry_outbox_event();
create trigger foundry_classes_enqueue_outbox
  after insert or update on public.foundry_classes
  for each row execute function private.enqueue_foundry_outbox_event();
create trigger foundry_attendance_enqueue_outbox
  after insert or update on public.foundry_attendance
  for each row execute function private.enqueue_foundry_outbox_event();
create trigger foundry_tasks_enqueue_outbox
  after insert or update on public.foundry_tasks
  for each row execute function private.enqueue_foundry_outbox_event();
create trigger foundry_assignments_enqueue_outbox
  after insert or update on public.foundry_task_assignments
  for each row execute function private.enqueue_foundry_outbox_event();
create trigger foundry_submissions_enqueue_outbox
  after insert or update on public.foundry_submissions
  for each row execute function private.enqueue_foundry_outbox_event();
create trigger foundry_skill_scores_enqueue_outbox
  after insert or update on public.foundry_skill_scores
  for each row execute function private.enqueue_foundry_outbox_event();

create or replace function public.create_foundry_class_command(
  target_workspace_id uuid,
  command_request_id uuid,
  class_title text,
  class_instructor_name text,
  class_department text,
  class_starts_at timestamptz,
  class_ends_at timestamptz,
  class_mode text,
  class_join_url text,
  class_notes text
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  current_user_id uuid := (select auth.uid());
  new_class_id uuid := gen_random_uuid();
  inserted_receipt_id uuid;
  existing_receipt public.foundry_command_receipts%rowtype;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not (select private.has_capability(target_workspace_id, 'foundry.manage')) then
    raise exception 'Foundry management access required' using errcode = '42501';
  end if;
  perform set_config('app.foundry_command', 'create_class', true);
  if class_ends_at <= class_starts_at then
    raise exception 'Class end must be after class start' using errcode = '22007';
  end if;

  insert into public.foundry_command_receipts (
    workspace_id,
    actor_id,
    request_id,
    command_type,
    primary_entity_id
  )
  values (
    target_workspace_id,
    current_user_id,
    command_request_id,
    'create_class',
    new_class_id
  )
  on conflict (actor_id, request_id) do nothing
  returning id into inserted_receipt_id;

  if inserted_receipt_id is null then
    select receipt.*
    into existing_receipt
    from public.foundry_command_receipts receipt
    where receipt.actor_id = current_user_id
      and receipt.request_id = command_request_id;

    if existing_receipt.command_type <> 'create_class'
      or existing_receipt.workspace_id <> target_workspace_id
      or existing_receipt.primary_entity_id is null
    then
      raise exception 'Idempotency key was already used for another command'
        using errcode = '23505';
    end if;
    return existing_receipt.primary_entity_id;
  end if;

  insert into public.foundry_classes (
    id,
    workspace_id,
    title,
    department,
    instructor_name,
    starts_at,
    ends_at,
    mode,
    join_url,
    status,
    notes,
    created_by
  )
  values (
    new_class_id,
    target_workspace_id,
    btrim(class_title),
    nullif(class_department, ''),
    btrim(class_instructor_name),
    class_starts_at,
    class_ends_at,
    class_mode,
    nullif(btrim(class_join_url), ''),
    'scheduled',
    nullif(btrim(class_notes), ''),
    current_user_id
  );

  return new_class_id;
end;
$$;

create or replace function public.create_foundry_task_assignment_command(
  target_workspace_id uuid,
  target_student_id uuid,
  command_request_id uuid,
  task_title text,
  task_instructions_roman_urdu text,
  task_department text,
  task_difficulty text,
  task_skill_dimension text,
  task_points smallint,
  assignment_due_at timestamptz
)
returns table (
  task_id uuid,
  assignment_id uuid
)
language plpgsql
volatile
security invoker
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  current_user_id uuid := (select auth.uid());
  new_task_id uuid := gen_random_uuid();
  new_assignment_id uuid := gen_random_uuid();
  inserted_receipt_id uuid;
  existing_receipt public.foundry_command_receipts%rowtype;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not (select private.has_capability(target_workspace_id, 'foundry.manage')) then
    raise exception 'Foundry management access required' using errcode = '42501';
  end if;
  perform set_config('app.foundry_command', 'create_task_assignment', true);
  if assignment_due_at <= now() - interval '5 minutes' then
    raise exception 'Assignment deadline must be in the future'
      using errcode = '22007';
  end if;
  if not exists (
    select 1
    from public.foundry_students student
    where student.workspace_id = target_workspace_id
      and student.id = target_student_id
      and student.lifecycle_status <> 'rejected'
  ) then
    raise exception 'Student is not active in this Foundry'
      using errcode = '23503';
  end if;

  insert into public.foundry_command_receipts (
    workspace_id,
    actor_id,
    request_id,
    command_type,
    primary_entity_id,
    secondary_entity_id
  )
  values (
    target_workspace_id,
    current_user_id,
    command_request_id,
    'create_task_assignment',
    new_task_id,
    new_assignment_id
  )
  on conflict (actor_id, request_id) do nothing
  returning id into inserted_receipt_id;

  if inserted_receipt_id is null then
    select receipt.*
    into existing_receipt
    from public.foundry_command_receipts receipt
    where receipt.actor_id = current_user_id
      and receipt.request_id = command_request_id;

    if existing_receipt.command_type <> 'create_task_assignment'
      or existing_receipt.workspace_id <> target_workspace_id
      or existing_receipt.primary_entity_id is null
      or existing_receipt.secondary_entity_id is null
    then
      raise exception 'Idempotency key was already used for another command'
        using errcode = '23505';
    end if;

    return query
    select
      existing_receipt.primary_entity_id,
      existing_receipt.secondary_entity_id;
    return;
  end if;

  insert into public.foundry_tasks (
    id,
    workspace_id,
    title,
    instructions_roman_urdu,
    department,
    difficulty,
    skill_dimension,
    points,
    status,
    created_by
  )
  values (
    new_task_id,
    target_workspace_id,
    btrim(task_title),
    btrim(task_instructions_roman_urdu),
    task_department,
    task_difficulty,
    nullif(task_skill_dimension, ''),
    task_points,
    'published',
    current_user_id
  );

  insert into public.foundry_task_assignments (
    id,
    workspace_id,
    task_id,
    student_id,
    status,
    due_at,
    assigned_by
  )
  values (
    new_assignment_id,
    target_workspace_id,
    new_task_id,
    target_student_id,
    'assigned',
    assignment_due_at,
    current_user_id
  );

  return query select new_task_id, new_assignment_id;
end;
$$;

create or replace function public.submit_foundry_assignment_command(
  target_assignment_id uuid,
  command_request_id uuid,
  work_url text,
  work_note text
)
returns table (
  submission_id uuid,
  attempt_number integer
)
language plpgsql
volatile
security invoker
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  current_user_id uuid := (select auth.uid());
  assignment_record record;
  new_submission_id uuid := gen_random_uuid();
  next_attempt_number integer;
  inserted_receipt_id uuid;
  existing_receipt public.foundry_command_receipts%rowtype;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  perform set_config('app.foundry_command', 'submit_assignment', true);
  perform pg_advisory_xact_lock(
    hashtextextended(target_assignment_id::text, 0)
  );

  select
    assignment.workspace_id,
    assignment.id,
    assignment.student_id,
    assignment.status
  into assignment_record
  from public.foundry_task_assignments assignment
  join public.foundry_students student
    on student.workspace_id = assignment.workspace_id
   and student.id = assignment.student_id
  where assignment.id = target_assignment_id
    and student.auth_user_id = current_user_id
    and student.lifecycle_status <> 'rejected';

  if assignment_record.id is null then
    raise exception 'Assignment is not linked to this student'
      using errcode = '42501';
  end if;

  select receipt.*
  into existing_receipt
  from public.foundry_command_receipts receipt
  where receipt.actor_id = current_user_id
    and receipt.request_id = command_request_id;

  if existing_receipt.id is not null then
    if existing_receipt.command_type <> 'submit_assignment'
      or existing_receipt.workspace_id <> assignment_record.workspace_id
      or existing_receipt.secondary_entity_id <> target_assignment_id
      or existing_receipt.primary_entity_id is null
    then
      raise exception 'Idempotency key was already used for another command'
        using errcode = '23505';
    end if;

    return query
    select
      submission.id,
      submission.attempt_number
    from public.foundry_submissions submission
    where submission.id = existing_receipt.primary_entity_id;
    return;
  end if;

  if assignment_record.status not in (
    'assigned',
    'in_progress',
    'revision_required'
  ) then
    raise exception 'Assignment is not accepting a submission'
      using errcode = '23514';
  end if;

  if nullif(btrim(work_url), '') is null
    and nullif(btrim(work_note), '') is null
  then
    raise exception 'Add a work link or a short note'
      using errcode = '23514';
  end if;
  if nullif(btrim(work_url), '') is not null
    and btrim(work_url) !~* '^https?://'
  then
    raise exception 'Work link must use http or https'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.foundry_submissions submission
    where submission.workspace_id = assignment_record.workspace_id
      and submission.assignment_id = target_assignment_id
      and submission.status in ('submitted', 'under_review')
  ) then
    raise exception 'This assignment already has work awaiting review'
      using errcode = '23505';
  end if;

  if (
    select count(*)
    from public.foundry_submissions submission
    where submission.student_id = assignment_record.student_id
      and submission.submitted_at > now() - interval '1 hour'
  ) >= 20 then
    raise exception 'Submission rate limit reached; try again later'
      using errcode = '54000';
  end if;

  select coalesce(max(submission.attempt_number), 0) + 1
  into next_attempt_number
  from public.foundry_submissions submission
  where submission.workspace_id = assignment_record.workspace_id
    and submission.assignment_id = target_assignment_id;

  insert into public.foundry_command_receipts (
    workspace_id,
    actor_id,
    request_id,
    command_type,
    primary_entity_id,
    secondary_entity_id
  )
  values (
    assignment_record.workspace_id,
    current_user_id,
    command_request_id,
    'submit_assignment',
    new_submission_id,
    target_assignment_id
  )
  on conflict (actor_id, request_id) do nothing
  returning id into inserted_receipt_id;

  if inserted_receipt_id is null then
    select receipt.*
    into existing_receipt
    from public.foundry_command_receipts receipt
    where receipt.actor_id = current_user_id
      and receipt.request_id = command_request_id;

    if existing_receipt.command_type <> 'submit_assignment'
      or existing_receipt.secondary_entity_id <> target_assignment_id
      or existing_receipt.primary_entity_id is null
    then
      raise exception 'Idempotency key was already used for another command'
        using errcode = '23505';
    end if;

    return query
    select
      submission.id,
      submission.attempt_number
    from public.foundry_submissions submission
    where submission.id = existing_receipt.primary_entity_id;
    return;
  end if;

  insert into public.foundry_submissions (
    id,
    workspace_id,
    assignment_id,
    student_id,
    attempt_number,
    submission_url,
    student_note,
    status,
    submitted_at
  )
  values (
    new_submission_id,
    assignment_record.workspace_id,
    target_assignment_id,
    assignment_record.student_id,
    next_attempt_number,
    nullif(btrim(work_url), ''),
    nullif(btrim(work_note), ''),
    'submitted',
    now()
  );

  return query select new_submission_id, next_attempt_number;
end;
$$;

create or replace function public.review_foundry_submission_command(
  target_submission_id uuid,
  command_request_id uuid,
  review_decision text,
  review_feedback text,
  review_score smallint
)
returns table (
  submission_id uuid,
  submission_status text
)
language plpgsql
volatile
security invoker
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  current_user_id uuid := (select auth.uid());
  submission_record public.foundry_submissions%rowtype;
  inserted_receipt_id uuid;
  existing_receipt public.foundry_command_receipts%rowtype;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if review_decision not in ('accepted', 'revision_required') then
    raise exception 'Review decision is invalid' using errcode = '22023';
  end if;
  if review_score < 0 or review_score > 100 then
    raise exception 'Review score must be between 0 and 100'
      using errcode = '22003';
  end if;
  if char_length(btrim(review_feedback)) < 3 then
    raise exception 'Review feedback is required' using errcode = '22023';
  end if;

  select submission.*
  into submission_record
  from public.foundry_submissions submission
  where submission.id = target_submission_id
  for update;

  if submission_record.id is null then
    raise exception 'Submission not found' using errcode = 'P0002';
  end if;
  if not (
    (select private.has_capability(
      submission_record.workspace_id,
      'foundry.manage'
    ))
    or (select private.has_capability(
      submission_record.workspace_id,
      'foundry.review'
    ))
  ) then
    raise exception 'Foundry review access required' using errcode = '42501';
  end if;
  perform set_config('app.foundry_command', 'review_submission', true);

  select receipt.*
  into existing_receipt
  from public.foundry_command_receipts receipt
  where receipt.actor_id = current_user_id
    and receipt.request_id = command_request_id;

  if existing_receipt.id is not null then
    if existing_receipt.command_type <> 'review_submission'
      or existing_receipt.workspace_id <> submission_record.workspace_id
      or existing_receipt.primary_entity_id <> target_submission_id
    then
      raise exception 'Idempotency key was already used for another command'
        using errcode = '23505';
    end if;

    return query
    select submission_record.id, submission_record.status;
    return;
  end if;

  if submission_record.status not in ('submitted', 'under_review') then
    raise exception 'Submission has already been reviewed'
      using errcode = '23514';
  end if;

  insert into public.foundry_command_receipts (
    workspace_id,
    actor_id,
    request_id,
    command_type,
    primary_entity_id,
    secondary_entity_id
  )
  values (
    submission_record.workspace_id,
    current_user_id,
    command_request_id,
    'review_submission',
    target_submission_id,
    submission_record.assignment_id
  )
  on conflict (actor_id, request_id) do nothing
  returning id into inserted_receipt_id;

  if inserted_receipt_id is null then
    select receipt.*
    into existing_receipt
    from public.foundry_command_receipts receipt
    where receipt.actor_id = current_user_id
      and receipt.request_id = command_request_id;

    if existing_receipt.command_type <> 'review_submission'
      or existing_receipt.primary_entity_id <> target_submission_id
    then
      raise exception 'Idempotency key was already used for another command'
        using errcode = '23505';
    end if;

    return query
    select submission_record.id, submission_record.status;
    return;
  end if;

  update public.foundry_submissions
  set status = review_decision,
      feedback = btrim(review_feedback),
      score = review_score,
      reviewed_at = now(),
      reviewed_by = current_user_id
  where id = target_submission_id;

  return query select target_submission_id, review_decision;
end;
$$;

create or replace function public.run_foundry_deadline_sweep(
  target_workspace_id uuid
)
returns integer
language plpgsql
volatile
security invoker
set search_path = ''
set statement_timeout = '10s'
as $$
declare
  affected_rows integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not (select private.has_capability(target_workspace_id, 'foundry.manage')) then
    raise exception 'Foundry management access required' using errcode = '42501';
  end if;
  perform set_config('app.foundry_command', 'deadline_sweep', true);

  update public.foundry_task_assignments assignment
  set status = 'missed'
  where assignment.workspace_id = target_workspace_id
    and assignment.status in ('assigned', 'in_progress')
    and assignment.due_at < now();

  get diagnostics affected_rows = row_count;
  return affected_rows;
end;
$$;

revoke all
  on function public.create_foundry_class_command(
    uuid,
    uuid,
    text,
    text,
    text,
    timestamptz,
    timestamptz,
    text,
    text,
    text
  )
  from public, anon;
revoke all
  on function public.create_foundry_task_assignment_command(
    uuid,
    uuid,
    uuid,
    text,
    text,
    text,
    text,
    text,
    smallint,
    timestamptz
  )
  from public, anon;
revoke all
  on function public.submit_foundry_assignment_command(
    uuid,
    uuid,
    text,
    text
  )
  from public, anon;
revoke all
  on function public.review_foundry_submission_command(
    uuid,
    uuid,
    text,
    text,
    smallint
  )
  from public, anon;
revoke all
  on function public.run_foundry_deadline_sweep(uuid)
  from public, anon;

grant execute
  on function public.create_foundry_class_command(
    uuid,
    uuid,
    text,
    text,
    text,
    timestamptz,
    timestamptz,
    text,
    text,
    text
  )
  to authenticated;
grant execute
  on function public.create_foundry_task_assignment_command(
    uuid,
    uuid,
    uuid,
    text,
    text,
    text,
    text,
    text,
    smallint,
    timestamptz
  )
  to authenticated;
grant execute
  on function public.submit_foundry_assignment_command(
    uuid,
    uuid,
    text,
    text
  )
  to authenticated;
grant execute
  on function public.review_foundry_submission_command(
    uuid,
    uuid,
    text,
    text,
    smallint
  )
  to authenticated;
grant execute
  on function public.run_foundry_deadline_sweep(uuid)
  to authenticated;

create or replace function public.claim_foundry_outbox_events(
  requested_batch_size integer default 25
)
returns setof public.foundry_outbox_events
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '10s'
as $$
begin
  return query
  with candidates as materialized (
    select event.id
    from public.foundry_outbox_events event
    where (
        event.status in ('pending', 'failed')
        and event.available_at <= now()
      )
      or (
        event.status = 'processing'
        and event.locked_at < now() - interval '15 minutes'
      )
    order by event.available_at, event.id
    for update skip locked
    limit least(greatest(coalesce(requested_batch_size, 25), 1), 100)
  )
  update public.foundry_outbox_events event
  set status = 'processing',
      attempt_count = event.attempt_count + 1,
      locked_at = now(),
      processed_at = null,
      last_error = null
  from candidates
  where event.id = candidates.id
  returning event.*;
end;
$$;

create or replace function public.complete_foundry_outbox_event(
  target_event_id bigint,
  was_successful boolean,
  error_message text default null
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  resulting_status text;
begin
  update public.foundry_outbox_events event
  set status = case when was_successful then 'succeeded' else 'failed' end,
      available_at = case
        when was_successful then event.available_at
        else now() + make_interval(
          secs => least(
            3600,
            30 * power(2::numeric, least(event.attempt_count, 7))::integer
          )
        )
      end,
      locked_at = null,
      processed_at = case when was_successful then now() else null end,
      last_error = case
        when was_successful then null
        else left(
          coalesce(
            nullif(btrim(error_message), ''),
            'Integration processing failed'
          ),
          2000
        )
      end
  where event.id = target_event_id
    and event.status = 'processing'
  returning event.status into resulting_status;

  if resulting_status is null then
    raise exception 'Outbox event is not currently processing'
      using errcode = 'P0002';
  end if;

  return resulting_status;
end;
$$;

revoke all on function public.claim_foundry_outbox_events(integer)
  from public, anon, authenticated;
revoke all on function public.complete_foundry_outbox_event(
  bigint,
  boolean,
  text
)
  from public, anon, authenticated;
grant execute on function public.claim_foundry_outbox_events(integer)
  to service_role;
grant execute on function public.complete_foundry_outbox_event(
  bigint,
  boolean,
  text
)
  to service_role;

-- Foundry records are retained. Product users archive state; hard deletion is
-- reserved for controlled database maintenance.
drop policy if exists foundry_students_delete_manage
  on public.foundry_students;
drop policy if exists foundry_classes_delete_manage
  on public.foundry_classes;
drop policy if exists foundry_attendance_delete_manage
  on public.foundry_attendance;
drop policy if exists foundry_tasks_delete_manage
  on public.foundry_tasks;
drop policy if exists foundry_assignments_delete_manage
  on public.foundry_task_assignments;
drop policy if exists foundry_submissions_delete_manage
  on public.foundry_submissions;
drop policy if exists foundry_progress_delete_manage
  on public.foundry_progress_events;
drop policy if exists foundry_skill_scores_delete_manage
  on public.foundry_skill_scores;

revoke delete on public.foundry_students from authenticated;
revoke delete on public.foundry_classes from authenticated;
revoke delete on public.foundry_attendance from authenticated;
revoke delete on public.foundry_tasks from authenticated;
revoke delete on public.foundry_task_assignments from authenticated;
revoke delete on public.foundry_submissions from authenticated;
revoke delete on public.foundry_progress_events from authenticated;
revoke delete on public.foundry_skill_scores from authenticated;

-- Progress is derived from evidence-producing workflows and remains append-only
-- to application users.
drop policy if exists foundry_progress_insert_staff
  on public.foundry_progress_events;
drop policy if exists foundry_progress_update_manage
  on public.foundry_progress_events;
revoke insert, update on public.foundry_progress_events from authenticated;

create or replace function private.capture_audit_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  record_workspace_id uuid;
  record_id uuid;
  old_record jsonb;
  new_record jsonb;
  changed_fields jsonb := '[]'::jsonb;
  event_metadata jsonb;
begin
  if tg_op = 'DELETE' then
    record_workspace_id := old.workspace_id;
    record_id := old.id;
    old_record := to_jsonb(old);
    new_record := '{}'::jsonb;
  elsif tg_op = 'INSERT' then
    record_workspace_id := new.workspace_id;
    record_id := new.id;
    old_record := '{}'::jsonb;
    new_record := to_jsonb(new);
  else
    record_workspace_id := new.workspace_id;
    record_id := new.id;
    old_record := to_jsonb(old);
    new_record := to_jsonb(new);
  end if;

  if tg_op = 'DELETE'
    and not exists (
      select 1
      from public.workspaces
      where id = record_workspace_id
    )
  then
    return old;
  end if;

  select coalesce(jsonb_agg(field_name order by field_name), '[]'::jsonb)
  into changed_fields
  from (
    select coalesce(old_field.key, new_field.key) as field_name
    from jsonb_each(old_record) old_field
    full join jsonb_each(new_record) new_field
      on new_field.key = old_field.key
    where old_field.value is distinct from new_field.value
      and coalesce(old_field.key, new_field.key) <> 'updated_at'
  ) changed;

  event_metadata := jsonb_strip_nulls(
    jsonb_build_object(
      'occurred_at',
      now(),
      'transaction_id',
      txid_current(),
      'changed_fields',
      changed_fields,
      'old_status',
      old_record ->> 'status',
      'new_status',
      new_record ->> 'status'
    )
  );

  insert into public.audit_events (
    workspace_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    record_workspace_id,
    (select auth.uid()),
    lower(tg_op),
    tg_table_name,
    record_id,
    event_metadata
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke all on function private.capture_audit_event()
  from public, anon, authenticated;

-- Workspace teardown cascades access rows after the workspace itself is gone.
-- Do not let a best-effort audit insert block that controlled teardown.
create or replace function private.capture_access_audit_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  payload jsonb;
  record_workspace_id uuid;
  record_id uuid;
begin
  payload := case
    when tg_op = 'DELETE' then to_jsonb(old)
    else to_jsonb(new)
  end;
  record_workspace_id := nullif(payload ->> 'workspace_id', '')::uuid;
  record_id := nullif(payload ->> 'id', '')::uuid;

  if record_workspace_id is null
    or not exists (
      select 1
      from public.workspaces
      where id = record_workspace_id
    )
  then
    return case when tg_op = 'DELETE' then old else new end;
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
    record_workspace_id,
    (select auth.uid()),
    lower(tg_op),
    tg_table_name,
    record_id,
    jsonb_strip_nulls(
      jsonb_build_object(
        'occurred_at',
        now(),
        'transaction_id',
        txid_current(),
        'module_key',
        payload ->> 'module_key',
        'bundle_id',
        payload ->> 'bundle_id',
        'capability_key',
        payload ->> 'capability_key',
        'target_user_id',
        payload ->> 'user_id',
        'effect',
        payload ->> 'effect'
      )
    )
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function private.capture_access_audit_event()
  from public, anon, authenticated;
