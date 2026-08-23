-- Content Engine production guardrails.
-- The database independently enforces founder approval, workspace publishing state,
-- provider/channel compatibility, and media readiness before a job can be claimed.

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

  if new.provider <> 'meta' or draft_channel not in ('instagram', 'facebook') then
    new.status := 'blocked';
    new.last_error := case
      when draft_channel = 'linkedin' then 'LinkedIn automatic publishing is not verified yet.'
      when draft_channel = 'tiktok' then 'TikTok automatic publishing is not verified yet.'
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

drop trigger if exists content_publications_media_readiness_guard on public.content_publications;
drop trigger if exists content_publications_delivery_readiness_guard on public.content_publications;
create trigger content_publications_delivery_readiness_guard
before insert or update of status, content_id, provider
on public.content_publications
for each row
execute function private.enforce_content_publication_delivery_readiness();

create or replace function public.claim_content_publications(max_jobs integer default 5)
returns setof public.content_publications
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if max_jobs < 1 or max_jobs > 20 then
    raise exception 'max_jobs must be between 1 and 20';
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
    where p.provider = 'meta'
      and draft.channel in ('instagram', 'facebook')
      and draft.status = 'approved'
      and profile.publishing_enabled = true
      and p.status in ('queued','failed')
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

revoke all on function public.claim_content_publications(integer) from public, anon, authenticated;
grant execute on function public.claim_content_publications(integer) to service_role;

comment on function private.enforce_content_publication_delivery_readiness() is
  'Fail-closed Content Engine queue gate for approval, workspace kill switch, supported channel/provider pairs, and Instagram media readiness.';
comment on function public.claim_content_publications(integer) is
  'Service-role-only atomic claim for founder-approved, due Meta publication jobs on verified automatic channels.';
