create table public.foundry_students (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete set null,
  foundry_id text not null check (foundry_id ~ '^UFS-[A-Z0-9-]+$'),
  external_source text not null default 'manual'
    check (external_source in ('manual', 'airtable', 'notion')),
  external_record_id text check (
    external_record_id is null or char_length(external_record_id) <= 120
  ),
  application_id text check (
    application_id is null or char_length(application_id) <= 120
  ),
  full_name text not null check (char_length(full_name) between 2 and 120),
  email text check (email is null or char_length(email) <= 254),
  phone text check (phone is null or char_length(phone) <= 40),
  photo_url text check (photo_url is null or char_length(photo_url) <= 500),
  department text not null default 'unassigned'
    check (
      department in (
        'unassigned',
        'creative_ui',
        'web_app',
        'ai_automation',
        'sales_calling',
        'operations',
        'content_media'
      )
    ),
  level text not null default 'applied'
    check (
      level in (
        'applied',
        'screening',
        'trial',
        'accepted',
        'onboarding',
        'explorer',
        'apprentice',
        'operator',
        'specialist',
        'mentor_alumni'
      )
    ),
  lifecycle_status text not null default 'new'
    check (
      lifecycle_status in (
        'new',
        'reviewing',
        'shortlisted',
        'accepted',
        'waitlisted',
        'enrolled',
        'inactive',
        'graduated',
        'rejected'
      )
    ),
  health_status text not null default 'yellow'
    check (health_status in ('green', 'yellow', 'red', 'gold')),
  progress_percent smallint not null default 0
    check (progress_percent between 0 and 100),
  device_access text not null default 'unknown'
    check (
      device_access in (
        'own_laptop',
        'shared_laptop',
        'mobile_only',
        'no_reliable_device',
        'unknown'
      )
    ),
  preferred_language text not null default 'roman_urdu'
    check (
      preferred_language in ('roman_urdu', 'urdu', 'english', 'bilingual')
    ),
  learning_difficulty text check (
    learning_difficulty is null or char_length(learning_difficulty) <= 500
  ),
  main_goal text check (main_goal is null or char_length(main_goal) <= 1000),
  founder_notes text check (
    founder_notes is null or char_length(founder_notes) <= 4000
  ),
  next_action text check (
    next_action is null or char_length(next_action) <= 500
  ),
  batch_label text check (
    batch_label is null or char_length(batch_label) <= 80
  ),
  studio_eligible boolean not null default false,
  last_active_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  unique (workspace_id, foundry_id)
);

create unique index foundry_students_workspace_auth_user_idx
  on public.foundry_students(workspace_id, auth_user_id)
  where auth_user_id is not null;
create unique index foundry_students_workspace_external_record_idx
  on public.foundry_students(workspace_id, external_source, external_record_id)
  where external_record_id is not null;
create index foundry_students_workspace_health_idx
  on public.foundry_students(workspace_id, health_status, updated_at desc);
create index foundry_students_workspace_department_idx
  on public.foundry_students(workspace_id, department, lifecycle_status);
create index foundry_students_auth_user_idx
  on public.foundry_students(auth_user_id)
  where auth_user_id is not null;
create index foundry_students_created_by_idx
  on public.foundry_students(created_by);

create table public.foundry_classes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 180),
  department text check (
    department is null
    or department in (
      'creative_ui',
      'web_app',
      'ai_automation',
      'sales_calling',
      'operations',
      'content_media'
    )
  ),
  instructor_name text not null check (char_length(instructor_name) between 2 and 120),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  mode text not null default 'online' check (mode in ('online', 'onsite', 'hybrid')),
  join_url text check (join_url is null or char_length(join_url) <= 500),
  room_label text check (room_label is null or char_length(room_label) <= 120),
  status text not null default 'scheduled'
    check (status in ('scheduled', 'live', 'completed', 'cancelled')),
  capacity smallint not null default 20 check (capacity between 1 and 500),
  notes text check (notes is null or char_length(notes) <= 2000),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint foundry_class_time_valid check (ends_at > starts_at),
  unique (workspace_id, id)
);

create index foundry_classes_workspace_start_idx
  on public.foundry_classes(workspace_id, starts_at);
create index foundry_classes_workspace_department_idx
  on public.foundry_classes(workspace_id, department, starts_at);
create index foundry_classes_created_by_idx
  on public.foundry_classes(created_by);

