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
      and coalesce(asset.public_url, asset.storage_path) is not null
  ) into has_ready_asset;

  if not has_ready_asset then
    new.status := 'blocked';
    new.last_error := case
      when draft_channel = 'instagram' then 'Instagram requires a ready image or video asset before automatic publishing.'
      else 'TikTok requires a ready image or video asset before automatic publishing.'
    end;
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_content_publication_media_readiness() from public;
revoke all on function private.enforce_content_publication_media_readiness() from anon;
revoke all on function private.enforce_content_publication_media_readiness() from authenticated;

drop trigger if exists content_publications_media_readiness_guard on public.content_publications;
create trigger content_publications_media_readiness_guard
before insert or update of status, content_id
on public.content_publications
for each row
execute function private.enforce_content_publication_media_readiness();

comment on function private.enforce_content_publication_media_readiness() is
  'Fail-closed guard: Instagram and TikTok publication rows cannot enter queued/publishing state without a ready media asset.';
