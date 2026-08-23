begin;

-- Provider-confirmed claims must not be forgeable from an authenticated workspace-admin session.
-- Reuses the deterministic CI founder/workspace fixture.

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
  'CI provenance audience',
  'Clear and factual',
  'Never invent provider outcomes.',
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
  approved_at,
  approved_by,
  created_by,
  source_type,
  format,
  goal
)
values (
  '8a000000-0000-4000-8000-000000000001',
  '82000000-0000-4000-8000-000000000001',
  null,
  'facebook',
  'Provider provenance item',
  'This approved item is used to prove that provider evidence is worker-only.',
  'approved',
  now(),
  '81000000-0000-4000-8000-000000000001',
  '81000000-0000-4000-8000-000000000001',
  'brand',
  'post',
  'authority'
);

insert into public.content_publications (
  id,
  workspace_id,
  content_id,
  provider,
  status,
  idempotency_key
)
values (
  '8b000000-0000-4000-8000-000000000001',
  '82000000-0000-4000-8000-000000000001',
  '8a000000-0000-4000-8000-000000000001',
  'meta',
  'queued',
  'ci-provider-provenance'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
declare
  published_forgery_blocked boolean := false;
  metric_forgery_blocked boolean := false;
  worker_event_forgery_blocked boolean := false;
begin
  begin
    update public.content_publications
    set status = 'published',
        provider_post_id = 'forged-provider-id',
        provider_post_url = 'https://example.test/forged',
        published_at = now(),
        provider_response = '{"confirmed":true,"source":"forged"}'::jsonb
    where id = '8b000000-0000-4000-8000-000000000001';
  exception
    when others then
      published_forgery_blocked := true;
  end;

  if not published_forgery_blocked then
    raise exception 'Content Engine provenance failure: authenticated admin forged published provider evidence';
  end if;

  begin
    insert into public.content_metric_snapshots (
      workspace_id,
      content_id,
      publication_id,
      reach,
      engagements,
      clicks,
      leads,
      raw_metrics
    ) values (
      '82000000-0000-4000-8000-000000000001',
      '8a000000-0000-4000-8000-000000000001',
      '8b000000-0000-4000-8000-000000000001',
      999999,
      999999,
      999999,
      999999,
      '{"source":"forged"}'::jsonb
    );
  exception
    when others then
      metric_forgery_blocked := true;
  end;

  if not metric_forgery_blocked then
    raise exception 'Content Engine provenance failure: authenticated admin forged provider metrics';
  end if;

  begin
    insert into public.content_review_events (
      workspace_id,
      content_id,
      event_type,
      actor_id,
      details
    ) values (
      '82000000-0000-4000-8000-000000000001',
      '8a000000-0000-4000-8000-000000000001',
      'publication_published',
      '81000000-0000-4000-8000-000000000001',
      '{"provider_post_id":"forged"}'::jsonb
    );
  exception
    when others then
      worker_event_forgery_blocked := true;
  end;

  if not worker_event_forgery_blocked then
    raise exception 'Content Engine provenance failure: authenticated admin forged a worker-only audit event';
  end if;
end;
$$;

reset role;
rollback;
select 'content engine provider provenance passed' as result;
