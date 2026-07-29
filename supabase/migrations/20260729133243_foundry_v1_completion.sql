-- Complete the Foundry V1 operating loop with safe class lifecycle rules,
-- class notifications, attendance evidence, and live notification delivery.

create index if not exists foundry_outbox_events_actor_id_idx
  on public.foundry_outbox_events(actor_id)
  where actor_id is not null;

alter table public.foundry_notifications
  drop constraint if exists foundry_notifications_kind_check;
alter table public.foundry_notifications
  add constraint foundry_notifications_kind_check
  check (
    kind in (
      'assignment_assigned',
      'revision_requested',
      'submission_accepted',
      'class_scheduled',
      'class_updated',
      'class_live',
      'class_cancelled'
    )
  );

alter table public.foundry_notifications
  drop constraint if exists foundry_notifications_source_type_check;
alter table public.foundry_notifications
  add constraint foundry_notifications_source_type_check
  check (source_type in ('assignment', 'submission', 'class'));

create or replace function private.guard_foundry_class_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if new.status = 'completed'
    and exists (
      select 1
      from public.foundry_students student
      where student.workspace_id = new.workspace_id
        and student.lifecycle_status not in (
          'inactive',
          'graduated',
          'rejected'
        )
        and (
          new.department is null
          or student.department = new.department
        )
        and not exists (
          select 1
          from public.foundry_attendance attendance
          where attendance.workspace_id = new.workspace_id
            and attendance.class_id = new.id
            and attendance.student_id = student.id
        )
    )
  then
    raise exception 'Save the complete attendance roster before completing class'
      using errcode = '23514';
  end if;

  if (
    old.status = 'scheduled'
    and new.status in ('live', 'completed', 'cancelled')
  ) or (
    old.status = 'live'
    and new.status in ('completed', 'cancelled')
  ) then
    return new;
  end if;

  raise exception 'Invalid Foundry class transition: % -> %',
    old.status,
    new.status
    using errcode = '23514';
end;
$$;

revoke all on function private.guard_foundry_class_transition()
  from public, anon, authenticated;

drop trigger if exists foundry_classes_guard_transition
  on public.foundry_classes;
create trigger foundry_classes_guard_transition
  before update of status on public.foundry_classes
  for each row execute function private.guard_foundry_class_transition();

create or replace function private.create_foundry_class_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  notification_kind text;
  notification_title text;
  notification_body text;
begin
  if tg_op = 'INSERT' then
    notification_kind := 'class_scheduled';
    notification_title := left('Class scheduled · ' || new.title, 180);
    notification_body := left(
      'Time: '
      || to_char(
        new.starts_at at time zone 'Asia/Karachi',
        'Mon DD · HH12:MI AM'
      )
      || '. Today tab mein class details dekhein.',
      1000
    );
  elsif new.status is distinct from old.status
    and new.status = 'cancelled'
  then
    notification_kind := 'class_cancelled';
    notification_title := left('Class cancelled · ' || new.title, 180);
    notification_body :=
      'Yeh class cancel ho gayi hai. Updated schedule ka intezar karein.';
  elsif new.status is distinct from old.status
    and new.status = 'live'
  then
    notification_kind := 'class_live';
    notification_title := left('Class live · ' || new.title, 180);
    notification_body :=
      'Class ab live hai. Today tab se joining link kholein.';
  elsif new.status not in ('completed', 'cancelled')
    and (
      new.title is distinct from old.title
      or new.starts_at is distinct from old.starts_at
      or new.ends_at is distinct from old.ends_at
      or new.join_url is distinct from old.join_url
      or new.mode is distinct from old.mode
      or new.notes is distinct from old.notes
    )
  then
    notification_kind := 'class_updated';
    notification_title := left('Class updated · ' || new.title, 180);
    notification_body :=
      'Class ka time, link ya note update hua hai. Today tab mein latest detail check karein.';
  else
    return new;
  end if;

  insert into public.foundry_notifications (
    workspace_id,
    student_id,
    kind,
    title,
    body,
    source_type,
    source_id
  )
  select
    new.workspace_id,
    student.id,
    notification_kind,
    notification_title,
    notification_body,
    'class',
    new.id
  from public.foundry_students student
  where student.workspace_id = new.workspace_id
    and student.lifecycle_status not in ('inactive', 'graduated', 'rejected')
    and (
      new.department is null
      or student.department = new.department
    )
  on conflict (
    workspace_id,
    student_id,
    kind,
    source_type,
    source_id
  )
  do update
  set title = excluded.title,
      body = excluded.body,
      read_at = null,
      created_at = now();

  return new;
end;
$$;

revoke all on function private.create_foundry_class_notifications()
  from public, anon, authenticated;

drop trigger if exists foundry_classes_create_notification
  on public.foundry_classes;
create trigger foundry_classes_create_notification
  after insert or update of
    title,
    starts_at,
    ends_at,
    join_url,
    mode,
    notes,
    status
  on public.foundry_classes
  for each row execute function private.create_foundry_class_notifications();

create or replace function private.handle_foundry_class_completed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is not distinct from old.status
    or new.status <> 'completed'
  then
    return new;
  end if;

  insert into public.foundry_progress_events (
    workspace_id,
    student_id,
    event_type,
    title,
    detail,
    points,
    source_type,
    source_id,
    occurred_at,
    created_by
  )
  select
    new.workspace_id,
    attendance.student_id,
    'class_completed',
    left('Class complete · ' || new.title, 180),
    'Attendance Foundry journey mein add ho gayi.',
    1,
    'class',
    new.id,
    coalesce(new.ends_at, now()),
    (select auth.uid())
  from public.foundry_attendance attendance
  where attendance.workspace_id = new.workspace_id
    and attendance.class_id = new.id
    and attendance.status in ('present', 'late')
  on conflict do nothing;

  update public.foundry_students student
  set last_active_at = greatest(
        coalesce(student.last_active_at, '-infinity'::timestamptz),
        coalesce(new.ends_at, now())
      )
  where student.workspace_id = new.workspace_id
    and student.id in (
      select attendance.student_id
      from public.foundry_attendance attendance
      where attendance.workspace_id = new.workspace_id
        and attendance.class_id = new.id
        and attendance.status in ('present', 'late')
    );

  return new;
end;
$$;

revoke all on function private.handle_foundry_class_completed()
  from public, anon, authenticated;

drop trigger if exists foundry_classes_record_completion
  on public.foundry_classes;
create trigger foundry_classes_record_completion
  after update of status on public.foundry_classes
  for each row execute function private.handle_foundry_class_completed();

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_publication_tables publication
    where publication.pubname = 'supabase_realtime'
      and publication.schemaname = 'public'
      and publication.tablename = 'foundry_notifications'
  ) then
    alter publication supabase_realtime
      add table public.foundry_notifications;
  end if;
end;
$$;