create table public.foundry_attendance (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  class_id uuid not null,
  student_id uuid not null,
  status text not null check (status in ('present', 'late', 'absent', 'excused')),
  note text check (note is null or char_length(note) <= 500),
  marked_by uuid not null references auth.users(id) on delete restrict,
  marked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint foundry_attendance_class_same_workspace
    foreign key (workspace_id, class_id)
    references public.foundry_classes(workspace_id, id) on delete cascade,
  constraint foundry_attendance_student_same_workspace
    foreign key (workspace_id, student_id)
    references public.foundry_students(workspace_id, id) on delete cascade,
  unique (workspace_id, class_id, student_id),
  unique (workspace_id, id)
);

create index foundry_attendance_class_status_idx
  on public.foundry_attendance(class_id, status);
create index foundry_attendance_student_marked_idx
  on public.foundry_attendance(student_id, marked_at desc);
create index foundry_attendance_workspace_class_idx
  on public.foundry_attendance(workspace_id, class_id);
create index foundry_attendance_workspace_student_idx
  on public.foundry_attendance(workspace_id, student_id);
create index foundry_attendance_marked_by_idx
  on public.foundry_attendance(marked_by);

create table public.foundry_tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  class_id uuid,
  title text not null check (char_length(title) between 2 and 180),
  instructions_roman_urdu text not null
    check (char_length(instructions_roman_urdu) between 10 and 8000),
  instructions_english text check (
    instructions_english is null
    or char_length(instructions_english) between 10 and 8000
  ),
  department text not null default 'unassigned'
    check (
      department in (
        'unassigned',
        'creative_ui',
        'web_app',
        'ai_automation',
        'sales_calling',
        'operations',
        'content_media'
      )
    ),
  difficulty text not null default 'starter'
    check (difficulty in ('starter', 'standard', 'stretch', 'recovery')),
  skill_dimension text check (
    skill_dimension is null
    or skill_dimension in (
      'quality',
      'deadline',
      'communication',
      'revision',
      'teamwork',
      'reliability',
      'client_readiness'
    )
  ),
  points smallint not null default 10 check (points between 0 and 100),
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint foundry_tasks_class_same_workspace
    foreign key (workspace_id, class_id)
    references public.foundry_classes(workspace_id, id)
    on delete set null (class_id),
  unique (workspace_id, id)
);

create index foundry_tasks_workspace_status_idx
  on public.foundry_tasks(workspace_id, status, created_at desc);
create index foundry_tasks_workspace_department_idx
  on public.foundry_tasks(workspace_id, department, status);
create index foundry_tasks_workspace_class_idx
  on public.foundry_tasks(workspace_id, class_id)
  where class_id is not null;
create index foundry_tasks_created_by_idx
  on public.foundry_tasks(created_by);

create table public.foundry_task_assignments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  task_id uuid not null,
  student_id uuid not null,
  status text not null default 'assigned'
    check (
      status in (
        'assigned',
        'in_progress',
        'submitted',
        'under_review',
        'revision_required',
        'completed',
        'missed',
        'recovery_assigned'
      )
    ),
  due_at timestamptz not null,
  assigned_by uuid not null references auth.users(id) on delete restrict,
  recovery_for_assignment_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint foundry_assignments_task_same_workspace
    foreign key (workspace_id, task_id)
    references public.foundry_tasks(workspace_id, id) on delete cascade,
  constraint foundry_assignments_student_same_workspace
    foreign key (workspace_id, student_id)
    references public.foundry_students(workspace_id, id) on delete cascade,
  constraint foundry_assignments_recovery_same_workspace
    foreign key (workspace_id, recovery_for_assignment_id)
    references public.foundry_task_assignments(workspace_id, id)
    on delete set null (recovery_for_assignment_id),
  unique (workspace_id, id),
  unique (workspace_id, task_id, student_id),
  unique (workspace_id, id, student_id)
);

create unique index foundry_assignments_one_recovery_idx
  on public.foundry_task_assignments(workspace_id, recovery_for_assignment_id)
  where recovery_for_assignment_id is not null;
create index foundry_assignments_workspace_status_due_idx
  on public.foundry_task_assignments(workspace_id, status, due_at);
create index foundry_assignments_workspace_task_idx
  on public.foundry_task_assignments(workspace_id, task_id);
