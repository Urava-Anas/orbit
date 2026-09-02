-- Foundry M1 — Orbit-native lifecycle parity
--
-- Rebuilds the tested Application -> Review -> Accept/Invite -> Enrolment
-- semantics inside Orbit's existing workspace/capability model.
--
-- Important migration boundary:
-- - This migration creates lifecycle schema and behavior only.
-- - It does NOT copy rows from the separate Urava Supabase project.
-- - Cross-project auth.users UUIDs must never be imported blindly.
-- - Legacy Urava foundry_students triggers are intentionally NOT reproduced;
--   Orbit already owns a different, workspace-scoped foundry_students model.

create table public.foundry_applications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete set null,
  foundry_student_id uuid,
  external_source text not null default 'manual'
    check (external_source in ('manual', 'airtable', 'notion', 'urava_migration')),
  external_record_id text,
  full_name text not null check (char_length(trim(full_name)) between 2 and 120),
  email text check (email is null or char_length(trim(email)) between 3 and 254),
  status text not null default 'new'
    check (status in ('new', 'reviewing', 'shortlisted', 'accepted', 'waitlisted', 'rejected')),
  preferred_course text check (
    preferred_course is null
    or preferred_course in (
      'creative_ui_design',
      'web_development',
      'app_building',
      'ai_automation',
      'sales_calling',
      'content_media',
      'operations_support'
    )
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
  course_label text check (course_label is null or char_length(course_label) <= 120),
  batch_label text check (batch_label is null or char_length(batch_label) <= 80),
  next_action text check (next_action is null or char_length(next_action) <= 500),
  validation_state text not null default 'unverified'
    check (validation_state in ('unverified', 'self_confirmed', 'evidence_verified', 'rejected')),
  source_evidence text check (source_evidence is null or char_length(source_evidence) <= 4000),
  source_last_seen_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  constraint foundry_applications_student_same_workspace
    foreign key (workspace_id, foundry_student_id)
    references public.foundry_students(workspace_id, id)
    on delete restrict
);

create unique index foundry_applications_external_record_unique_idx
  on public.foundry_applications(workspace_id, external_source, external_record_id)
  where external_record_id is not null;
create index foundry_applications_workspace_status_idx
  on public.foundry_applications(workspace_id, status, updated_at desc);
create index foundry_applications_auth_user_idx
  on public.foundry_applications(auth_user_id)
  where auth_user_id is not null;
create index foundry_applications_student_idx
  on public.foundry_applications(foundry_student_id)
  where foundry_student_id is not null;

create table public.foundry_application_reviews (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  application_id uuid not null,
  reviewer_user_id uuid references auth.users(id) on delete set null,
  outcome text not null
    check (outcome in ('reviewing', 'shortlisted', 'accepted', 'waitlisted', 'rejected')),
  notes text check (notes is null or char_length(notes) <= 4000),
  evidence text check (evidence is null or char_length(evidence) <= 4000),
  validation_state text not null default 'unverified'
    check (validation_state in ('unverified', 'self_confirmed', 'evidence_verified', 'rejected')),
  is_historical boolean not null default false,
  created_at timestamptz not null default now(),
  unique (workspace_id, id),
  constraint foundry_application_reviews_application_same_workspace
    foreign key (workspace_id, application_id)
    references public.foundry_applications(workspace_id, id)
    on delete cascade
);

create index foundry_application_reviews_application_created_idx
  on public.foundry_application_reviews(workspace_id, application_id, created_at desc);
create index foundry_application_reviews_reviewer_idx
  on public.foundry_application_reviews(reviewer_user_id)
  where reviewer_user_id is not null;

