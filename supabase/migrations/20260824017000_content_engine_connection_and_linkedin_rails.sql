-- Connect external content providers through the same one-time OAuth ledger and add a
-- separate fail-closed LinkedIn member publishing rail. TikTok may authenticate here,
-- but automatic TikTok delivery remains intentionally unsupported until its creator-info,
-- media-transfer, user-consent and app-audit requirements are implemented and verified.

alter table public.integration_oauth_states
  drop constraint if exists integration_oauth_states_provider_check;

alter table public.integration_oauth_states
  add constraint integration_oauth_states_provider_check
  check (provider in (
    'github',
    'vercel',
    'google_search_console',
    'google_analytics',
    'meta',
    'linkedin',
    'tiktok'
  ));

create or replace function private.enforce_content_publication_delivery_readiness()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  draft_channel text;
  draft_status text;
  workspace_publishing_enabled boolean;
  has_ready_asset boolean;
begin
  if new.status not in ('queued', 'publishing') then
    return new;
  end if;

  select d.channel, d.status
    into draft_channel, draft_status
  from public.content_drafts d
  where d.id = new.content_id
    and d.workspace_id = new.workspace_id;

  if draft_channel is null then
    new.status := 'blocked';
    new.last_error := 'Content record is unavailable for this publication.';
    return new;
  end if;

  if draft_status <> 'approved' then
    new.status := 'blocked';
    new.last_error := 'Founder approval is required before automatic publishing.';
    return new;
  end if;

  select p.publishing_enabled
    into workspace_publishing_enabled
  from public.content_brand_profiles p
  where p.workspace_id = new.workspace_id;

  if coalesce(workspace_publishing_enabled, false) is not true then
    new.status := 'blocked';
    new.last_error := 'Workspace automatic publishing is disabled.';
    return new;
  end if;

  if not (
    (new.provider = 'meta' and draft_channel in ('instagram', 'facebook'))
    or (new.provider = 'linkedin' and draft_channel = 'linkedin')
  ) then
    new.status := 'blocked';
    new.last_error := case
      when draft_channel = 'tiktok' then 'TikTok automatic publishing is gated until the verified Content Posting audit and media flow are complete.'
      when draft_channel = 'linkedin' then 'LinkedIn content must use the verified LinkedIn delivery rail.'
      else 'No verified automatic publishing adapter exists for this channel.'
    end;
    return new;
  end if;

  if draft_channel = 'instagram' then
    select exists (
      select 1
      from public.content_assets asset
      where asset.workspace_id = new.workspace_id
        and asset.content_id = new.content_id
        and asset.status = 'ready'
        and asset.asset_type = 'image'
        and asset.public_url is not null
    ) into has_ready_asset;

    if not has_ready_asset then
      new.status := 'blocked';
      new.last_error := 'Instagram requires an approved public image before automatic publishing.';
      return new;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_content_publication_delivery_readiness() from public, anon, authenticated;

drop trigger if exists content_publications_delivery_readiness_guard on public.content_publications;
create trigger content_publications_delivery_readiness_guard
before insert or update of status, content_id, provider
on public.content_publications
for each row
execute function private.enforce_content_publication_delivery_readiness();

create or replace function public.claim_content_linkedin_publications(max_jobs integer default 3)
returns setof public.content_publications
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if max_jobs < 1 or max_jobs > 10 then
    raise exception 'max_jobs must be between 1 and 10';
  end if;

  return query
  with claimable as (
    select p.id
    from public.content_publications p
    join public.content_brand_profiles profile
      on profile.workspace_id = p.workspace_id
    join public.content_drafts draft
      on draft.workspace_id = p.workspace_id
     and draft.id = p.content_id
    join public.integration_connections connection
      on connection.workspace_id = p.workspace_id
     and connection.provider = 'linkedin'
    where p.provider = 'linkedin'
      and draft.channel = 'linkedin'
      and draft.status = 'approved'
      and profile.publishing_enabled = true
      and connection.status = 'connected'
      and coalesce(connection.metadata -> 'verifiedCapabilities', '[]'::jsonb) ? 'linkedin.publish.member'
      and (
        select count(*)
        from jsonb_array_elements(coalesce(connection.selected_assets, '[]'::jsonb)) asset
        where asset ->> 'kind' = 'linkedin_member'
          and nullif(asset ->> 'id', '') is not null
      ) = 1
      and p.status in ('queued', 'failed')
      and p.attempts < 6
      and coalesce(p.next_attempt_at, p.scheduled_for, p.created_at) <= now()
      and (p.locked_at is null or p.locked_at < now() - interval '10 minutes')
    order by coalesce(p.scheduled_for, p.created_at), p.created_at
    for update of p skip locked
    limit max_jobs
  ), claimed as (
    update public.content_publications p
    set status = 'publishing',
        attempts = p.attempts + 1,
        last_attempt_at = now(),
        locked_at = now(),
        lock_token = gen_random_uuid(),
        last_error = null
    from claimable c
    where p.id = c.id
    returning p.*
  )
  select * from claimed;
end;
$$;

revoke all on function public.claim_content_linkedin_publications(integer) from public, anon, authenticated;
grant execute on function public.claim_content_linkedin_publications(integer) to service_role;

do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job
  from cron.job
  where jobname = 'orbit-content-engine-linkedin-worker'
  limit 1;

  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;
end
$$;

select cron.schedule(
  'orbit-content-engine-linkedin-worker',
  '*/5 * * * *',
  $linkedin_worker$
  with target as (
    select private.content_engine_runtime_base_url() as base_url
  ), secret as (
    select decrypted_secret
    from vault.decrypted_secrets
    where name = 'orbit_content_engine_worker_secret'
    limit 1
  )
  select net.http_post(
    url := target.base_url || '/api/internal/content-engine-linkedin-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || secret.decrypted_secret
    ),
    body := '{"source":"pg_cron","version":1,"provider":"linkedin"}'::jsonb,
    timeout_milliseconds := 120000
  )
  from target
  cross join secret
  where target.base_url is not null
    and secret.decrypted_secret is not null;
  $linkedin_worker$
);

comment on function public.claim_content_linkedin_publications(integer) is
  'Service-role-only atomic claim for due, founder-approved LinkedIn member posts with a verified connection capability.';
