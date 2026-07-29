-- Close Foundry V1's final operating gaps without weakening the command and
-- RLS boundaries established by the backend-hardening migrations.
--
-- This migration adds:
--   * observable, real student daily checks
--   * explicit notification consent
--   * independently retryable external deliveries
--   * manual, evidence-backed Studio readiness review
--   * revocable and publicly verifiable certificates

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
      'class_cancelled',
      'studio_reviewed',
      'certificate_issued'
    )
  );

alter table public.foundry_notifications
  drop constraint if exists foundry_notifications_source_type_check;
alter table public.foundry_notifications
  add constraint foundry_notifications_source_type_check
  check (
    source_type in (
      'assignment',
      'submission',
      'class',
      'studio_review',
      'certificate'
    )
  );

create table public.foundry_daily_checks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  student_id uuid not null,
  check_date date not null default
    (timezone('Asia/Karachi', now()))::date,
  portal_opened_at timestamptz,
  task_opened_at timestamptz,
  submission_tested_at timestamptz,
  feedback_viewed_at timestamptz,
  attendance_recorded_at timestamptz,
  issue_code text check (
    issue_code is null
    or issue_code in (
      'login',
      'account_link',
      'task',
      'submission',
      'feedback',
      'attendance',
      'device',
      'other'
    )
  ),
  issue_note text check (
    issue_note is null or char_length(issue_note) <= 1000
  ),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint foundry_daily_checks_student_same_workspace
    foreign key (workspace_id, student_id)
    references public.foundry_students(workspace_id, id)
    on delete cascade,
  unique (workspace_id, student_id, check_date),
  unique (workspace_id, id)
);

create index foundry_daily_checks_workspace_date_idx
  on public.foundry_daily_checks(workspace_id, check_date desc, student_id);
create index foundry_daily_checks_open_issues_idx
  on public.foundry_daily_checks(workspace_id, check_date desc)
  where issue_code is not null and resolved_at is null;

create table public.foundry_delivery_preferences (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  student_id uuid not null,
  email_enabled boolean not null default false,
  whatsapp_enabled boolean not null default false,
  whatsapp_number text check (
    whatsapp_number is null or char_length(whatsapp_number) <= 40
  ),
  email_consented_at timestamptz,
  whatsapp_consented_at timestamptz,
  consent_note text check (
    consent_note is null or char_length(consent_note) <= 1000
  ),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint foundry_delivery_preferences_student_same_workspace
    foreign key (workspace_id, student_id)
    references public.foundry_students(workspace_id, id)
    on delete cascade,
  constraint foundry_email_consent_required
    check (not email_enabled or email_consented_at is not null),
  constraint foundry_whatsapp_consent_required
    check (
      not whatsapp_enabled
      or (
        whatsapp_consented_at is not null
        and nullif(btrim(whatsapp_number), '') is not null
      )
    ),
  unique (workspace_id, student_id),
  unique (workspace_id, id)
);

create index foundry_delivery_preferences_enabled_idx
  on public.foundry_delivery_preferences(workspace_id, student_id)
  where email_enabled or whatsapp_enabled;

create table public.foundry_studio_readiness_reviews (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  student_id uuid not null,
  request_id uuid not null,
  status text not null check (
    status in ('changes_required', 'approved', 'revoked')
  ),
  skill_quality smallint not null check (skill_quality between 1 and 5),
  deadline smallint not null check (deadline between 1 and 5),
  communication smallint not null check (communication between 1 and 5),
  revision_attitude smallint not null check (revision_attitude between 1 and 5),
  reliability smallint not null check (reliability between 1 and 5),
  confidentiality smallint not null check (confidentiality between 1 and 5),
  evidence_summary text not null
    check (char_length(evidence_summary) between 20 and 4000),
  decision_note text check (
    decision_note is null or char_length(decision_note) <= 2000
  ),
  reviewed_by uuid not null references auth.users(id) on delete restrict,
  reviewed_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint foundry_studio_review_student_same_workspace
    foreign key (workspace_id, student_id)
    references public.foundry_students(workspace_id, id)
    on delete cascade,
  unique (workspace_id, id),
  unique (reviewed_by, request_id)
);

create unique index foundry_studio_one_approved_idx
  on public.foundry_studio_readiness_reviews(workspace_id, student_id)
  where status = 'approved';
create index foundry_studio_student_reviewed_idx
  on public.foundry_studio_readiness_reviews(
    workspace_id,
    student_id,
    reviewed_at desc
  );