create index foundry_assignments_workspace_student_idx
  on public.foundry_task_assignments(workspace_id, student_id, due_at desc);
create index foundry_assignments_assigned_by_idx
  on public.foundry_task_assignments(assigned_by);

create table public.foundry_submissions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  assignment_id uuid not null,
  student_id uuid not null,
  submission_url text check (
    submission_url is null or char_length(submission_url) <= 1000
  ),
  student_note text check (
    student_note is null or char_length(student_note) <= 4000
  ),
  status text not null default 'submitted'
    check (
      status in (
        'submitted',
        'under_review',
        'revision_required',
        'accepted'
      )
    ),
  feedback text check (feedback is null or char_length(feedback) <= 8000),
  score smallint check (score is null or score between 0 and 100),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint foundry_submissions_assignment_owner_same_workspace
    foreign key (workspace_id, assignment_id, student_id)
    references public.foundry_task_assignments(workspace_id, id, student_id)
    on delete cascade,
  unique (workspace_id, id)
);

create index foundry_submissions_workspace_status_idx
  on public.foundry_submissions(workspace_id, status, submitted_at);
create index foundry_submissions_workspace_assignment_idx
  on public.foundry_submissions(workspace_id, assignment_id, submitted_at desc);
create index foundry_submissions_workspace_student_idx
  on public.foundry_submissions(workspace_id, student_id, submitted_at desc);
create index foundry_submissions_reviewed_by_idx
  on public.foundry_submissions(reviewed_by)
  where reviewed_by is not null;

create table public.foundry_progress_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  student_id uuid not null,
  event_type text not null
    check (
      event_type in (
        'attendance',
        'task_submitted',
        'task_completed',
        'revision',
        'badge',
        'health_change',
        'studio_ready',
        'class_completed'
      )
    ),
  title text not null check (char_length(title) between 2 and 180),
  detail text check (detail is null or char_length(detail) <= 2000),
  points smallint not null default 0 check (points between 0 and 100),
  evidence_url text check (
    evidence_url is null or char_length(evidence_url) <= 1000
  ),
  source_type text check (
    source_type is null
    or source_type in ('class', 'attendance', 'assignment', 'submission', 'manual')
  ),
  source_id uuid,
  occurred_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint foundry_progress_student_same_workspace
    foreign key (workspace_id, student_id)
    references public.foundry_students(workspace_id, id) on delete cascade,
  unique (workspace_id, id)
);

create unique index foundry_progress_source_event_idx
  on public.foundry_progress_events(
    workspace_id,
    student_id,
    event_type,
    source_type,
    source_id
  )
  where source_id is not null;
create index foundry_progress_workspace_student_idx
  on public.foundry_progress_events(workspace_id, student_id, occurred_at desc);
create index foundry_progress_created_by_idx
  on public.foundry_progress_events(created_by)
  where created_by is not null;

create table public.foundry_skill_scores (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  student_id uuid not null,
  dimension text not null
    check (
      dimension in (
        'quality',
        'deadline',
        'communication',
        'revision',
        'teamwork',
        'reliability',
        'client_readiness'
      )
    ),
  score smallint not null check (score between 0 and 100),
  evidence_count integer not null default 0 check (evidence_count >= 0),
  note text check (note is null or char_length(note) <= 1000),
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint foundry_skill_student_same_workspace
    foreign key (workspace_id, student_id)
    references public.foundry_students(workspace_id, id) on delete cascade,
  unique (workspace_id, student_id, dimension),
  unique (workspace_id, id)
);

create index foundry_skill_workspace_student_idx
  on public.foundry_skill_scores(workspace_id, student_id);
create index foundry_skill_updated_by_idx
  on public.foundry_skill_scores(updated_by);

create table public.foundry_sync_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  source text not null check (source in ('airtable', 'notion', 'manual')),
  direction text not null check (direction in ('inbound', 'outbound')),
  status text not null check (status in ('running', 'succeeded', 'partial', 'failed')),
  records_seen integer not null default 0 check (records_seen >= 0),
  records_changed integer not null default 0 check (records_changed >= 0),
  error_summary text check (
    error_summary is null or char_length(error_summary) <= 4000
  ),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  initiated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (workspace_id, id)
);

create index foundry_sync_runs_workspace_started_idx
  on public.foundry_sync_runs(workspace_id, started_at desc);