create table public.foundry_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  application_id uuid not null,
  review_id uuid not null,
  recipient_email text not null check (char_length(trim(recipient_email)) between 3 and 254),
  recipient_user_id uuid references auth.users(id) on delete set null,
  token_hash text unique check (token_hash is null or token_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'prepared'
    check (status in ('prepared', 'sent', 'accepted', 'expired', 'revoked')),
  source text not null default 'system',
  evidence text check (evidence is null or char_length(evidence) <= 4000),
  prepared_at timestamptz not null default now(),
  sent_at timestamptz,
  accepted_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  constraint foundry_invitations_application_same_workspace
    foreign key (workspace_id, application_id)
    references public.foundry_applications(workspace_id, id)
    on delete cascade,
  constraint foundry_invitations_review_same_workspace
    foreign key (workspace_id, review_id)
    references public.foundry_application_reviews(workspace_id, id)
    on delete restrict,
  constraint foundry_invitations_accepted_shape
    check (
      status <> 'accepted'
      or (recipient_user_id is not null and accepted_at is not null)
    )
);

create unique index foundry_invitations_one_open_per_application_idx
  on public.foundry_invitations(workspace_id, application_id)
  where status in ('prepared', 'sent');
create index foundry_invitations_application_created_idx
  on public.foundry_invitations(workspace_id, application_id, created_at desc);
create index foundry_invitations_review_idx
  on public.foundry_invitations(workspace_id, review_id);
create index foundry_invitations_recipient_user_idx
  on public.foundry_invitations(recipient_user_id)
  where recipient_user_id is not null;

create table public.foundry_enrolments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  application_id uuid not null,
  auth_user_id uuid not null references auth.users(id) on delete restrict,
  foundry_student_id uuid not null,
  invitation_id uuid not null,
  review_id uuid not null,
  status text not null default 'active'
    check (status in ('active', 'paused', 'completed', 'withdrawn')),
  validation_state text not null default 'unverified'
    check (validation_state in ('unverified', 'self_confirmed', 'evidence_verified', 'rejected')),
  evidence text check (evidence is null or char_length(evidence) <= 4000),
  enrolled_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  unique (workspace_id, application_id),
  unique (workspace_id, invitation_id),
  constraint foundry_enrolments_application_same_workspace
    foreign key (workspace_id, application_id)
    references public.foundry_applications(workspace_id, id)
    on delete restrict,
  constraint foundry_enrolments_invitation_same_workspace
    foreign key (workspace_id, invitation_id)
    references public.foundry_invitations(workspace_id, id)
    on delete restrict,
  constraint foundry_enrolments_review_same_workspace
    foreign key (workspace_id, review_id)
    references public.foundry_application_reviews(workspace_id, id)
    on delete restrict,
  constraint foundry_enrolments_student_same_workspace
    foreign key (workspace_id, foundry_student_id)
    references public.foundry_students(workspace_id, id)
    on delete restrict
);

create unique index foundry_enrolments_one_active_user_idx
  on public.foundry_enrolments(workspace_id, auth_user_id)
  where status = 'active';
create index foundry_enrolments_student_idx
  on public.foundry_enrolments(workspace_id, foundry_student_id);
create index foundry_enrolments_review_idx
  on public.foundry_enrolments(workspace_id, review_id);

create table public.foundry_lifecycle_events (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  application_id uuid not null,
  review_id uuid,
  invitation_id uuid,
  enrolment_id uuid,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null
    check (
      event_type in (
        'application_reviewed',
        'application_accepted',
        'invitation_prepared',
        'invitation_sent',
        'invitation_accepted',
        'enrolled',
        'invitation_expired',
        'invitation_revoked'
      )
    ),
  validation_state text not null default 'unverified'
    check (validation_state in ('unverified', 'self_confirmed', 'evidence_verified', 'rejected')),
  evidence text check (evidence is null or char_length(evidence) <= 4000),
  event_data jsonb not null default '{}'::jsonb
    check (jsonb_typeof(event_data) = 'object'),
  occurred_at timestamptz not null default now(),
  constraint foundry_lifecycle_events_application_same_workspace
    foreign key (workspace_id, application_id)
    references public.foundry_applications(workspace_id, id)
    on delete cascade,
  constraint foundry_lifecycle_events_review_same_workspace
    foreign key (workspace_id, review_id)
    references public.foundry_application_reviews(workspace_id, id)
    on delete set null (review_id),
  constraint foundry_lifecycle_events_invitation_same_workspace
    foreign key (workspace_id, invitation_id)
    references public.foundry_invitations(workspace_id, id)
    on delete set null (invitation_id),
  constraint foundry_lifecycle_events_enrolment_same_workspace
    foreign key (workspace_id, enrolment_id)
    references public.foundry_enrolments(workspace_id, id)
    on delete set null (enrolment_id)
);

