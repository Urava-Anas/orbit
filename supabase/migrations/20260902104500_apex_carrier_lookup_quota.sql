-- Prevent dispatcher lookups from becoming an accidental unbounded fan-out to
-- federal public sources. The authenticated user's identity is derived inside
-- the database function; callers cannot spend another user's quota.

create table if not exists public.apex_carrier_lookup_quota (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  window_started_at timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

alter table public.apex_carrier_lookup_quota enable row level security;
revoke all on table public.apex_carrier_lookup_quota from anon, authenticated;
grant select, insert, update, delete on table public.apex_carrier_lookup_quota to service_role;

create or replace function public.consume_apex_carrier_lookup_quota(
  p_workspace_id uuid,
  p_limit integer default 20,
  p_window_seconds integer default 60
)
returns table(allowed boolean, remaining integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := now();
  v_window interval;
  v_row public.apex_carrier_lookup_quota%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if p_limit < 1 or p_limit > 120 then
    raise exception 'Invalid lookup limit.' using errcode = '22023';
  end if;

  if p_window_seconds < 10 or p_window_seconds > 3600 then
    raise exception 'Invalid lookup window.' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = v_user_id
  ) then
    raise exception 'Workspace access denied.' using errcode = '42501';
  end if;

  v_window := make_interval(secs => p_window_seconds);

  insert into public.apex_carrier_lookup_quota (
    workspace_id, user_id, window_started_at, request_count, updated_at
  ) values (
    p_workspace_id, v_user_id, v_now, 0, v_now
  )
  on conflict (workspace_id, user_id) do nothing;

  select *
    into v_row
  from public.apex_carrier_lookup_quota
  where workspace_id = p_workspace_id
    and user_id = v_user_id
  for update;

  if v_row.window_started_at + v_window <= v_now then
    update public.apex_carrier_lookup_quota
    set window_started_at = v_now,
        request_count = 1,
        updated_at = v_now
    where workspace_id = p_workspace_id
      and user_id = v_user_id
    returning * into v_row;

    allowed := true;
    remaining := greatest(0, p_limit - 1);
    reset_at := v_now + v_window;
    return next;
    return;
  end if;

  if v_row.request_count >= p_limit then
    allowed := false;
    remaining := 0;
    reset_at := v_row.window_started_at + v_window;
    return next;
    return;
  end if;

  update public.apex_carrier_lookup_quota
  set request_count = request_count + 1,
      updated_at = v_now
  where workspace_id = p_workspace_id
    and user_id = v_user_id
  returning * into v_row;

  allowed := true;
  remaining := greatest(0, p_limit - v_row.request_count);
  reset_at := v_row.window_started_at + v_window;
  return next;
end;
$$;

revoke all on function public.consume_apex_carrier_lookup_quota(uuid,integer,integer)
  from public, anon;
grant execute on function public.consume_apex_carrier_lookup_quota(uuid,integer,integer)
  to authenticated;

comment on function public.consume_apex_carrier_lookup_quota(uuid,integer,integer) is
  'Workspace-member-bound rate limiter for Carrier 360 lookups. The caller identity is auth.uid(), never a request parameter.';