create index foundry_sync_runs_initiated_by_idx
  on public.foundry_sync_runs(initiated_by)
  where initiated_by is not null;

create function private.is_foundry_student(
  target_workspace_id uuid,
  target_student_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.foundry_students fs
    where fs.workspace_id = target_workspace_id
      and fs.auth_user_id = (select auth.uid())
      and (
        target_student_id is null
        or fs.id = target_student_id
      )
  );
$$;

revoke all on function private.is_foundry_student(uuid, uuid)
  from public, anon;
grant execute on function private.is_foundry_student(uuid, uuid)
  to authenticated;

create function private.handle_foundry_submission_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.foundry_task_assignments
  set status = 'submitted'
  where workspace_id = new.workspace_id
    and id = new.assignment_id
    and student_id = new.student_id
    and status in (
      'assigned',
      'in_progress',
      'revision_required',
      'recovery_assigned'
    );

  update public.foundry_students
  set last_active_at = new.submitted_at,
      next_action = 'Teacher feedback ka intezar karein.'
  where workspace_id = new.workspace_id
    and id = new.student_id;

  insert into public.foundry_progress_events (
    workspace_id,
    student_id,
    event_type,
    title,
    detail,
    points,
    evidence_url,
    source_type,
    source_id,
    occurred_at,
    created_by
  )
  values (
    new.workspace_id,
    new.student_id,
    'task_submitted',
    'Task submit ho gaya',
    'Teacher review ke liye work mil gaya hai.',
    2,
    new.submission_url,
    'submission',
    new.id,
    new.submitted_at,
    (select auth.uid())
  )
  on conflict do nothing;

  return new;
end;
$$;

create function private.handle_foundry_submission_reviewed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  task_points smallint := 0;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if new.status = 'accepted' then
    select ft.points into task_points
    from public.foundry_task_assignments fta
    join public.foundry_tasks ft
      on ft.workspace_id = fta.workspace_id
     and ft.id = fta.task_id
    where fta.workspace_id = new.workspace_id
      and fta.id = new.assignment_id;

    update public.foundry_task_assignments
    set status = 'completed'
    where workspace_id = new.workspace_id
      and id = new.assignment_id;

    update public.foundry_students
    set progress_percent = least(100, progress_percent + greatest(3, task_points / 2)),
        health_status = case when studio_eligible then 'gold' else 'green' end,
        last_active_at = coalesce(new.reviewed_at, now()),
        next_action = 'Agla task khol kar pehla step complete karein.'
    where workspace_id = new.workspace_id
      and id = new.student_id;

    insert into public.foundry_progress_events (
      workspace_id,
      student_id,
      event_type,
      title,
      detail,
      points,
      evidence_url,
      source_type,
      source_id,
      occurred_at,
      created_by
    )
    values (
      new.workspace_id,
      new.student_id,
      'task_completed',
      'Task accepted',
      coalesce(new.feedback, 'Teacher ne task accept kar liya.'),
      task_points,
      new.submission_url,
      'submission',
      new.id,
      coalesce(new.reviewed_at, now()),
      new.reviewed_by
    )
    on conflict do nothing;
  elsif new.status = 'revision_required' then
    update public.foundry_task_assignments
    set status = 'revision_required'
    where workspace_id = new.workspace_id
      and id = new.assignment_id;

    update public.foundry_students
    set health_status = case when health_status = 'red' then 'red' else 'yellow' end,
        next_action = 'Feedback parhein aur sirf bataya gaya step revise karein.'
    where workspace_id = new.workspace_id
      and id = new.student_id;

    insert into public.foundry_progress_events (
      workspace_id,
      student_id,
      event_type,
      title,
      detail,
      points,
      evidence_url,
      source_type,
      source_id,
      occurred_at,
      created_by
    )
    values (
      new.workspace_id,
      new.student_id,
      'revision',
      'Revision ka mauqa',
      coalesce(new.feedback, 'Feedback ke mutabiq dobara submit karein.'),
      1,
      new.submission_url,
      'submission',
      new.id,
      coalesce(new.reviewed_at, now()),
      new.reviewed_by
    )
    on conflict do nothing;
  elsif new.status = 'under_review' then
    update public.foundry_task_assignments
    set status = 'under_review'
    where workspace_id = new.workspace_id
      and id = new.assignment_id;
  end if;

  return new;
end;
$$;

