-- Atomic daily-generation lease for Content Engine.
-- Prevents duplicate AI calls/draft insertion when manual and scheduled generation race.

alter table public.content_batches
  add column if not exists generation_lock_token uuid,
  add column if not exists generation_locked_at timestamptz;

create or replace function public.claim_content_batch_generation(
  p_workspace_id uuid,
  p_batch_date date
)
returns table (
  batch_id uuid,
  lock_token uuid,
  claimed boolean,
  reused boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  caller uuid := auth.uid();
  caller_role text := coalesce(auth.role(), '');
  existing_id uuid;
  existing_status text;
  existing_lock uuid;
  existing_locked_at timestamptz;
  draft_count bigint;
  next_lock uuid := gen_random_uuid();
begin
  if not private.orbit_workspace_can_write(p_workspace_id) then
    raise exception 'Content generation is unavailable for this workspace' using errcode = '42501';
  end if;

  if caller_role <> 'service_role' then
    if caller is null then
      raise exception 'Authentication required' using errcode = '42501';
    end if;
    if not private.is_workspace_admin(p_workspace_id) then
      raise exception 'Content generation permission denied' using errcode = '42501';
    end if;
  end if;

  select b.id, b.status, b.generation_lock_token, b.generation_locked_at
    into existing_id, existing_status, existing_lock, existing_locked_at
  from public.content_batches b
  where b.workspace_id = p_workspace_id
    and b.batch_date = p_batch_date
  for update;

  if existing_id is null then
    insert into public.content_batches (
      workspace_id,
      batch_date,
      status,
      generation_lock_token,
      generation_locked_at,
      created_by
    ) values (
      p_workspace_id,
      p_batch_date,
      'running',
      next_lock,
      now(),
      caller
    )
    returning id into existing_id;

    return query select existing_id, next_lock, true, false;
    return;
  end if;

  select count(*) into draft_count
  from public.content_drafts d
  where d.workspace_id = p_workspace_id
    and d.batch_id = existing_id;

  if draft_count > 0 then
    return query select existing_id, null::uuid, false, true;
    return;
  end if;

  if existing_status = 'running'
     and existing_lock is not null
     and existing_locked_at is not null
     and existing_locked_at > now() - interval '10 minutes' then
    return query select existing_id, existing_lock, false, false;
    return;
  end if;

  update public.content_batches
  set status = 'running',
      generation_lock_token = next_lock,
      generation_locked_at = now(),
      generated_at = null,
      approved_at = null,
      approved_by = null
  where id = existing_id
    and workspace_id = p_workspace_id;

  return query select existing_id, next_lock, true, false;
end;
$$;

revoke all on function public.claim_content_batch_generation(uuid, date) from public, anon;
grant execute on function public.claim_content_batch_generation(uuid, date) to authenticated, service_role;

comment on function public.claim_content_batch_generation(uuid, date) is
  'Atomic lease for one Content Engine generation per workspace/day. Workspace admins and the service-role scheduler may claim; expired/read-only workspaces fail closed.';
