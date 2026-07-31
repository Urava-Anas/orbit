grant usage on schema private to anon, authenticated, service_role;

alter function public.claim_orbit_access()
  set schema private;
alter function public.create_orbit_action_key(uuid, text, text, text, text[], timestamptz)
  set schema private;
alter function public.issue_foundry_certificate(uuid, uuid, uuid, text, text)
  set schema private;
alter function public.list_orbit_action_keys(uuid)
  set schema private;
alter function public.queue_foundry_full_sync(uuid)
  set schema private;
alter function public.record_foundry_daily_checkpoint(text)
  set schema private;
alter function public.record_foundry_daily_issue(uuid, uuid, date, text, text, boolean)
  set schema private;
alter function public.review_foundry_studio_readiness(uuid, uuid, uuid, text, smallint, smallint, smallint, smallint, smallint, smallint, text, text)
  set schema private;
alter function public.revoke_foundry_certificate(uuid, uuid, text)
  set schema private;
alter function public.revoke_orbit_action_key(uuid, uuid)
  set schema private;
alter function public.update_foundry_delivery_preferences(uuid, uuid, boolean, boolean, text, text)
  set schema private;
alter function public.verify_foundry_certificate(uuid)
  set schema private;

revoke all on function private.claim_orbit_access()
  from public, anon, authenticated;
revoke all on function private.create_orbit_action_key(uuid, text, text, text, text[], timestamptz)
  from public, anon, authenticated;
revoke all on function private.issue_foundry_certificate(uuid, uuid, uuid, text, text)
  from public, anon, authenticated;
revoke all on function private.list_orbit_action_keys(uuid)
  from public, anon, authenticated;
revoke all on function private.queue_foundry_full_sync(uuid)
  from public, anon, authenticated;
revoke all on function private.record_foundry_daily_checkpoint(text)
  from public, anon, authenticated;
revoke all on function private.record_foundry_daily_issue(uuid, uuid, date, text, text, boolean)
  from public, anon, authenticated;
revoke all on function private.review_foundry_studio_readiness(uuid, uuid, uuid, text, smallint, smallint, smallint, smallint, smallint, smallint, text, text)
  from public, anon, authenticated;