create function private.handle_foundry_assignment_recovery()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_task public.foundry_tasks%rowtype;
  recovery_task_id uuid;
begin
  if new.status <> 'missed' or old.status = 'missed' then
    return new;
  end if;

  if new.recovery_for_assignment_id is not null then
    return new;
  end if;

  select * into source_task
  from public.foundry_tasks
  where workspace_id = new.workspace_id
    and id = new.task_id;

  insert into public.foundry_tasks (
    workspace_id,
    class_id,
    title,
    instructions_roman_urdu,
    instructions_english,
    department,
    difficulty,
    skill_dimension,
    points,
    status,
    created_by
  )
  values (
    new.workspace_id,
    source_task.class_id,
    'Recovery: ' || source_task.title,
    'Pehle task ka sirf sab se chhota hissa complete karein. 20 minute ka timer lagayein, work save karein, phir jo bana hai woh submit kar dein.',
    'Complete only the smallest part of the original task. Work for 20 minutes, save it, and submit what you have.',
    source_task.department,
    'recovery',
    source_task.skill_dimension,
    greatest(3, source_task.points / 2),
    'published',
    source_task.created_by
  )
  returning id into recovery_task_id;

  insert into public.foundry_task_assignments (
    workspace_id,
    task_id,
    student_id,
    status,
    due_at,
    assigned_by,
    recovery_for_assignment_id
  )
  values (
    new.workspace_id,
    recovery_task_id,
    new.student_id,
    'assigned',
    now() + interval '2 days',
    new.assigned_by,
    new.id
  );

  update public.foundry_task_assignments
  set status = 'recovery_assigned'
  where workspace_id = new.workspace_id
    and id = new.id;

  update public.foundry_students
  set health_status = case when health_status = 'red' then 'red' else 'yellow' end,
      next_action = 'Recovery task ka pehla 20-minute step complete karein.'
  where workspace_id = new.workspace_id
    and id = new.student_id;

  return new;
end;
$$;

create function private.recalculate_foundry_readiness()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_workspace_id uuid;
  target_student_id uuid;
  score_count integer;
  score_average numeric;
  minimum_score smallint;
  was_ready boolean;
  is_ready boolean;
begin
  if tg_op = 'DELETE' then
    target_workspace_id := old.workspace_id;
    target_student_id := old.student_id;
  else
    target_workspace_id := new.workspace_id;
    target_student_id := new.student_id;
  end if;

  select count(*), coalesce(avg(score), 0), coalesce(min(score), 0)
  into score_count, score_average, minimum_score
  from public.foundry_skill_scores
  where workspace_id = target_workspace_id
    and student_id = target_student_id;

  is_ready := score_count >= 4
    and score_average >= 75
    and minimum_score >= 65;

  select studio_eligible into was_ready
  from public.foundry_students
  where workspace_id = target_workspace_id
    and id = target_student_id;

  update public.foundry_students
  set studio_eligible = is_ready,
      health_status = case
        when is_ready then 'gold'
        when health_status = 'gold' then 'green'
        else health_status
      end
  where workspace_id = target_workspace_id
    and id = target_student_id;

  if is_ready and not coalesce(was_ready, false) then
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
    values (
      target_workspace_id,
      target_student_id,
      'studio_ready',
      'Studio Ready',
      'Skill quality, reliability aur feedback readiness threshold complete.',
      25,
      'manual',
      target_student_id,
      now(),
      case when tg_op = 'DELETE' then old.updated_by else new.updated_by end
    )
    on conflict do nothing;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke all on function private.handle_foundry_submission_created()
  from public, anon, authenticated;
revoke all on function private.handle_foundry_submission_reviewed()
  from public, anon, authenticated;
revoke all on function private.handle_foundry_assignment_recovery()
  from public, anon, authenticated;
revoke all on function private.recalculate_foundry_readiness()
  from public, anon, authenticated;

create trigger foundry_students_set_updated_at
  before update on public.foundry_students
  for each row execute function private.set_updated_at();
create trigger foundry_classes_set_updated_at
  before update on public.foundry_classes
  for each row execute function private.set_updated_at();
create trigger foundry_attendance_set_updated_at
  before update on public.foundry_attendance
  for each row execute function private.set_updated_at();
create trigger foundry_tasks_set_updated_at
  before update on public.foundry_tasks
  for each row execute function private.set_updated_at();