create index foundry_lifecycle_events_application_idx
  on public.foundry_lifecycle_events(workspace_id, application_id, occurred_at desc);
create index foundry_lifecycle_events_review_idx
  on public.foundry_lifecycle_events(workspace_id, review_id)
  where review_id is not null;
create index foundry_lifecycle_events_invitation_idx
  on public.foundry_lifecycle_events(workspace_id, invitation_id)
  where invitation_id is not null;
create index foundry_lifecycle_events_enrolment_idx
  on public.foundry_lifecycle_events(workspace_id, enrolment_id)
  where enrolment_id is not null;
create index foundry_lifecycle_events_actor_idx
  on public.foundry_lifecycle_events(actor_user_id)
  where actor_user_id is not null;

create trigger foundry_applications_set_updated_at
before update on public.foundry_applications
for each row execute function private.set_updated_at();

create trigger foundry_invitations_set_updated_at
before update on public.foundry_invitations
for each row execute function private.set_updated_at();

create trigger foundry_enrolments_set_updated_at
before update on public.foundry_enrolments
for each row execute function private.set_updated_at();

alter table public.foundry_applications enable row level security;
alter table public.foundry_application_reviews enable row level security;
alter table public.foundry_invitations enable row level security;
alter table public.foundry_enrolments enable row level security;
alter table public.foundry_lifecycle_events enable row level security;

create policy foundry_applications_browser_deny
on public.foundry_applications for all
to anon, authenticated
using (false)
with check (false);

create policy foundry_application_reviews_browser_deny
on public.foundry_application_reviews for all
to anon, authenticated
using (false)
with check (false);

create policy foundry_invitations_browser_deny
on public.foundry_invitations for all
to anon, authenticated
using (false)
with check (false);

create policy foundry_enrolments_browser_deny
on public.foundry_enrolments for all
to anon, authenticated
using (false)
with check (false);

create policy foundry_lifecycle_events_browser_deny
on public.foundry_lifecycle_events for all
to anon, authenticated
using (false)
with check (false);

revoke all on table public.foundry_applications from public, anon, authenticated;
revoke all on table public.foundry_application_reviews from public, anon, authenticated;
revoke all on table public.foundry_invitations from public, anon, authenticated;
revoke all on table public.foundry_enrolments from public, anon, authenticated;
revoke all on table public.foundry_lifecycle_events from public, anon, authenticated;

grant all on table public.foundry_applications to service_role;
grant all on table public.foundry_application_reviews to service_role;
grant all on table public.foundry_invitations to service_role;
grant all on table public.foundry_enrolments to service_role;
grant all on table public.foundry_lifecycle_events to service_role;
grant usage, select on sequence public.foundry_lifecycle_events_id_seq to service_role;

