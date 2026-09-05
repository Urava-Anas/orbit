-- Instagram delivery foundation: private draft media, public publish media, and atomic queue claims.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('content-engine-drafts', 'content-engine-drafts', false, 10485760, array['image/jpeg','image/png','image/webp']),
  ('content-engine-publish', 'content-engine-publish', true, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.content_publications
  add column if not exists provider_container_id text,
  add column if not exists next_attempt_at timestamptz,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists locked_at timestamptz,
  add column if not exists lock_token uuid,
  add column if not exists provider_response jsonb not null default '{}'::jsonb;

create index if not exists content_publications_due_idx
  on public.content_publications(status, next_attempt_at, scheduled_for)
  where status in ('queued','failed');

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
    where p.provider = 'meta'
      and p.status in ('queued','failed')
      and p.attempts < 6
      and coalesce(p.next_attempt_at, p.scheduled_for, p.created_at) <= now()
      and (p.locked_at is null or p.locked_at < now() - interval '10 minutes')
    order by coalesce(p.scheduled_for, p.created_at), p.created_at
    for update skip locked
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

create or replace function private.enforce_content_publication_media_readiness()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  draft_channel text;
  has_ready_asset boolean;
begin
  if new.status not in ('queued', 'publishing') then
    return new;
  end if;

  select channel
  into draft_channel
  from public.content_drafts
  where id = new.content_id
    and workspace_id = new.workspace_id;

  if draft_channel not in ('instagram', 'tiktok') then
    return new;
  end if;

  select exists (
    select 1
    from public.content_assets asset
    where asset.workspace_id = new.workspace_id
      and asset.content_id = new.content_id
      and asset.status = 'ready'
      and asset.asset_type in ('image', 'video')
      and asset.public_url is not null
  ) into has_ready_asset;

  if not has_ready_asset then
    new.status := 'blocked';
    new.last_error := case
      when draft_channel = 'instagram' then 'Instagram requires an approved public image or video asset before automatic publishing.'
      else 'TikTok requires an approved public image or video asset before automatic publishing.'
    end;
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_content_publication_media_readiness() from public, anon, authenticated;

comment on function public.claim_content_publications(integer) is
  'Service-role-only atomic claim for due Content Engine publication jobs using SKIP LOCKED.';