create trigger foundry_assignments_set_updated_at
  before update on public.foundry_task_assignments
  for each row execute function private.set_updated_at();
create trigger foundry_submissions_set_updated_at
  before update on public.foundry_submissions
  for each row execute function private.set_updated_at();
create trigger foundry_skill_scores_set_updated_at
  before update on public.foundry_skill_scores
  for each row execute function private.set_updated_at();

create trigger foundry_submission_created
  after insert on public.foundry_submissions
  for each row execute function private.handle_foundry_submission_created();
create trigger foundry_submission_reviewed
  after update of status on public.foundry_submissions
  for each row execute function private.handle_foundry_submission_reviewed();
create trigger foundry_assignment_recovery
  after update of status on public.foundry_task_assignments
  for each row execute function private.handle_foundry_assignment_recovery();
create trigger foundry_skill_scores_recalculate
  after insert or update or delete on public.foundry_skill_scores
  for each row execute function private.recalculate_foundry_readiness();

create trigger foundry_students_capture_audit
  after insert or update or delete on public.foundry_students
  for each row execute function private.capture_audit_event();
create trigger foundry_classes_capture_audit
  after insert or update or delete on public.foundry_classes
  for each row execute function private.capture_audit_event();
create trigger foundry_attendance_capture_audit
  after insert or update or delete on public.foundry_attendance
  for each row execute function private.capture_audit_event();
create trigger foundry_tasks_capture_audit
  after insert or update or delete on public.foundry_tasks
  for each row execute function private.capture_audit_event();
create trigger foundry_assignments_capture_audit
  after insert or update or delete on public.foundry_task_assignments
  for each row execute function private.capture_audit_event();
create trigger foundry_submissions_capture_audit
  after insert or update or delete on public.foundry_submissions
  for each row execute function private.capture_audit_event();
create trigger foundry_progress_capture_audit
  after insert or update or delete on public.foundry_progress_events
  for each row execute function private.capture_audit_event();
create trigger foundry_skill_scores_capture_audit
  after insert or update or delete on public.foundry_skill_scores
  for each row execute function private.capture_audit_event();

alter table public.foundry_students enable row level security;
alter table public.foundry_classes enable row level security;
alter table public.foundry_attendance enable row level security;
alter table public.foundry_tasks enable row level security;
alter table public.foundry_task_assignments enable row level security;
alter table public.foundry_submissions enable row level security;
alter table public.foundry_progress_events enable row level security;
alter table public.foundry_skill_scores enable row level security;
alter table public.foundry_sync_runs enable row level security;

create policy foundry_students_select_authorised
on public.foundry_students for select
to authenticated
using (
  (select private.has_capability(workspace_id, 'foundry.manage'))
  or (select private.has_capability(workspace_id, 'foundry.review'))
  or (
    auth_user_id = (select auth.uid())
    and (select private.has_capability(workspace_id, 'foundry.learn'))
  )
);

create policy foundry_students_insert_manage
on public.foundry_students for insert
to authenticated
with check ((select private.has_capability(workspace_id, 'foundry.manage')));

create policy foundry_students_update_manage
on public.foundry_students for update
to authenticated
using ((select private.has_capability(workspace_id, 'foundry.manage')))
with check ((select private.has_capability(workspace_id, 'foundry.manage')));

create policy foundry_students_delete_manage
on public.foundry_students for delete
to authenticated
using ((select private.has_capability(workspace_id, 'foundry.manage')));

create policy foundry_classes_select_authorised
on public.foundry_classes for select
to authenticated
using (
  (select private.has_capability(workspace_id, 'foundry.manage'))
  or (select private.has_capability(workspace_id, 'foundry.review'))
  or (
    (select private.has_capability(workspace_id, 'foundry.learn'))
    and (select private.is_foundry_student(workspace_id))
  )
);

create policy foundry_classes_insert_manage
on public.foundry_classes for insert
to authenticated
with check ((select private.has_capability(workspace_id, 'foundry.manage')));

create policy foundry_classes_update_manage
on public.foundry_classes for update
to authenticated
using ((select private.has_capability(workspace_id, 'foundry.manage')))
with check ((select private.has_capability(workspace_id, 'foundry.manage')));

create policy foundry_classes_delete_manage
on public.foundry_classes for delete
to authenticated
using ((select private.has_capability(workspace_id, 'foundry.manage')));