create or replace function private.foundry_review_application(
  p_workspace_id uuid,
  p_application_id uuid,
  p_outcome text,
  p_reviewer_user_id uuid default null,
  p_notes text default null,
  p_evidence text default null,
  p_validation_state text default 'unverified',
  p_is_historical boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_review_id uuid;
  v_exists boolean;
begin
  if p_outcome not in ('reviewing', 'shortlisted', 'waitlisted', 'rejected') then
    raise exception 'Review RPC handles non-accept outcomes only';
  end if;

  if p_validation_state not in ('unverified', 'self_confirmed', 'evidence_verified', 'rejected') then
    raise exception 'Invalid validation state';
  end if;

  if p_reviewer_user_id is not null and not exists (
    select 1
    from public.workspace_members member
    where member.workspace_id = p_workspace_id
      and member.user_id = p_reviewer_user_id
  ) then
    raise exception 'Reviewer is not a workspace member';
  end if;

  select true into v_exists
  from public.foundry_applications application
  where application.workspace_id = p_workspace_id
    and application.id = p_application_id
  for update;

  if coalesce(v_exists, false) = false then
    raise exception 'Application not found';
  end if;

  insert into public.foundry_application_reviews (
    workspace_id,
    application_id,
    reviewer_user_id,
    outcome,
    notes,
    evidence,
    validation_state,
    is_historical
  ) values (
    p_workspace_id,
    p_application_id,
    p_reviewer_user_id,
    p_outcome,
    p_notes,
    p_evidence,
    p_validation_state,
    p_is_historical
  ) returning id into v_review_id;

  update public.foundry_applications
  set status = p_outcome,
      validation_state = case
        when p_validation_state = 'evidence_verified' then 'evidence_verified'
        when p_validation_state = 'rejected' then 'rejected'
        else validation_state
      end
  where workspace_id = p_workspace_id
    and id = p_application_id;

  insert into public.foundry_lifecycle_events (
    workspace_id,
    application_id,
    review_id,
    actor_user_id,
    event_type,
    validation_state,
    evidence,
    event_data
  ) values (
    p_workspace_id,
    p_application_id,
    v_review_id,
    p_reviewer_user_id,
    'application_reviewed',
    p_validation_state,
    p_evidence,
    jsonb_build_object('outcome', p_outcome, 'historical', p_is_historical)
  );

  return v_review_id;
end;
$$;

create or replace function private.foundry_accept_application(
  p_workspace_id uuid,
  p_application_id uuid,
  p_recipient_email text,
  p_reviewer_user_id uuid default null,
  p_notes text default null,
  p_evidence text default null,
  p_validation_state text default 'unverified',
  p_expires_in_days integer default 7
)
returns table(review_id uuid, invitation_id uuid, invite_token text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_review_id uuid;
  v_invitation_id uuid;
  v_token text;
  v_hash text;
  v_status text;
begin
  if nullif(trim(p_recipient_email), '') is null then
    raise exception 'Recipient email required';
  end if;

  if p_validation_state not in ('unverified', 'self_confirmed', 'evidence_verified') then
    raise exception 'Invalid validation state';
  end if;

  if p_expires_in_days < 1 or p_expires_in_days > 30 then
    raise exception 'Invite expiry must be 1-30 days';
  end if;

  if p_reviewer_user_id is not null and not exists (
    select 1
    from public.workspace_members member
    where member.workspace_id = p_workspace_id
      and member.user_id = p_reviewer_user_id
  ) then
    raise exception 'Reviewer is not a workspace member';
  end if;

  select application.status into v_status
  from public.foundry_applications application
  where application.workspace_id = p_workspace_id
    and application.id = p_application_id
  for update;

  if v_status is null then
    raise exception 'Application not found';
  end if;

  if v_status in ('rejected', 'waitlisted') then
    raise exception 'Application must leave % before acceptance', v_status;
  end if;

  if exists (
    select 1
    from public.foundry_invitations invitation
    where invitation.workspace_id = p_workspace_id
      and invitation.application_id = p_application_id
      and invitation.status in ('prepared', 'sent')
  ) then
    raise exception 'Open invitation already exists';
  end if;

  insert into public.foundry_application_reviews (
    workspace_id,
    application_id,
    reviewer_user_id,
    outcome,
    notes,
    evidence,
    validation_state
  ) values (
    p_workspace_id,
    p_application_id,
    p_reviewer_user_id,
    'accepted',
    p_notes,
    p_evidence,
    p_validation_state
  ) returning id into v_review_id;

  update public.foundry_applications
  set status = 'accepted',
      email = lower(trim(p_recipient_email)),
      validation_state = case
        when p_validation_state = 'evidence_verified' then 'evidence_verified'
        else validation_state
      end
  where workspace_id = p_workspace_id
    and id = p_application_id;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');

  insert into public.foundry_invitations (
    workspace_id,
    application_id,
    review_id,
    recipient_email,
    token_hash,
    status,
    source,
    evidence,
    expires_at
  ) values (
    p_workspace_id,
    p_application_id,
    v_review_id,
    lower(trim(p_recipient_email)),
    v_hash,
    'prepared',
    'system',
    p_evidence,
    now() + make_interval(days => p_expires_in_days)
  ) returning id into v_invitation_id;

  insert into public.foundry_lifecycle_events (
    workspace_id, application_id, review_id, actor_user_id,
    event_type, validation_state, evidence
  ) values (
    p_workspace_id, p_application_id, v_review_id, p_reviewer_user_id,
    'application_accepted', p_validation_state, p_evidence
  );

  insert into public.foundry_lifecycle_events (
    workspace_id, application_id, review_id, invitation_id, actor_user_id,
    event_type, validation_state, evidence, event_data
  ) values (
    p_workspace_id, p_application_id, v_review_id, v_invitation_id, p_reviewer_user_id,
    'invitation_prepared', p_validation_state, p_evidence,
    jsonb_build_object('expires_at', now() + make_interval(days => p_expires_in_days))
  );

  return query select v_review_id, v_invitation_id, v_token;
end;
$$;

create or replace function private.foundry_mark_invitation_sent(
  p_workspace_id uuid,
  p_invitation_id uuid,
  p_actor_user_id uuid default null,
  p_evidence text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_application_id uuid;
  v_status text;
begin
  if p_actor_user_id is not null and not exists (
    select 1
    from public.workspace_members member
    where member.workspace_id = p_workspace_id
      and member.user_id = p_actor_user_id
  ) then
    raise exception 'Actor is not a workspace member';
  end if;

  select invitation.application_id, invitation.status
  into v_application_id, v_status
  from public.foundry_invitations invitation
  where invitation.workspace_id = p_workspace_id
    and invitation.id = p_invitation_id
  for update;

  if v_application_id is null then
    raise exception 'Invitation not found';
  end if;

  if v_status <> 'prepared' then
    raise exception 'Invitation is not prepared';
  end if;

  if not exists (
    select 1
    from public.foundry_invitations invitation
    where invitation.workspace_id = p_workspace_id
      and invitation.id = p_invitation_id
      and invitation.token_hash is not null
  ) then
    raise exception 'Invitation has no claim token';
  end if;

  update public.foundry_invitations
  set status = 'sent',
      sent_at = now(),
      evidence = coalesce(p_evidence, evidence)
  where workspace_id = p_workspace_id
    and id = p_invitation_id;

  insert into public.foundry_lifecycle_events (
    workspace_id, application_id, invitation_id, actor_user_id,
    event_type, validation_state, evidence
  ) values (
    p_workspace_id, v_application_id, p_invitation_id, p_actor_user_id,
    'invitation_sent', 'self_confirmed', p_evidence
  );
end;
$$;

create or replace function private.foundry_claim_invitation(
  p_invite_token text,
  p_user_id uuid,
  p_evidence text default null
)
returns table(enrolment_id uuid, student_id uuid, workspace_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text;
  v_inv public.foundry_invitations%rowtype;
  v_app public.foundry_applications%rowtype;
  v_user_email text;
  v_student_id uuid;
  v_student_workspace_id uuid;
  v_bundle_id uuid;
  v_enrolment_id uuid;
  v_department text;
begin
  if nullif(trim(p_invite_token), '') is null
    or trim(p_invite_token) !~ '^[a-fA-F0-9]{64}$'
  then
    raise exception 'Valid invitation token required';
  end if;

  if p_user_id is null then
    raise exception 'User required';
  end if;

  v_hash := encode(extensions.digest(lower(trim(p_invite_token)), 'sha256'), 'hex');

  select invitation.* into v_inv
  from public.foundry_invitations invitation
  where invitation.token_hash = v_hash
  for update;

  if v_inv.id is null then
    raise exception 'Invalid invitation';
  end if;

  if v_inv.status not in ('prepared', 'sent') then
    raise exception 'Invitation is %', v_inv.status;
  end if;

  if v_inv.expires_at is not null and v_inv.expires_at < now() then
    raise exception 'Invitation expired';
  end if;

  select application.* into v_app
  from public.foundry_applications application
  where application.workspace_id = v_inv.workspace_id
    and application.id = v_inv.application_id
  for update;

  if v_app.id is null or v_app.status <> 'accepted' then
    raise exception 'Application is not accepted';
  end if;

  select lower(user_record.email) into v_user_email
  from auth.users user_record
  where user_record.id = p_user_id;

  if v_user_email is null then
    raise exception 'Auth user not found';
  end if;

  if lower(v_inv.recipient_email) <> v_user_email then
    raise exception 'Invitation email does not match signed-in user';
  end if;

  if exists (
    select 1
    from public.foundry_enrolments enrolment
    where enrolment.workspace_id = v_inv.workspace_id
      and enrolment.auth_user_id = p_user_id
      and enrolment.status = 'active'
      and enrolment.application_id <> v_app.id
  ) then
    raise exception 'User already has an active Foundry enrolment';
  end if;

  select student.id, student.workspace_id
  into v_student_id, v_student_workspace_id
  from public.foundry_students student
  where student.auth_user_id = p_user_id
  limit 1
  for update;

  if v_student_id is null then
    select student.id, student.workspace_id
    into v_student_id, v_student_workspace_id
    from public.foundry_students student
    where student.email is not null
      and lower(trim(student.email)) = v_user_email
      and student.lifecycle_status <> 'rejected'
    limit 1
    for update;
  end if;

  if v_student_id is not null and v_student_workspace_id <> v_inv.workspace_id then
    raise exception 'User is already linked to another Foundry workspace';
  end if;

  v_department := case
    when v_app.department <> 'unassigned' then v_app.department
    when v_app.preferred_course = 'creative_ui_design' then 'creative_ui'
    when v_app.preferred_course in ('web_development', 'app_building') then 'web_app'
    when v_app.preferred_course = 'ai_automation' then 'ai_automation'
    when v_app.preferred_course = 'sales_calling' then 'sales_calling'
    when v_app.preferred_course = 'content_media' then 'content_media'
    when v_app.preferred_course = 'operations_support' then 'operations'
    else 'unassigned'
  end;

  if v_student_id is null then
    insert into public.foundry_students (
      workspace_id,
      auth_user_id,
      foundry_id,
      external_source,
      application_id,
      full_name,
      email,
      department,
      level,
      lifecycle_status,
      next_action,
      batch_label,
      created_by
    ) values (
      v_inv.workspace_id,
      p_user_id,
      'UFS-' || upper(substr(replace(v_app.id::text, '-', ''), 1, 12)),
      'manual',
      v_app.id::text,
      v_app.full_name,
      v_user_email,
      v_department,
      'onboarding',
      'enrolled',
      'Complete Foundry onboarding.',
      v_app.batch_label,
      p_user_id
    ) returning id into v_student_id;
  else
    update public.foundry_students
    set auth_user_id = p_user_id,
        application_id = v_app.id::text,
        full_name = v_app.full_name,
        email = v_user_email,
        department = v_department,
        level = case
          when level in ('applied', 'screening', 'trial', 'accepted') then 'onboarding'
          else level
        end,
        lifecycle_status = 'enrolled',
        batch_label = coalesce(v_app.batch_label, batch_label),
        next_action = coalesce(next_action, 'Complete Foundry onboarding.')
    where workspace_id = v_inv.workspace_id
      and id = v_student_id;
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_inv.workspace_id, p_user_id, 'member')
  on conflict (workspace_id, user_id) do nothing;

  select bundle.id into v_bundle_id
  from public.permission_bundles bundle
  where bundle.workspace_id = v_inv.workspace_id
    and bundle.bundle_key = 'foundry_learner';

  if v_bundle_id is null then
    raise exception 'Foundry learner permission bundle is missing';
  end if;

  insert into public.member_permission_bundles (
    workspace_id,
    user_id,
    bundle_id,
    assigned_by
  ) values (
    v_inv.workspace_id,
    p_user_id,
    v_bundle_id,
    null
  ) on conflict do nothing;

  update public.foundry_invitations
  set status = 'accepted',
      recipient_user_id = p_user_id,
      accepted_at = now(),
      evidence = coalesce(p_evidence, evidence)
  where workspace_id = v_inv.workspace_id
    and id = v_inv.id;

  update public.foundry_applications
  set auth_user_id = p_user_id,
      foundry_student_id = v_student_id
  where workspace_id = v_inv.workspace_id
    and id = v_app.id;

  insert into public.foundry_enrolments (
    workspace_id,
    application_id,
    auth_user_id,
    foundry_student_id,
    invitation_id,
    review_id,
    status,
    validation_state,
    evidence
  ) values (
    v_inv.workspace_id,
    v_app.id,
    p_user_id,
    v_student_id,
    v_inv.id,
    v_inv.review_id,
    'active',
    'evidence_verified',
    p_evidence
  )
  on conflict (workspace_id, application_id) do update
  set auth_user_id = excluded.auth_user_id,
      foundry_student_id = excluded.foundry_student_id,
      invitation_id = excluded.invitation_id,
      review_id = excluded.review_id,
      status = 'active',
      validation_state = 'evidence_verified',
      evidence = coalesce(excluded.evidence, public.foundry_enrolments.evidence),
      updated_at = now()
  returning id into v_enrolment_id;

  insert into public.foundry_lifecycle_events (
    workspace_id, application_id, review_id, invitation_id, actor_user_id,
    event_type, validation_state, evidence
  ) values (
    v_inv.workspace_id, v_app.id, v_inv.review_id, v_inv.id, p_user_id,
    'invitation_accepted', 'evidence_verified', p_evidence
  );

  insert into public.foundry_lifecycle_events (
    workspace_id, application_id, review_id, invitation_id, enrolment_id,
    actor_user_id, event_type, validation_state, evidence,
    event_data
  ) values (
    v_inv.workspace_id, v_app.id, v_inv.review_id, v_inv.id, v_enrolment_id,
    p_user_id, 'enrolled', 'evidence_verified', p_evidence,
    jsonb_build_object('student_id', v_student_id)
  );

  return query select v_enrolment_id, v_student_id, v_inv.workspace_id;
end;
$$;

-- Public-schema RPC wrappers exist only so server-side PostgREST/Supabase clients
-- can invoke the private state machine. They remain service-role-only.
create or replace function public.foundry_review_application(
  p_workspace_id uuid,
  p_application_id uuid,
  p_outcome text,
  p_reviewer_user_id uuid default null,
  p_notes text default null,
  p_evidence text default null,
  p_validation_state text default 'unverified',
  p_is_historical boolean default false
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select private.foundry_review_application(
    p_workspace_id,
    p_application_id,
    p_outcome,
    p_reviewer_user_id,
    p_notes,
    p_evidence,
    p_validation_state,
    p_is_historical
  );
$$;

create or replace function public.foundry_accept_application(
  p_workspace_id uuid,
  p_application_id uuid,
  p_recipient_email text,
  p_reviewer_user_id uuid default null,
  p_notes text default null,
  p_evidence text default null,
  p_validation_state text default 'unverified',
  p_expires_in_days integer default 7
)
returns table(review_id uuid, invitation_id uuid, invite_token text)
language sql
security definer
set search_path = ''
as $$
  select *
  from private.foundry_accept_application(
    p_workspace_id,
    p_application_id,
    p_recipient_email,
    p_reviewer_user_id,
    p_notes,
    p_evidence,
    p_validation_state,
    p_expires_in_days
  );
$$;

create or replace function public.foundry_mark_invitation_sent(
  p_workspace_id uuid,
  p_invitation_id uuid,
  p_actor_user_id uuid default null,
  p_evidence text default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  select private.foundry_mark_invitation_sent(
    p_workspace_id,
    p_invitation_id,
    p_actor_user_id,
    p_evidence
  );
$$;

create or replace function public.foundry_claim_invitation(
  p_invite_token text,
  p_user_id uuid,
  p_evidence text default null
)
returns table(enrolment_id uuid, student_id uuid, workspace_id uuid)
language sql
security definer
set search_path = ''
as $$
  select *
  from private.foundry_claim_invitation(
    p_invite_token,
    p_user_id,
    p_evidence
  );
$$;

revoke all on function private.foundry_review_application(uuid, uuid, text, uuid, text, text, text, boolean)
  from public, anon, authenticated;
revoke all on function private.foundry_accept_application(uuid, uuid, text, uuid, text, text, text, integer)
  from public, anon, authenticated;
revoke all on function private.foundry_mark_invitation_sent(uuid, uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function private.foundry_claim_invitation(text, uuid, text)
  from public, anon, authenticated;

revoke all on function public.foundry_review_application(uuid, uuid, text, uuid, text, text, text, boolean)
  from public, anon, authenticated;
revoke all on function public.foundry_accept_application(uuid, uuid, text, uuid, text, text, text, integer)
  from public, anon, authenticated;
revoke all on function public.foundry_mark_invitation_sent(uuid, uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.foundry_claim_invitation(text, uuid, text)
  from public, anon, authenticated;

grant execute on function public.foundry_review_application(uuid, uuid, text, uuid, text, text, text, boolean)
  to service_role;
grant execute on function public.foundry_accept_application(uuid, uuid, text, uuid, text, text, text, integer)
  to service_role;
grant execute on function public.foundry_mark_invitation_sent(uuid, uuid, uuid, text)
  to service_role;
grant execute on function public.foundry_claim_invitation(text, uuid, text)
  to service_role;

create view public.foundry_application_lifecycle
with (security_invoker = true)
as
select
  application.workspace_id,
  application.id as application_id,
  application.full_name,
  application.email,
  application.status as application_status,
  application.validation_state as application_validation,
  application.preferred_course,
  application.department,
  application.course_label,
  application.batch_label,
  review.id as latest_review_id,
  review.outcome as latest_review_outcome,
  review.validation_state as review_validation,
  review.created_at as reviewed_at,
  invitation.id as latest_invitation_id,
  invitation.status as invitation_status,
  invitation.recipient_email,
  invitation.prepared_at,
  invitation.sent_at,
  invitation.accepted_at,
  invitation.expires_at,
  enrolment.id as enrolment_id,
  enrolment.foundry_student_id,
  enrolment.status as enrolment_status,
  enrolment.enrolled_at,
  case
    when enrolment.id is not null then 'enrolled'
    when invitation.status = 'accepted' then 'invite_accepted'
    when invitation.status = 'sent' then 'invite_sent'
    when invitation.status = 'prepared' then 'invite_prepared'
    when application.status = 'accepted' then 'accepted_needs_invite'
    when application.status in ('reviewing', 'shortlisted', 'waitlisted', 'rejected') then 'review'
    else 'application'
  end as lifecycle_stage,
  (enrolment.id is not null) as milestone_complete
from public.foundry_applications application
left join lateral (
  select review_row.*
  from public.foundry_application_reviews review_row
  where review_row.workspace_id = application.workspace_id
    and review_row.application_id = application.id
  order by review_row.created_at desc, review_row.id desc
  limit 1
) review on true
left join lateral (
  select invitation_row.*
  from public.foundry_invitations invitation_row
  where invitation_row.workspace_id = application.workspace_id
    and invitation_row.application_id = application.id
  order by invitation_row.created_at desc, invitation_row.id desc
  limit 1
) invitation on true
left join public.foundry_enrolments enrolment
  on enrolment.workspace_id = application.workspace_id
 and enrolment.application_id = application.id;

revoke all on table public.foundry_application_lifecycle from public, anon, authenticated;
grant select on table public.foundry_application_lifecycle to service_role;