revoke all on function private.revoke_foundry_certificate(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function private.revoke_orbit_action_key(uuid, uuid)
  from public, anon, authenticated;
revoke all on function private.update_foundry_delivery_preferences(uuid, uuid, boolean, boolean, text, text)
  from public, anon, authenticated;
revoke all on function private.verify_foundry_certificate(uuid)
  from public, anon, authenticated;

grant execute on function private.claim_orbit_access()
  to authenticated, service_role;
grant execute on function private.create_orbit_action_key(uuid, text, text, text, text[], timestamptz)
  to authenticated, service_role;
grant execute on function private.issue_foundry_certificate(uuid, uuid, uuid, text, text)
  to authenticated, service_role;
grant execute on function private.list_orbit_action_keys(uuid)
  to authenticated, service_role;
grant execute on function private.queue_foundry_full_sync(uuid)
  to authenticated, service_role;
grant execute on function private.record_foundry_daily_checkpoint(text)
  to authenticated, service_role;
grant execute on function private.record_foundry_daily_issue(uuid, uuid, date, text, text, boolean)
  to authenticated, service_role;
grant execute on function private.review_foundry_studio_readiness(uuid, uuid, uuid, text, smallint, smallint, smallint, smallint, smallint, smallint, text, text)
  to authenticated, service_role;
grant execute on function private.revoke_foundry_certificate(uuid, uuid, text)
  to authenticated, service_role;
grant execute on function private.revoke_orbit_action_key(uuid, uuid)
  to authenticated, service_role;
grant execute on function private.update_foundry_delivery_preferences(uuid, uuid, boolean, boolean, text, text)
  to authenticated, service_role;
grant execute on function private.verify_foundry_certificate(uuid)
  to anon, authenticated, service_role;

create function public.claim_orbit_access()
returns table(
  account_role text,
  membership_role text,
  workspace_id uuid,
  workspace_name text,
  workspace_slug text,
  student_id uuid,
  foundry_id text
)
language sql
security invoker
set search_path = ''
as $$
  select * from private.claim_orbit_access();
$$;

create function public.create_orbit_action_key(
  target_workspace_id uuid,
  target_name text,
  target_token_prefix text,
  target_token_hash text,
  target_scopes text[],
  target_expires_at timestamptz
)
returns table(
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
language sql
security invoker
set search_path = ''
as $$
  select *
  from private.create_orbit_action_key(
    target_workspace_id,
    target_name,
    target_token_prefix,
    target_token_hash,
    target_scopes,
    target_expires_at
  );
$$;

create function public.issue_foundry_certificate(
  target_workspace_id uuid,
  target_student_id uuid,
  command_request_id uuid,
  target_certificate_type text,
  target_title text
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.issue_foundry_certificate(
    target_workspace_id,
    target_student_id,
    command_request_id,
    target_certificate_type,
    target_title
  );
$$;

create function public.list_orbit_action_keys(target_workspace_id uuid)
returns table(
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
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.list_orbit_action_keys(target_workspace_id);
$$;

create function public.queue_foundry_full_sync(target_workspace_id uuid)
returns integer
language sql
security invoker
set search_path = ''
as $$
  select private.queue_foundry_full_sync(target_workspace_id);
$$;

create function public.record_foundry_daily_checkpoint(checkpoint text)
returns date
language sql
security invoker
set search_path = ''
as $$
  select private.record_foundry_daily_checkpoint(checkpoint);
$$;

create function public.record_foundry_daily_issue(
  target_workspace_id uuid,
  target_student_id uuid,
  target_date date,
  target_issue_code text,
  target_issue_note text,
  mark_resolved boolean default false
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.record_foundry_daily_issue(
    target_workspace_id,
    target_student_id,
    target_date,
    target_issue_code,
    target_issue_note,
    mark_resolved
  );
$$;

create function public.review_foundry_studio_readiness(
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
language sql
security invoker
set search_path = ''
as $$
  select private.review_foundry_studio_readiness(
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
    target_evidence_summary,
    target_decision_note
  );
$$;

create function public.revoke_foundry_certificate(
  target_workspace_id uuid,
  target_certificate_id uuid,
  target_reason text
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.revoke_foundry_certificate(
    target_workspace_id,
    target_certificate_id,
    target_reason
  );
$$;

create function public.revoke_orbit_action_key(
  target_workspace_id uuid,
  target_key_id uuid
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.revoke_orbit_action_key(
    target_workspace_id,
    target_key_id
  );
$$;

create function public.update_foundry_delivery_preferences(
  target_workspace_id uuid,
  target_student_id uuid,
  enable_email boolean,
  enable_whatsapp boolean,
  target_whatsapp_number text,
  target_consent_note text
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.update_foundry_delivery_preferences(
    target_workspace_id,
    target_student_id,
    enable_email,
    enable_whatsapp,
    target_whatsapp_number,
    target_consent_note
  );
$$;

create function public.verify_foundry_certificate(
  target_verification_token uuid
)
returns table(
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
security invoker
set search_path = ''
as $$
  select *
  from private.verify_foundry_certificate(target_verification_token);
$$;

revoke all on function public.claim_orbit_access()
  from public, anon, authenticated;
revoke all on function public.create_orbit_action_key(uuid, text, text, text, text[], timestamptz)
  from public, anon, authenticated;
revoke all on function public.issue_foundry_certificate(uuid, uuid, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.list_orbit_action_keys(uuid)
  from public, anon, authenticated;
revoke all on function public.queue_foundry_full_sync(uuid)
  from public, anon, authenticated;
revoke all on function public.record_foundry_daily_checkpoint(text)
  from public, anon, authenticated;
revoke all on function public.record_foundry_daily_issue(uuid, uuid, date, text, text, boolean)
  from public, anon, authenticated;
revoke all on function public.review_foundry_studio_readiness(uuid, uuid, uuid, text, smallint, smallint, smallint, smallint, smallint, smallint, text, text)
  from public, anon, authenticated;
revoke all on function public.revoke_foundry_certificate(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.revoke_orbit_action_key(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.update_foundry_delivery_preferences(uuid, uuid, boolean, boolean, text, text)
  from public, anon, authenticated;
revoke all on function public.verify_foundry_certificate(uuid)
  from public, anon, authenticated;

grant execute on function public.claim_orbit_access()
  to authenticated, service_role;
grant execute on function public.create_orbit_action_key(uuid, text, text, text, text[], timestamptz)
  to authenticated, service_role;
grant execute on function public.issue_foundry_certificate(uuid, uuid, uuid, text, text)
  to authenticated, service_role;
grant execute on function public.list_orbit_action_keys(uuid)
  to authenticated, service_role;
grant execute on function public.queue_foundry_full_sync(uuid)
  to authenticated, service_role;
grant execute on function public.record_foundry_daily_checkpoint(text)
  to authenticated, service_role;
grant execute on function public.record_foundry_daily_issue(uuid, uuid, date, text, text, boolean)
  to authenticated, service_role;
grant execute on function public.review_foundry_studio_readiness(uuid, uuid, uuid, text, smallint, smallint, smallint, smallint, smallint, smallint, text, text)
  to authenticated, service_role;
grant execute on function public.revoke_foundry_certificate(uuid, uuid, text)
  to authenticated, service_role;
grant execute on function public.revoke_orbit_action_key(uuid, uuid)
  to authenticated, service_role;
grant execute on function public.update_foundry_delivery_preferences(uuid, uuid, boolean, boolean, text, text)
  to authenticated, service_role;
grant execute on function public.verify_foundry_certificate(uuid)
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';