create policy foundry_attendance_select_authorised
on public.foundry_attendance for select
to authenticated
using (
  (select private.has_capability(workspace_id, 'foundry.manage'))
  or (select private.has_capability(workspace_id, 'foundry.review'))
  or (
    (select private.has_capability(workspace_id, 'foundry.learn'))
    and (select private.is_foundry_student(workspace_id, student_id))
  )
);

create policy foundry_attendance_insert_staff
on public.foundry_attendance for insert
to authenticated
with check (
  (select private.has_capability(workspace_id, 'foundry.manage'))
  or (select private.has_capability(workspace_id, 'foundry.review'))
);

create policy foundry_attendance_update_staff
on public.foundry_attendance for update
to authenticated
using (
  (select private.has_capability(workspace_id, 'foundry.manage'))
  or (select private.has_capability(workspace_id, 'foundry.review'))
)
with check (
  (select private.has_capability(workspace_id, 'foundry.manage'))
  or (select private.has_capability(workspace_id, 'foundry.review'))
);

create policy foundry_attendance_delete_manage
on public.foundry_attendance for delete
to authenticated
using ((select private.has_capability(workspace_id, 'foundry.manage')));

create policy foundry_tasks_select_authorised
on public.foundry_tasks for select
to authenticated
using (
  (select private.has_capability(workspace_id, 'foundry.manage'))
  or (select private.has_capability(workspace_id, 'foundry.review'))
  or (
    status = 'published'
    and (select private.has_capability(workspace_id, 'foundry.learn'))
    and (select private.is_foundry_student(workspace_id))
  )
);

create policy foundry_tasks_insert_manage
on public.foundry_tasks for insert
to authenticated
with check ((select private.has_capability(workspace_id, 'foundry.manage')));

create policy foundry_tasks_update_manage
on public.foundry_tasks for update
to authenticated
using ((select private.has_capability(workspace_id, 'foundry.manage')))
with check ((select private.has_capability(workspace_id, 'foundry.manage')));

create policy foundry_tasks_delete_manage
on public.foundry_tasks for delete
to authenticated
using ((select private.has_capability(workspace_id, 'foundry.manage')));

create policy foundry_assignments_select_authorised
on public.foundry_task_assignments for select
to authenticated
using (
  (select private.has_capability(workspace_id, 'foundry.manage'))
  or (select private.has_capability(workspace_id, 'foundry.review'))
  or (
    (select private.has_capability(workspace_id, 'foundry.learn'))
    and (select private.is_foundry_student(workspace_id, student_id))
  )
);

create policy foundry_assignments_insert_manage
on public.foundry_task_assignments for insert
to authenticated
with check ((select private.has_capability(workspace_id, 'foundry.manage')));

create policy foundry_assignments_update_staff
on public.foundry_task_assignments for update
to authenticated
using (
  (select private.has_capability(workspace_id, 'foundry.manage'))
  or (select private.has_capability(workspace_id, 'foundry.review'))
)
with check (
  (select private.has_capability(workspace_id, 'foundry.manage'))
  or (select private.has_capability(workspace_id, 'foundry.review'))
);

create policy foundry_assignments_delete_manage
on public.foundry_task_assignments for delete
to authenticated
using ((select private.has_capability(workspace_id, 'foundry.manage')));

create policy foundry_submissions_select_authorised
on public.foundry_submissions for select
to authenticated
using (
  (select private.has_capability(workspace_id, 'foundry.manage'))
  or (select private.has_capability(workspace_id, 'foundry.review'))
  or (
    (select private.has_capability(workspace_id, 'foundry.learn'))
    and (select private.is_foundry_student(workspace_id, student_id))
  )
);

create policy foundry_submissions_insert_authorised
on public.foundry_submissions for insert
to authenticated
with check (
  (select private.has_capability(workspace_id, 'foundry.manage'))
  or (select private.has_capability(workspace_id, 'foundry.review'))
  or (
    status = 'submitted'
    and feedback is null
    and score is null
    and reviewed_at is null
    and reviewed_by is null
    and (select private.has_capability(workspace_id, 'foundry.learn'))
    and (select private.is_foundry_student(workspace_id, student_id))
  )
);

