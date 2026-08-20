create or replace function public.consume_lead_autocomplete_rate_limit(
  p_workspace_id uuid,
  p_limit integer default 60,
  p_window_seconds integer default 60
)
returns table(allowed boolean, remaining integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = ''
set statement_timeout = '3s'
as $$
declare
  v_uid uuid;
  v_subject_hash text;
  v_window timestamptz;
  v_count integer;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_workspace_id is null or not private.is_workspace_member(p_workspace_id) then
    raise exception 'workspace membership required' using errcode = '42501';
  end if;
  if p_limit < 1 or p_limit > 300 or p_window_seconds < 10 or p_window_seconds > 3600 then
    raise exception 'invalid rate limit bounds' using errcode = '22023';
  end if;

  v_subject_hash :=
    pg_catalog.md5(p_workspace_id::text || ':' || v_uid::text) ||
    pg_catalog.md5('lead.autocomplete:' || v_uid::text || ':' || p_workspace_id::text);
  v_window := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds
  );

  insert into private.orbit_rate_limit_buckets(scope, subject_hash, window_started_at, request_count)
  values ('lead.autocomplete', v_subject_hash, v_window, 1)
  on conflict (scope, subject_hash, window_started_at)
  do update set request_count = private.orbit_rate_limit_buckets.request_count + 1
  returning request_count into v_count;

  return query select
    v_count <= p_limit,
    greatest(p_limit - v_count, 0),
    v_window + make_interval(secs => p_window_seconds);
end;
$$;

revoke all on function public.consume_lead_autocomplete_rate_limit(uuid, integer, integer) from public, anon;
grant execute on function public.consume_lead_autocomplete_rate_limit(uuid, integer, integer) to authenticated;

comment on function public.consume_lead_autocomplete_rate_limit(uuid, integer, integer) is
  'Authenticated workspace-scoped quota for Lead Finder place autocomplete; avoids dependence on the platform service credential.';
