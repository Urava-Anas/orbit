-- Atomic review-stage editing for Content Engine.
-- The draft mutation, generated-visual invalidation and stale publication cancellation
-- must commit together so a concurrent approval cannot leave mismatched copy/media.

create or replace function public.edit_content_review_item(
  p_workspace_id uuid,
  p_content_id uuid,
  p_title text,
  p_hook text,
  p_body text,
  p_cta text,
  p_media_brief text
)
returns table (
  content_id uuid,
  batch_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  caller uuid := auth.uid();
  current_status text;
  current_batch uuid;
begin
  if caller is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not private.is_workspace_admin(p_workspace_id)
     or not private.orbit_workspace_can_write(p_workspace_id) then
    raise exception 'Content edit permission denied' using errcode = '42501';
  end if;

  if char_length(trim(coalesce(p_title, ''))) < 2
     or char_length(p_title) > 180
     or char_length(trim(coalesce(p_body, ''))) < 10
     or char_length(p_body) > 8000
     or char_length(coalesce(p_hook, '')) > 500
     or char_length(coalesce(p_cta, '')) > 500
     or char_length(coalesce(p_media_brief, '')) > 1500 then
    raise exception 'Content edit validation failed' using errcode = '22023';
  end if;

  select d.status, d.batch_id
    into current_status, current_batch
  from public.content_drafts d
  where d.workspace_id = p_workspace_id
    and d.id = p_content_id
  for update;

  if current_status is null then
    raise exception 'Content item not found' using errcode = 'P0002';
  end if;
  if current_status not in ('draft', 'review') then
    raise exception 'Only review-stage content can be edited' using errcode = '55000';
  end if;

  update public.content_drafts
  set title = trim(p_title),
      hook = nullif(trim(coalesce(p_hook, '')), ''),
      body = trim(p_body),
      cta = nullif(trim(coalesce(p_cta, '')), ''),
      media_brief = nullif(trim(coalesce(p_media_brief, '')), ''),
      status = 'review',
      approved_at = null,
      approved_by = null,
      rejection_reason = null
  where workspace_id = p_workspace_id
    and id = p_content_id;

  update public.content_assets
  set status = 'archived'
  where workspace_id = p_workspace_id
    and content_id = p_content_id
    and source = 'generated'
    and asset_type = 'image'
    and status in ('pending', 'generating', 'ready');

  update public.content_publications
  set status = 'cancelled',
      last_error = 'Content changed before approval.'
  where workspace_id = p_workspace_id
    and content_id = p_content_id
    and status <> 'published';

  insert into public.content_review_events (
    workspace_id,
    batch_id,
    content_id,
    event_type,
    actor_id,
    details
  ) values (
    p_workspace_id,
    current_batch,
    p_content_id,
    'content_edited',
    caller,
    jsonb_build_object(
      'approval_reset', true,
      'generated_visual_invalidated', true,
      'mutation', 'atomic_review_edit'
    )
  );

  return query select p_content_id, current_batch;
end;
$$;

revoke all on function public.edit_content_review_item(uuid, uuid, text, text, text, text, text) from public, anon;
grant execute on function public.edit_content_review_item(uuid, uuid, text, text, text, text, text) to authenticated;

comment on function public.edit_content_review_item(uuid, uuid, text, text, text, text, text) is
  'Workspace-admin-only atomic edit of review-stage content, including generated visual invalidation and stale publication cancellation.';