create policy foundry_submissions_update_staff
on public.foundry_submissions for update
to authenticated
using (
  (select private.has_capability(workspace_id, 'foundry.manage'))
  or (select private.has_capability(workspace_id, 'foundry.review'))
)
with check (
  (select private.has_capability(workspace_id, 'foundry.manage'))
  or (select private.has_capability(workspace_id, 'foundry.review'))
);

create policy foundry_submissions_delete_manage
on public.foundry_submissions for delete
to authenticated
using ((select private.has_capability(workspace_id, 'foundry.manage')));

create policy foundry_progress_select_authorised
on public.foundry_progress_events for select
to authenticated
using (
  (select private.has_capability(workspace_id, 'foundry.manage'))
  or (select private.has_capability(workspace_id, 'foundry.review'))
  or (
    (select private.has_capability(workspace_id, 'foundry.learn'))
    and (select private.is_foundry_student(workspace_id, student_id))
  )
);

create policy foundry_progress_insert_staff
on public.foundry_progress_events for insert
to authenticated
with check (
  (select private.has_capability(workspace_id, 'foundry.manage'))
  or (select private.has_capability(workspace_id, 'foundry.review'))
);

create policy foundry_progress_update_manage
on public.foundry_progress_events for update
to authenticated
using ((select private.has_capability(workspace_id, 'foundry.manage')))
with check ((select private.has_capability(workspace_id, 'foundry.manage')));

create policy foundry_progress_delete_manage
on public.foundry_progress_events for delete
to authenticated
using ((select private.has_capability(workspace_id, 'foundry.manage')));

create policy foundry_skill_scores_select_authorised
on public.foundry_skill_scores for select
to authenticated
using (
  (select private.has_capability(workspace_id, 'foundry.manage'))
  or (select private.has_capability(workspace_id, 'foundry.review'))
  or (
    (select private.has_capability(workspace_id, 'foundry.learn'))
    and (select private.is_foundry_student(workspace_id, student_id))
  )
);

create policy foundry_skill_scores_insert_staff
on public.foundry_skill_scores for insert
to authenticated
with check (
  (select private.has_capability(workspace_id, 'foundry.manage'))
  or (select private.has_capability(workspace_id, 'foundry.review'))
);

create policy foundry_skill_scores_update_staff
on public.foundry_skill_scores for update
to authenticated
using (
  (select private.has_capability(workspace_id, 'foundry.manage'))
  or (select private.has_capability(workspace_id, 'foundry.review'))
)
with check (
  (select private.has_capability(workspace_id, 'foundry.manage'))
  or (select private.has_capability(workspace_id, 'foundry.review'))
);

create policy foundry_skill_scores_delete_manage
on public.foundry_skill_scores for delete
to authenticated
using ((select private.has_capability(workspace_id, 'foundry.manage')));

create policy foundry_sync_runs_select_manage
on public.foundry_sync_runs for select
to authenticated
using ((select private.has_capability(workspace_id, 'foundry.manage')));

create policy foundry_sync_runs_insert_manage
on public.foundry_sync_runs for insert
to authenticated
with check ((select private.has_capability(workspace_id, 'foundry.manage')));

create policy foundry_sync_runs_update_manage
on public.foundry_sync_runs for update
to authenticated
using ((select private.has_capability(workspace_id, 'foundry.manage')))
with check ((select private.has_capability(workspace_id, 'foundry.manage')));

revoke all on public.foundry_students from authenticated;
revoke all on public.foundry_classes from authenticated;
revoke all on public.foundry_attendance from authenticated;
revoke all on public.foundry_tasks from authenticated;
revoke all on public.foundry_task_assignments from authenticated;
revoke all on public.foundry_submissions from authenticated;
revoke all on public.foundry_progress_events from authenticated;
revoke all on public.foundry_skill_scores from authenticated;
revoke all on public.foundry_sync_runs from authenticated;

grant select, insert, update, delete on public.foundry_students to authenticated;
grant select, insert, update, delete on public.foundry_classes to authenticated;
grant select, insert, update, delete on public.foundry_attendance to authenticated;
grant select, insert, update, delete on public.foundry_tasks to authenticated;
grant select, insert, update, delete on public.foundry_task_assignments to authenticated;
grant select, insert, update, delete on public.foundry_submissions to authenticated;
grant select, insert, update, delete on public.foundry_progress_events to authenticated;
grant select, insert, update, delete on public.foundry_skill_scores to authenticated;
grant select, insert, update on public.foundry_sync_runs to authenticated;
