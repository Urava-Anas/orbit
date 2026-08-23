create or replace function private.start_orbit_trial(workspace_name text)
returns table(workspace_id uuid, trial_ends_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  clean_name text := btrim(workspace_name);
  new_workspace_id uuid := gen_random_uuid();
  base_slug text;
  new_slug text;
  expires_at timestamptz;
  founder_workspace_count integer := 0;
  active_student_count integer := 0;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if clean_name is null or char_length(clean_name) < 2 or char_length(clean_name) > 80 then
    raise exception 'Workspace name must be between 2 and 80 characters' using errcode = '22023';
  end if;

  select count(*)::integer
  into founder_workspace_count
  from public.workspace_members wm
  where wm.user_id = current_user_id
    and wm.role in ('owner', 'admin');

  if founder_workspace_count > 0 then
    raise exception 'A founder workspace already exists for this account' using errcode = '23505';
  end if;

  select count(*)::integer
  into active_student_count
  from public.foundry_students fs
  where fs.auth_user_id = current_user_id
    and fs.lifecycle_status not in ('inactive', 'graduated', 'rejected');

  if active_student_count > 0 then
    raise exception 'A Foundry learner account cannot create a founder trial workspace' using errcode = '42501';
  end if;

  base_slug := trim(both '-' from regexp_replace(lower(clean_name), '[^a-z0-9]+', '-', 'g'));
  if base_slug = '' then
    base_slug := 'workspace';
  end if;
  new_slug := left(base_slug, 46) || '-' || left(replace(new_workspace_id::text, '-', ''), 8);

  insert into public.workspaces (id, name, slug, owner_id)
  values (new_workspace_id, clean_name, new_slug, current_user_id);

  insert into public.workspace_members (workspace_id, user_id, role)
  values (new_workspace_id, current_user_id, 'owner');

  select s.trial_ends_at
  into expires_at
  from public.orbit_workspace_subscriptions s
  where s.workspace_id = new_workspace_id;

  if expires_at is null then
    raise exception 'Trial subscription was not created' using errcode = 'P0001';
  end if;

  return query select new_workspace_id, expires_at;
end;
$$;

revoke execute on function private.start_orbit_trial(text) from public, anon;
grant execute on function private.start_orbit_trial(text) to authenticated;

create or replace function public.start_orbit_trial(workspace_name text)
returns table(workspace_id uuid, trial_ends_at timestamptz)
language sql
security invoker
set search_path = ''
as $$
  select * from private.start_orbit_trial(workspace_name);
$$;

revoke execute on function public.start_orbit_trial(text) from public, anon;
grant execute on function public.start_orbit_trial(text) to authenticated;
