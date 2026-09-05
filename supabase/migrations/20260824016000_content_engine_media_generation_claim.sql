-- Atomic Instagram draft-media generation lease.
-- A parent draft row lock serializes competing workers, while stale generation
-- claims are quarantined so a crashed worker cannot block a post forever.

create or replace function public.claim_content_media_generation(
  p_workspace_id uuid,
  p_content_id uuid,
  p_prompt text,
  p_generation_metadata jsonb default '{}'::jsonb
)
returns table (
  asset_id uuid,
  claimed boolean,
  reused boolean,
  asset_status text
)
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  draft_channel text;
  draft_status text;
  existing_id uuid;
  existing_status text;
  existing_created_at timestamptz;
  new_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_prompt, ''))) < 10 or char_length(p_prompt) > 12000 then
    raise exception 'Media generation prompt is invalid' using errcode = '22023';
  end if;

  select d.channel, d.status
    into draft_channel, draft_status
  from public.content_drafts d
  where d.workspace_id = p_workspace_id
    and d.id = p_content_id
  for update;

  if draft_channel is null then
    raise exception 'Content item not found' using errcode = 'P0002';
  end if;
  if draft_channel <> 'instagram' then
    raise exception 'Automatic image generation is limited to Instagram drafts' using errcode = '22023';
  end if;
  if draft_status not in ('draft', 'review') then
    raise exception 'Media generation is allowed only while content awaits review' using errcode = '55000';
  end if;

  select a.id, a.status, a.created_at
    into existing_id, existing_status, existing_created_at
  from public.content_assets a
  where a.workspace_id = p_workspace_id
    and a.content_id = p_content_id
    and a.source = 'generated'
    and a.asset_type = 'image'
    and a.status in ('generating', 'ready')
  order by a.created_at desc
  limit 1
  for update;

  if existing_status = 'ready' then
    return query select existing_id, false, true, existing_status;
    return;
  end if;

  if existing_status = 'generating'
     and existing_created_at > now() - interval '10 minutes' then
    return query select existing_id, false, true, existing_status;
    return;
  end if;

  if existing_status = 'generating' then
    update public.content_assets
    set status = 'failed',
        generation_metadata = coalesce(generation_metadata, '{}'::jsonb)
          || jsonb_build_object('failed_at', now(), 'reason', 'stale_generation_lease')
    where id = existing_id
      and workspace_id = p_workspace_id
      and status = 'generating';
  end if;

  insert into public.content_assets (
    workspace_id,
    content_id,
    asset_type,
    source,
    status,
    mime_type,
    width,
    height,
    prompt,
    generation_metadata
  ) values (
    p_workspace_id,
    p_content_id,
    'image',
    'generated',
    'generating',
    'image/jpeg',
    1024,
    1024,
    p_prompt,
    coalesce(p_generation_metadata, '{}'::jsonb)
  )
  returning id into new_id;

  return query select new_id, true, false, 'generating'::text;
end;
$$;

revoke all on function public.claim_content_media_generation(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.claim_content_media_generation(uuid, uuid, text, jsonb) to service_role;

comment on function public.claim_content_media_generation(uuid, uuid, text, jsonb) is
  'Service-role-only atomic lease for one active generated Instagram image per review-stage content item; stale claims are failed before retry.';