create table public.foundry_certificates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  student_id uuid not null,
  request_id uuid not null,
  certificate_number text not null unique
    check (certificate_number ~ '^UFC-[0-9]{4}-[A-Z0-9]{8}$'),
  verification_token uuid not null default gen_random_uuid() unique,
  certificate_type text not null check (
    certificate_type in (
      'track_completion',
      'foundry_completion',
      'studio_readiness'
    )
  ),
  title text not null check (char_length(title) between 3 and 180),
  statement text not null check (char_length(statement) between 20 and 1000),
  evidence_snapshot jsonb not null default '{}'::jsonb
    check (jsonb_typeof(evidence_snapshot) = 'object'),
  status text not null default 'issued'
    check (status in ('issued', 'revoked')),
  issued_by uuid not null references auth.users(id) on delete restrict,
  issued_at timestamptz not null default now(),
  revoked_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  revocation_reason text check (
    revocation_reason is null or char_length(revocation_reason) <= 1000
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint foundry_certificates_student_same_workspace
    foreign key (workspace_id, student_id)
    references public.foundry_students(workspace_id, id)
    on delete cascade,
  unique (workspace_id, id),
  unique (issued_by, request_id)
);

create unique index foundry_certificates_one_current_type_idx
  on public.foundry_certificates(workspace_id, student_id, certificate_type)
  where status = 'issued';
create index foundry_certificates_student_issued_idx
  on public.foundry_certificates(workspace_id, student_id, issued_at desc);

