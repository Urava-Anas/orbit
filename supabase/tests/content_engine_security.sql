begin;

-- Content Engine production security acceptance checks.
-- Uses the deterministic CI founder/workspace seeded before every database suite.

insert into public.content_brand_profiles (
  workspace_id,
  audience,
  voice,
  proof_rules,
  default_cta,
  timezone,
  daily_target_count,
  publishing_enabled
)
values (
  '82000000-0000-4000-8000-000000000001',
  'CI audience',
  'Clear and factual',
  'Never publish unapproved or invented claims.',
  'Talk to Urava',
  'Asia/Karachi',
  4,
  true
)
on conflict (workspace_id) do update
set publishing_enabled = excluded.publishing_enabled;

insert into public.content_drafts (
  id,
  workspace_id,
  proof_id,
  channel,
  title,
  body,
  status,
  created_by,
  source_type,
  format,
  goal
)
values
  (
    '83000000-0000-4000-8000-000000000001',
    '82000000-0000-4000-8000-000000000001',
    null,
    'facebook',
    'Facebook review item',
    'This content must not queue before founder approval.',
    'review',
    '81000000-0000-4000-8000-000000000001',
    'brand',
    'post',
    'authority'
  ),
  (
    '83000000-0000-4000-8000-000000000002',
    '82000000-0000-4000-8000-000000000001',
    null,
    'instagram',
    'Instagram approved item',
    'This content requires approved public media before it can queue.',
    'approved',
    '81000000-0000-4000-8000-000000000001',
    'brand',
    'post',
    'authority'
  ),
  (
    '83000000-0000-4000-8000-000000000003',
    '82000000-0000-4000-8000-000000000001',
    null,
    'linkedin',
    'LinkedIn approved item',
    'LinkedIn may enter its isolated queue only after founder approval.',
    'approved',
    '81000000-0000-4000-8000-000000000001',
    'brand',
    'post',
    'authority'
  );

update public.content_drafts
set approved_at = now(),
    approved_by = '81000000-0000-4000-8000-000000000001'
where id in (
  '83000000-0000-4000-8000-000000000002',
  '83000000-0000-4000-8000-000000000003'
);

-- Database trigger must downgrade an unapproved Facebook queue attempt to blocked.
insert into public.content_publications (
  id,
  workspace_id,
  content_id,
  provider,
  status,
  idempotency_key
)
values (
  '84000000-0000-4000-8000-000000000001',
  '82000000-0000-4000-8000-000000000001',
  '83000000-0000-4000-8000-000000000001',
  'meta',
  'queued',
  'ci-facebook-unapproved'
);

-- Approved Instagram without public media must also remain blocked.
insert into public.content_publications (
  id,
  workspace_id,
  content_id,
  provider,
  status,
  idempotency_key
)
values (
  '84000000-0000-4000-8000-000000000002',
  '82000000-0000-4000-8000-000000000001',
  '83000000-0000-4000-8000-000000000002',
  'meta',
  'queued',
  'ci-instagram-no-media'
);

-- Founder-approved LinkedIn may enter the isolated LinkedIn queue. The service-role claim
-- still requires a connected account, verified member-publish capability and exactly one identity.
insert into public.content_publications (
  id,
  workspace_id,
  content_id,
  provider,
  status,
  idempotency_key
)
values (
  '84000000-0000-4000-8000-000000000003',
  '82000000-0000-4000-8000-000000000001',
  '83000000-0000-4000-8000-000000000003',
  'linkedin',
  'queued',
  'ci-linkedin-approved'
);

do $$
declare
  facebook_state text;
  instagram_state text;
  linkedin_state text;
  linkedin_claims integer;
begin
  select status into facebook_state from public.content_publications where id = '84000000-0000-4000-8000-000000000001';
  select status into instagram_state from public.content_publications where id = '84000000-0000-4000-8000-000000000002';
  select status into linkedin_state from public.content_publications where id = '84000000-0000-4000-8000-000000000003';
  select count(*) into linkedin_claims from public.claim_content_linkedin_publications(3);

  if facebook_state <> 'blocked' then
    raise exception 'Content Engine guard failure: unapproved Facebook item became %', facebook_state;
  end if;
  if instagram_state <> 'blocked' then
    raise exception 'Content Engine guard failure: Instagram without media became %', instagram_state;
  end if;
  if linkedin_state <> 'queued' then
    raise exception 'Content Engine guard failure: approved LinkedIn item did not enter isolated queue (%)', linkedin_state;
  end if;
  if linkedin_claims <> 0 then
    raise exception 'Content Engine LinkedIn claim failure: unconnected workspace produced % claim(s)', linkedin_claims;
  end if;
end;
$$;

-- Once the Facebook item is approved, the same guarded transition may queue.
update public.content_drafts
set status = 'approved',
    approved_at = now(),
    approved_by = '81000000-0000-4000-8000-000000000001'
where id = '83000000-0000-4000-8000-000000000001';

update public.content_publications
set status = 'queued', last_error = null
where id = '84000000-0000-4000-8000-000000000001';

-- Instagram queues only after a ready public media record exists.
insert into public.content_assets (
  id,
  workspace_id,
  content_id,
  asset_type,
  source,
  status,
  storage_bucket,
  storage_path,
  public_url,
  mime_type,
  created_by
)
values (
  '85000000-0000-4000-8000-000000000001',
  '82000000-0000-4000-8000-000000000001',
  '83000000-0000-4000-8000-000000000002',
  'image',
  'generated',
  'ready',
  'content-engine-publish',
  'ci/approved.jpg',
  'https://example.test/ci/approved.jpg',
  'image/jpeg',
  '81000000-0000-4000-8000-000000000001'
);

update public.content_publications
set status = 'queued', last_error = null
where id = '84000000-0000-4000-8000-000000000002';

do $$
declare
  facebook_state text;
  instagram_state text;
begin
  select status into facebook_state from public.content_publications where id = '84000000-0000-4000-8000-000000000001';
  select status into instagram_state from public.content_publications where id = '84000000-0000-4000-8000-000000000002';

  if facebook_state <> 'queued' then
    raise exception 'Content Engine guard failure: approved Facebook item did not queue (%).', facebook_state;
  end if;
  if instagram_state <> 'queued' then
    raise exception 'Content Engine guard failure: approved Instagram item with media did not queue (%).', instagram_state;
  end if;
end;
$$;

-- Queue claims and worker credentials are service-role-only; authenticated users cannot invoke
-- either privileged publishing claim or read any worker secret hash.
do $$
begin
  if has_function_privilege('authenticated', 'public.claim_content_publications(integer)', 'EXECUTE') then
    raise exception 'Content Engine security failure: authenticated can execute claim_content_publications';
  end if;
  if has_function_privilege('authenticated', 'public.claim_content_linkedin_publications(integer)', 'EXECUTE') then
    raise exception 'Content Engine security failure: authenticated can execute claim_content_linkedin_publications';
  end if;
  if not has_function_privilege('service_role', 'public.claim_content_publications(integer)', 'EXECUTE') then
    raise exception 'Content Engine security failure: service_role cannot execute claim_content_publications';
  end if;
  if not has_function_privilege('service_role', 'public.claim_content_linkedin_publications(integer)', 'EXECUTE') then
    raise exception 'Content Engine security failure: service_role cannot execute claim_content_linkedin_publications';
  end if;
  if has_table_privilege('authenticated', 'public.content_worker_auth', 'SELECT') then
    raise exception 'Content Engine security failure: authenticated can read worker secret hashes';
  end if;
end;
$$;

rollback;
select 'content engine publishing guardrails passed' as result;