create table public.foundry_external_records (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  student_id uuid not null,
  provider text not null check (provider in ('airtable', 'notion')),
  remote_record_id text not null
    check (char_length(remote_record_id) between 1 and 200),
  remote_url text check (
    remote_url is null or char_length(remote_url) <= 1000
  ),
  last_payload_hash text check (
    last_payload_hash is null or char_length(last_payload_hash) <= 128
  ),
  last_synced_at timestamptz,
  last_error text check (
    last_error is null or char_length(last_error) <= 2000
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint foundry_external_records_student_same_workspace
    foreign key (workspace_id, student_id)
    references public.foundry_students(workspace_id, id)
    on delete cascade,
  unique (workspace_id, student_id, provider),
  unique (workspace_id, provider, remote_record_id),
  unique (workspace_id, id)
);

create index foundry_external_records_provider_sync_idx
  on public.foundry_external_records(
    workspace_id,
    provider,
    last_synced_at desc
  );

create table public.foundry_external_deliveries (
  id bigint generated always as identity primary key,
  event_id bigint not null references public.foundry_outbox_events(id)
    on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  student_id uuid not null,
  channel text not null check (
    channel in ('airtable', 'notion', 'email', 'whatsapp')
  ),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'succeeded', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  processed_at timestamptz,
  provider_message_id text check (
    provider_message_id is null
    or char_length(provider_message_id) <= 300
  ),
  last_error text check (
    last_error is null or char_length(last_error) <= 2000
  ),
  created_at timestamptz not null default now(),
  constraint foundry_external_deliveries_student_same_workspace
    foreign key (workspace_id, student_id)
    references public.foundry_students(workspace_id, id)
    on delete cascade,
  unique (event_id, channel, student_id)
);

create index foundry_external_deliveries_claim_idx
  on public.foundry_external_deliveries(available_at, id)
  where status in ('pending', 'failed');
create index foundry_external_deliveries_stale_idx
  on public.foundry_external_deliveries(locked_at, id)
  where status = 'processing';
create index foundry_external_deliveries_workspace_status_idx
  on public.foundry_external_deliveries(
    workspace_id,
    status,
    created_at desc
  );

alter table public.foundry_daily_checks enable row level security;
alter table public.foundry_delivery_preferences enable row level security;
alter table public.foundry_studio_readiness_reviews enable row level security;
alter table public.foundry_certificates enable row level security;
alter table public.foundry_external_records enable row level security;
alter table public.foundry_external_deliveries enable row level security;

create policy foundry_daily_checks_select_authorised
on public.foundry_daily_checks for select
to authenticated
using (
  (select private.has_capability(workspace_id, 'foundry.manage'))
  or (select private.has_capability(workspace_id, 'foundry.review'))
  or (
    (select private.has_capability(workspace_id, 'foundry.learn'))
    and (select private.is_foundry_student(workspace_id, student_id))
  )
);

create policy foundry_delivery_preferences_select_authorised
on public.foundry_delivery_preferences for select
to authenticated
using (
  (select private.has_capability(workspace_id, 'foundry.manage'))
  or (
    (select private.has_capability(workspace_id, 'foundry.learn'))
    and (select private.is_foundry_student(workspace_id, student_id))
  )
);

create policy foundry_studio_reviews_select_authorised
on public.foundry_studio_readiness_reviews for select
to authenticated
using (
  (select private.has_capability(workspace_id, 'foundry.manage'))
  or (select private.has_capability(workspace_id, 'foundry.review'))
  or (
    (select private.has_capability(workspace_id, 'foundry.learn'))
    and (select private.is_foundry_student(workspace_id, student_id))
  )
);

create policy foundry_certificates_select_authorised
on public.foundry_certificates for select
to authenticated
using (
  (select private.has_capability(workspace_id, 'foundry.manage'))
  or (select private.has_capability(workspace_id, 'foundry.review'))
  or (
    (select private.has_capability(workspace_id, 'foundry.learn'))
    and (select private.is_foundry_student(workspace_id, student_id))
  )
);

create policy foundry_external_records_select_manage
on public.foundry_external_records for select
to authenticated
using ((select private.has_capability(workspace_id, 'foundry.manage')));

create policy foundry_external_deliveries_select_manage
on public.foundry_external_deliveries for select
to authenticated
using ((select private.has_capability(workspace_id, 'foundry.manage')));

revoke all on public.foundry_daily_checks
  from public, anon, authenticated;
revoke all on public.foundry_delivery_preferences
  from public, anon, authenticated;
revoke all on public.foundry_studio_readiness_reviews
  from public, anon, authenticated;
revoke all on public.foundry_certificates
  from public, anon, authenticated;
revoke all on public.foundry_external_records
  from public, anon, authenticated;
revoke all on public.foundry_external_deliveries
  from public, anon, authenticated;

grant select on
  public.foundry_daily_checks,
  public.foundry_delivery_preferences,
  public.foundry_studio_readiness_reviews,
  public.foundry_certificates,
  public.foundry_external_records,
  public.foundry_external_deliveries
to authenticated;

grant select, insert, update, delete on
  public.foundry_daily_checks,
  public.foundry_delivery_preferences,
  public.foundry_studio_readiness_reviews,
  public.foundry_certificates,
  public.foundry_external_records,
  public.foundry_external_deliveries
to service_role;
grant usage, select on sequence
  public.foundry_external_deliveries_id_seq
to service_role;

create trigger foundry_daily_checks_set_updated_at
  before update on public.foundry_daily_checks
  for each row execute function private.set_updated_at();
create trigger foundry_delivery_preferences_set_updated_at
  before update on public.foundry_delivery_preferences
  for each row execute function private.set_updated_at();
create trigger foundry_studio_reviews_set_updated_at
  before update on public.foundry_studio_readiness_reviews
  for each row execute function private.set_updated_at();
create trigger foundry_certificates_set_updated_at
  before update on public.foundry_certificates
  for each row execute function private.set_updated_at();
create trigger foundry_external_records_set_updated_at
  before update on public.foundry_external_records
  for each row execute function private.set_updated_at();

create trigger foundry_delivery_preferences_capture_audit
  after insert or update or delete on public.foundry_delivery_preferences
  for each row execute function private.capture_audit_event();
create trigger foundry_studio_reviews_capture_audit
  after insert or update or delete on public.foundry_studio_readiness_reviews
  for each row execute function private.capture_audit_event();
create trigger foundry_certificates_capture_audit
  after insert or update or delete on public.foundry_certificates
  for each row execute function private.capture_audit_event();

create or replace function private.ensure_foundry_delivery_preferences()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.foundry_delivery_preferences (
    workspace_id,
    student_id
  )
  values (
    new.workspace_id,
    new.id
  )
  on conflict (workspace_id, student_id) do nothing;

  return new;
end;
$$;

revoke all on function private.ensure_foundry_delivery_preferences()
  from public, anon, authenticated;

insert into public.foundry_delivery_preferences (
  workspace_id,
  student_id
)
select student.workspace_id, student.id
from public.foundry_students student
on conflict (workspace_id, student_id) do nothing;

create trigger foundry_students_ensure_delivery_preferences
  after insert on public.foundry_students
  for each row execute function private.ensure_foundry_delivery_preferences();

-- Studio Ready is now a deliberate Founder decision against the six standards
-- in the student guide. Skill scores remain evidence but cannot promote a
-- student automatically.
drop trigger if exists foundry_skill_scores_recalculate
  on public.foundry_skill_scores;

create or replace function public.record_foundry_daily_checkpoint(
  checkpoint text
)
returns date
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  current_user_id uuid := (select auth.uid());
  target_workspace_id uuid;
  target_student_id uuid;
  target_date date := (timezone('Asia/Karachi', now()))::date;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if checkpoint not in ('portal_opened', 'task_opened', 'feedback_viewed') then
    raise exception 'Unsupported daily checkpoint' using errcode = '22023';
  end if;

  select student.workspace_id, student.id
  into target_workspace_id, target_student_id
  from public.foundry_students student
  where student.auth_user_id = current_user_id
    and student.lifecycle_status not in ('inactive', 'graduated', 'rejected')
  order by student.updated_at desc
  limit 1;

  if target_student_id is null
    or not (
      select private.has_capability(
        target_workspace_id,
        'foundry.learn'
      )
    )
  then
    raise exception 'Active Foundry student access required'
      using errcode = '42501';
  end if;

  insert into public.foundry_daily_checks (
    workspace_id,
    student_id,
    check_date,
    portal_opened_at,
    task_opened_at,
    feedback_viewed_at
  )
  values (
    target_workspace_id,
    target_student_id,
    target_date,
    case when checkpoint = 'portal_opened' then now() end,
    case when checkpoint = 'task_opened' then now() end,
    case when checkpoint = 'feedback_viewed' then now() end
  )
  on conflict (workspace_id, student_id, check_date)
  do update
  set portal_opened_at = case
        when checkpoint = 'portal_opened'
          then coalesce(
            public.foundry_daily_checks.portal_opened_at,
            now()
          )
        else public.foundry_daily_checks.portal_opened_at
      end,
      task_opened_at = case
        when checkpoint = 'task_opened'
          then coalesce(
            public.foundry_daily_checks.task_opened_at,
            now()
          )
        else public.foundry_daily_checks.task_opened_at
      end,
      feedback_viewed_at = case
        when checkpoint = 'feedback_viewed'
          then coalesce(
            public.foundry_daily_checks.feedback_viewed_at,
            now()
          )
        else public.foundry_daily_checks.feedback_viewed_at
      end;

  return target_date;
end;
$$;

revoke all on function public.record_foundry_daily_checkpoint(text)
  from public, anon, authenticated;
grant execute on function public.record_foundry_daily_checkpoint(text)
  to authenticated;

create or replace function private.record_foundry_submission_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.foundry_daily_checks (
    workspace_id,
    student_id,
    check_date,
    submission_tested_at
  )
  values (
    new.workspace_id,
    new.student_id,
    (timezone('Asia/Karachi', new.submitted_at))::date,
    new.submitted_at
  )
  on conflict (workspace_id, student_id, check_date)
  do update
  set submission_tested_at = coalesce(
    public.foundry_daily_checks.submission_tested_at,
    excluded.submission_tested_at
  );

  return new;
end;
$$;

create or replace function private.record_foundry_attendance_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.foundry_daily_checks (
    workspace_id,
    student_id,
    check_date,
    attendance_recorded_at
  )
  values (
    new.workspace_id,
    new.student_id,
    (timezone('Asia/Karachi', new.marked_at))::date,
    new.marked_at
  )
  on conflict (workspace_id, student_id, check_date)
  do update
  set attendance_recorded_at = greatest(
    coalesce(
      public.foundry_daily_checks.attendance_recorded_at,
      '-infinity'::timestamptz
    ),
    excluded.attendance_recorded_at
  );

  return new;
end;
$$;

revoke all on function private.record_foundry_submission_check()
  from public, anon, authenticated;
revoke all on function private.record_foundry_attendance_check()
  from public, anon, authenticated;

create trigger foundry_submissions_record_daily_check
  after insert on public.foundry_submissions
  for each row execute function private.record_foundry_submission_check();
create trigger foundry_attendance_record_daily_check
  after insert or update of status, marked_at on public.foundry_attendance
  for each row execute function private.record_foundry_attendance_check();

create or replace function public.record_foundry_daily_issue(
  target_workspace_id uuid,
  target_student_id uuid,
  target_date date,
  target_issue_code text,
  target_issue_note text,
  mark_resolved boolean default false
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  result_id uuid;
begin
  if not (
    select private.has_capability(
      target_workspace_id,
      'foundry.manage'
    )
  )
  then
    raise exception 'Foundry management access required'
      using errcode = '42501';
  end if;

  if target_issue_code not in (
    'login',
    'account_link',
    'task',
    'submission',
    'feedback',
    'attendance',
    'device',
    'other'
  )
  then
    raise exception 'Unsupported issue code' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.foundry_students student
    where student.workspace_id = target_workspace_id
      and student.id = target_student_id
  )
  then
    raise exception 'Student not found' using errcode = 'P0002';
  end if;

  insert into public.foundry_daily_checks (
    workspace_id,
    student_id,
    check_date,
    issue_code,
    issue_note,
    resolved_at
  )
  values (
    target_workspace_id,
    target_student_id,
    target_date,
    target_issue_code,
    nullif(btrim(target_issue_note), ''),
    case when mark_resolved then now() end
  )
  on conflict (workspace_id, student_id, check_date)
  do update
  set issue_code = excluded.issue_code,
      issue_note = excluded.issue_note,
      resolved_at = excluded.resolved_at
  returning id into result_id;

  return result_id;
end;
$$;

revoke all on function public.record_foundry_daily_issue(
  uuid,
  uuid,
  date,
  text,
  text,
  boolean
)
from public, anon, authenticated;
grant execute on function public.record_foundry_daily_issue(
  uuid,
  uuid,
  date,
  text,
  text,
  boolean
)
to authenticated;

create or replace function public.update_foundry_delivery_preferences(
  target_workspace_id uuid,
  target_student_id uuid,
  enable_email boolean,
  enable_whatsapp boolean,
  target_whatsapp_number text,
  target_consent_note text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  current_user_id uuid := (select auth.uid());
  target_email text;
  result_id uuid;
begin
  if current_user_id is null
    or not (
      select private.has_capability(
        target_workspace_id,
        'foundry.manage'
      )
    )
  then
    raise exception 'Foundry management access required'
      using errcode = '42501';
  end if;

  select student.email
  into target_email
  from public.foundry_students student
  where student.workspace_id = target_workspace_id
    and student.id = target_student_id;

  if not found then
    raise exception 'Student not found' using errcode = 'P0002';
  end if;
  if enable_email and nullif(btrim(target_email), '') is null then
    raise exception 'Student email is required for email delivery'
      using errcode = '23514';
  end if;
  if enable_whatsapp
    and nullif(btrim(target_whatsapp_number), '') is null
  then
    raise exception 'WhatsApp number is required'
      using errcode = '23514';
  end if;

  insert into public.foundry_delivery_preferences (
    workspace_id,
    student_id,
    email_enabled,
    whatsapp_enabled,
    whatsapp_number,
    email_consented_at,
    whatsapp_consented_at,
    consent_note,
    updated_by
  )
  values (
    target_workspace_id,
    target_student_id,
    enable_email,
    enable_whatsapp,
    nullif(btrim(target_whatsapp_number), ''),
    case when enable_email then now() end,
    case when enable_whatsapp then now() end,
    nullif(btrim(target_consent_note), ''),
    current_user_id
  )
  on conflict (workspace_id, student_id)
  do update
  set email_enabled = excluded.email_enabled,
      whatsapp_enabled = excluded.whatsapp_enabled,
      whatsapp_number = excluded.whatsapp_number,
      email_consented_at = case
        when excluded.email_enabled then coalesce(
          public.foundry_delivery_preferences.email_consented_at,
          excluded.email_consented_at
        )
      end,
      whatsapp_consented_at = case
        when excluded.whatsapp_enabled then coalesce(
          public.foundry_delivery_preferences.whatsapp_consented_at,
          excluded.whatsapp_consented_at
        )
      end,
      consent_note = excluded.consent_note,
      updated_by = excluded.updated_by
  returning id into result_id;

  return result_id;
end;
$$;

revoke all on function public.update_foundry_delivery_preferences(
  uuid,
  uuid,
  boolean,
  boolean,
  text,
  text
)
from public, anon, authenticated;
grant execute on function public.update_foundry_delivery_preferences(
  uuid,
  uuid,
  boolean,
  boolean,
  text,
  text
)
to authenticated;

create or replace function public.review_foundry_studio_readiness(
  target_workspace_id uuid,
  target_student_id uuid,
  command_request_id uuid,
  decision text,
  score_skill_quality smallint,
  score_deadline smallint,
  score_communication smallint,
  score_revision_attitude smallint,
  score_reliability smallint,
  score_confidentiality smallint,
  target_evidence_summary text,
  target_decision_note text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  current_user_id uuid := (select auth.uid());
  review_id uuid := gen_random_uuid();
  existing_review_id uuid;
  score_average numeric;
begin
  if current_user_id is null
    or not (
      select private.has_capability(
        target_workspace_id,
        'foundry.manage'
      )
    )
  then
    raise exception 'Foundry management access required'
      using errcode = '42501';
  end if;

  if decision not in ('changes_required', 'approved', 'revoked') then
    raise exception 'Unsupported Studio review decision'
      using errcode = '22023';
  end if;
  if char_length(btrim(target_evidence_summary)) < 20 then
    raise exception 'Studio review needs evidence'
      using errcode = '23514';
  end if;
  if not exists (
    select 1
    from public.foundry_students student
    where student.workspace_id = target_workspace_id
      and student.id = target_student_id
  )
  then
    raise exception 'Student not found' using errcode = 'P0002';
  end if;

  select review.id
  into existing_review_id
  from public.foundry_studio_readiness_reviews review
  where review.reviewed_by = current_user_id
    and review.request_id = command_request_id;

  if existing_review_id is not null then
    return existing_review_id;
  end if;

  score_average := (
    score_skill_quality
    + score_deadline
    + score_communication
    + score_revision_attitude
    + score_reliability
    + score_confidentiality
  ) / 6.0;

  if decision = 'approved'
    and (
      least(
        score_skill_quality,
        score_deadline,
        score_communication,
        score_revision_attitude,
        score_reliability,
        score_confidentiality
      ) < 3
      or score_average < 4
    )
  then
    raise exception
      'Approval requires every standard >= 3 and average >= 4'
      using errcode = '23514';
  end if;

  update public.foundry_studio_readiness_reviews review
  set status = 'revoked',
      revoked_at = now(),
      decision_note = coalesce(
        nullif(btrim(target_decision_note), ''),
        review.decision_note
      )
  where review.workspace_id = target_workspace_id
    and review.student_id = target_student_id
    and review.status = 'approved';

  insert into public.foundry_studio_readiness_reviews (
    id,
    workspace_id,
    student_id,
    request_id,
    status,
    skill_quality,
    deadline,
    communication,
    revision_attitude,
    reliability,
    confidentiality,
    evidence_summary,
    decision_note,
    reviewed_by,
    revoked_at
  )
  values (
    review_id,
    target_workspace_id,
    target_student_id,
    command_request_id,
    decision,
    score_skill_quality,
    score_deadline,
    score_communication,
    score_revision_attitude,
    score_reliability,
    score_confidentiality,
    btrim(target_evidence_summary),
    nullif(btrim(target_decision_note), ''),
    current_user_id,
    case when decision = 'revoked' then now() end
  );

  update public.foundry_students student
  set studio_eligible = decision = 'approved',
      health_status = case
        when decision = 'approved' then 'gold'
        when student.health_status = 'gold' then 'green'
        else student.health_status
      end,
      next_action = case
        when decision = 'approved'
          then 'Founder se supervised Studio project brief ka intezar karein.'
        when decision = 'changes_required'
          then 'Studio review note ke mutabiq evidence improve karein.'
        else 'Studio readiness dobara review hogi.'
      end
  where student.workspace_id = target_workspace_id
    and student.id = target_student_id;

  if decision = 'approved' then
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
      'Studio Ready · Founder approved',
      'Six standards were reviewed with evidence. Studio work remains supervised and is not automatic.',
      25,
      'manual',
      review_id,
      now(),
      current_user_id
    )
    on conflict do nothing;
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
  values (
    target_workspace_id,
    target_student_id,
    'studio_reviewed',
    case
      when decision = 'approved' then 'Studio Ready approved'
      when decision = 'changes_required' then 'Studio review update'
      else 'Studio readiness revoked'
    end,
    case
      when decision = 'approved'
        then 'Six standards pass ho gaye. Supervised Studio work Founder approval se milega.'
      when decision = 'changes_required'
        then 'Review note dekhein aur required evidence improve karein.'
      else 'Studio status pause ho gaya. Founder se next review step confirm karein.'
    end,
    'studio_review',
    review_id
  )
  on conflict do nothing;

  return review_id;
end;
$$;

revoke all on function public.review_foundry_studio_readiness(
  uuid,
  uuid,
  uuid,
  text,
  smallint,
  smallint,
  smallint,
  smallint,
  smallint,
  smallint,
  text,
  text
)
from public, anon, authenticated;
grant execute on function public.review_foundry_studio_readiness(
  uuid,
  uuid,
  uuid,
  text,
  smallint,
  smallint,
  smallint,
  smallint,
  smallint,
  smallint,
  text,
  text
)
to authenticated;

create or replace function public.issue_foundry_certificate(
  target_workspace_id uuid,
  target_student_id uuid,
  command_request_id uuid,
  target_certificate_type text,
  target_title text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  current_user_id uuid := (select auth.uid());
  certificate_id uuid := gen_random_uuid();
  existing_certificate_id uuid;
  target_number text;
  target_statement text;
  student_record public.foundry_students%rowtype;
  accepted_count integer;
  approved_review_id uuid;
begin
  if current_user_id is null
    or not (
      select private.has_capability(
        target_workspace_id,
        'foundry.manage'
      )
    )
  then
    raise exception 'Foundry management access required'
      using errcode = '42501';
  end if;

  if target_certificate_type not in (
    'track_completion',
    'foundry_completion',
    'studio_readiness'
  )
  then
    raise exception 'Unsupported certificate type'
      using errcode = '22023';
  end if;

  select student.*
  into student_record
  from public.foundry_students student
  where student.workspace_id = target_workspace_id
    and student.id = target_student_id;

  if not found then
    raise exception 'Student not found' using errcode = 'P0002';
  end if;

  select certificate.id
  into existing_certificate_id
  from public.foundry_certificates certificate
  where certificate.issued_by = current_user_id
    and certificate.request_id = command_request_id;

  if existing_certificate_id is not null then
    return existing_certificate_id;
  end if;

  if exists (
    select 1
    from public.foundry_certificates certificate
    where certificate.workspace_id = target_workspace_id
      and certificate.student_id = target_student_id
      and certificate.certificate_type = target_certificate_type
      and certificate.status = 'issued'
  )
  then
    raise exception 'This student already has an active certificate of this type'
      using errcode = '23505';
  end if;

  select count(*)
  into accepted_count
  from public.foundry_submissions submission
  where submission.workspace_id = target_workspace_id
    and submission.student_id = target_student_id
    and submission.status = 'accepted';

  select review.id
  into approved_review_id
  from public.foundry_studio_readiness_reviews review
  where review.workspace_id = target_workspace_id
    and review.student_id = target_student_id
    and review.status = 'approved'
  order by review.reviewed_at desc
  limit 1;

  if target_certificate_type = 'track_completion'
    and (
      student_record.progress_percent < 60
      or accepted_count < 1
    )
  then
    raise exception 'Track certificate needs 60 percent progress and accepted evidence'
      using errcode = '23514';
  end if;
  if target_certificate_type = 'foundry_completion'
    and (
      student_record.progress_percent < 80
      or accepted_count < 2
    )
  then
    raise exception 'Foundry completion needs 80 percent progress and two accepted submissions'
      using errcode = '23514';
  end if;
  if target_certificate_type = 'studio_readiness'
    and (
      not student_record.studio_eligible
      or approved_review_id is null
    )
  then
    raise exception 'Studio certificate needs a current approved readiness review'
      using errcode = '23514';
  end if;

  target_number := 'UFC-'
    || to_char(now(), 'YYYY')
    || '-'
    || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  target_statement := case target_certificate_type
    when 'track_completion'
      then 'Verified completion evidence for the student''s Urava Foundry learning track.'
    when 'foundry_completion'
      then 'Verified completion evidence for the Urava Foundry training journey.'
    else 'Founder-verified readiness against Skill Quality, Deadline, Communication, Revision Attitude, Reliability, and Confidentiality standards.'
  end;

  insert into public.foundry_certificates (
    id,
    workspace_id,
    student_id,
    request_id,
    certificate_number,
    certificate_type,
    title,
    statement,
    evidence_snapshot,
    issued_by
  )
  values (
    certificate_id,
    target_workspace_id,
    target_student_id,
    command_request_id,
    target_number,
    target_certificate_type,
    btrim(target_title),
    target_statement,
    jsonb_build_object(
      'foundry_id',
      student_record.foundry_id,
      'department',
      student_record.department,
      'progress_percent',
      student_record.progress_percent,
      'accepted_submissions',
      accepted_count,
      'studio_review_id',
      approved_review_id,
      'issued_at',
      now()
    ),
    current_user_id
  );

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
    target_workspace_id,
    target_student_id,
    'certificate_issued',
    'Certificate issued · ' || left(btrim(target_title), 150),
    'Aap ka verified certificate Progress tab mein available hai. Certificate job ya income guarantee nahi karta.',
    'certificate',
    certificate_id
  )
  on conflict do nothing;

  return certificate_id;
end;
$$;

revoke all on function public.issue_foundry_certificate(
  uuid,
  uuid,
  uuid,
  text,
  text
)
from public, anon, authenticated;
grant execute on function public.issue_foundry_certificate(
  uuid,
  uuid,
  uuid,
  text,
  text
)
to authenticated;

create or replace function public.revoke_foundry_certificate(
  target_workspace_id uuid,
  target_certificate_id uuid,
  target_reason text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  current_user_id uuid := (select auth.uid());
  result_id uuid;
begin
  if current_user_id is null
    or not (
      select private.has_capability(
        target_workspace_id,
        'foundry.manage'
      )
    )
  then
    raise exception 'Foundry management access required'
      using errcode = '42501';
  end if;
  if char_length(btrim(target_reason)) < 5 then
    raise exception 'Revocation reason is required'
      using errcode = '23514';
  end if;

  update public.foundry_certificates certificate
  set status = 'revoked',
      revoked_by = current_user_id,
      revoked_at = now(),
      revocation_reason = btrim(target_reason)
  where certificate.workspace_id = target_workspace_id
    and certificate.id = target_certificate_id
    and certificate.status = 'issued'
  returning certificate.id into result_id;

  if result_id is null then
    raise exception 'Active certificate not found'
      using errcode = 'P0002';
  end if;

  return result_id;
end;
$$;

revoke all on function public.revoke_foundry_certificate(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.revoke_foundry_certificate(uuid, uuid, text)
  to authenticated;

create or replace function public.verify_foundry_certificate(
  target_verification_token uuid
)
returns table (
  certificate_number text,
  student_name text,
  foundry_id text,
  certificate_type text,
  title text,
  statement text,
  issued_at timestamptz,
  status text,
  revoked_at timestamptz
)
language sql
stable
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
  select
    certificate.certificate_number,
    student.full_name,
    student.foundry_id,
    certificate.certificate_type,
    certificate.title,
    certificate.statement,
    certificate.issued_at,
    certificate.status,
    certificate.revoked_at
  from public.foundry_certificates certificate
  join public.foundry_students student
    on student.workspace_id = certificate.workspace_id
   and student.id = certificate.student_id
  where certificate.verification_token = target_verification_token
  limit 1;
$$;

revoke all on function public.verify_foundry_certificate(uuid)
  from public, anon, authenticated;
grant execute on function public.verify_foundry_certificate(uuid)
  to anon, authenticated;

create or replace function public.queue_foundry_full_sync(
  target_workspace_id uuid
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  queued_count integer;
begin
  if not (
    select private.has_capability(
      target_workspace_id,
      'foundry.manage'
    )
  )
  then
    raise exception 'Foundry management access required'
      using errcode = '42501';
  end if;

  insert into public.foundry_outbox_events (
    workspace_id,
    topic,
    aggregate_type,
    aggregate_id,
    operation,
    actor_id,
    payload
  )
  select
    student.workspace_id,
    'foundry.student.sync_requested',
    'foundry_students',
    student.id,
    'update',
    (select auth.uid()),
    jsonb_build_object(
      'record_id',
      student.id,
      'occurred_at',
      now()
    )
  from public.foundry_students student
  where student.workspace_id = target_workspace_id
    and not exists (
      select 1
      from public.foundry_outbox_events event
      where event.workspace_id = student.workspace_id
        and event.aggregate_type = 'foundry_students'
        and event.aggregate_id = student.id
        and event.status in ('pending', 'processing')
    );

  get diagnostics queued_count = row_count;
  return queued_count;
end;
$$;

revoke all on function public.queue_foundry_full_sync(uuid)
  from public, anon, authenticated;
grant execute on function public.queue_foundry_full_sync(uuid)
  to authenticated;

create or replace function public.claim_foundry_external_deliveries(
  requested_batch_size integer default 25
)
returns setof public.foundry_external_deliveries
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '10s'
as $$
begin
  return query
  with candidates as materialized (
    select delivery.id
    from public.foundry_external_deliveries delivery
    where (
        delivery.status in ('pending', 'failed')
        and delivery.available_at <= now()
      )
      or (
        delivery.status = 'processing'
        and delivery.locked_at < now() - interval '15 minutes'
      )
    order by
      case delivery.channel
        when 'airtable' then 1
        when 'notion' then 2
        when 'email' then 3
        else 4
      end,
      delivery.available_at,
      delivery.id
    for update skip locked
    limit least(greatest(coalesce(requested_batch_size, 25), 1), 100)
  )
  update public.foundry_external_deliveries delivery
  set status = 'processing',
      attempt_count = delivery.attempt_count + 1,
      locked_at = now(),
      processed_at = null,
      last_error = null
  from candidates
  where delivery.id = candidates.id
  returning delivery.*;
end;
$$;

create or replace function public.complete_foundry_external_delivery(
  target_delivery_id bigint,
  was_successful boolean,
  target_provider_message_id text default null,
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
  update public.foundry_external_deliveries delivery
  set status = case when was_successful then 'succeeded' else 'failed' end,
      available_at = case
        when was_successful then delivery.available_at
        else now() + make_interval(
          secs => least(
            21600,
            30 * power(
              2::numeric,
              least(delivery.attempt_count, 10)
            )::integer
          )
        )
      end,
      locked_at = null,
      processed_at = case when was_successful then now() end,
      provider_message_id = case
        when was_successful
          then left(nullif(btrim(target_provider_message_id), ''), 300)
        else delivery.provider_message_id
      end,
      last_error = case
        when was_successful then null
        else left(
          coalesce(
            nullif(btrim(error_message), ''),
            'External delivery failed'
          ),
          2000
        )
      end
  where delivery.id = target_delivery_id
    and delivery.status = 'processing'
  returning delivery.status into resulting_status;

  if resulting_status is null then
    raise exception 'External delivery is not currently processing'
      using errcode = 'P0002';
  end if;

  return resulting_status;
end;
$$;

revoke all on function public.claim_foundry_external_deliveries(integer)
  from public, anon, authenticated;
revoke all on function public.complete_foundry_external_delivery(
  bigint,
  boolean,
  text,
  text
)
from public, anon, authenticated;
grant execute on function public.claim_foundry_external_deliveries(integer)
  to service_role;
grant execute on function public.complete_foundry_external_delivery(
  bigint,
  boolean,
  text,
  text
)
to service_role;

create or replace function private.enqueue_foundry_notification_outbox()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
    and new.kind is not distinct from old.kind
    and new.title is not distinct from old.title
    and new.body is not distinct from old.body
    and new.source_type is not distinct from old.source_type
    and new.source_id is not distinct from old.source_id
  then
    return new;
  end if;

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
    new.workspace_id,
    'foundry.foundry_notifications.' || lower(tg_op),
    'foundry_notifications',
    new.id,
    lower(tg_op),
    (select auth.uid()),
    jsonb_build_object(
      'record_id',
      new.id,
      'occurred_at',
      now()
    )
  );

  return new;
end;
$$;

revoke all on function private.enqueue_foundry_notification_outbox()
  from public, anon, authenticated;

create trigger foundry_notifications_enqueue_outbox
  after insert or update on public.foundry_notifications
  for each row execute function private.enqueue_foundry_notification_outbox();
create trigger foundry_delivery_preferences_enqueue_outbox
  after insert or update on public.foundry_delivery_preferences
  for each row execute function private.enqueue_foundry_outbox_event();
create trigger foundry_studio_reviews_enqueue_outbox
  after insert or update on public.foundry_studio_readiness_reviews
  for each row execute function private.enqueue_foundry_outbox_event();
create trigger foundry_certificates_enqueue_outbox
  after insert or update on public.foundry_certificates
  for each row execute function private.enqueue_foundry_outbox_event();

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  )
  and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'foundry_daily_checks'
  )
  then
    alter publication supabase_realtime
      add table public.foundry_daily_checks;
  end if;
end;
$$;
