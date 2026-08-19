-- Urava Production Standard v1: least privilege, atomic quotas and scale indexes.

create table if not exists public.orbit_runtime_config (
  key text primary key check (key ~ '^[a-z0-9_]{2,80}$'),
  value text not null check (length(value) between 1 and 2000),
  updated_at timestamptz not null default now()
);

alter table public.orbit_runtime_config enable row level security;
revoke all on public.orbit_runtime_config from public, anon, authenticated;
grant select, insert, update, delete on public.orbit_runtime_config to service_role;

drop policy if exists orbit_runtime_config_deny_user_jwts on public.orbit_runtime_config;
create policy orbit_runtime_config_deny_user_jwts
on public.orbit_runtime_config
for all
to anon, authenticated
using (false)
with check (false);

create table if not exists private.orbit_rate_limit_buckets (
  scope text not null check (scope ~ '^[a-z0-9_.:-]{2,100}$'),
  subject_hash text not null check (subject_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0),
  primary key (scope, subject_hash, window_started_at)
);

create or replace function public.consume_orbit_rate_limit(
  p_scope text,
  p_subject_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns table(allowed boolean, remaining integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = ''
set statement_timeout = '3s'
as $$
declare
  v_window timestamptz;
  v_count integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_scope is null or p_scope !~ '^[a-z0-9_.:-]{2,100}$' then
    raise exception 'invalid rate limit scope' using errcode = '22023';
  end if;
  if p_subject_hash is null or p_subject_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid rate limit subject' using errcode = '22023';
  end if;
  if p_limit < 1 or p_limit > 10000 or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'invalid rate limit bounds' using errcode = '22023';
  end if;

  v_window := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds
  );

  insert into private.orbit_rate_limit_buckets(scope, subject_hash, window_started_at, request_count)
  values (p_scope, p_subject_hash, v_window, 1)
  on conflict (scope, subject_hash, window_started_at)
  do update set request_count = private.orbit_rate_limit_buckets.request_count + 1
  returning request_count into v_count;

  delete from private.orbit_rate_limit_buckets
  where window_started_at < clock_timestamp() - interval '2 days';

  return query select
    v_count <= p_limit,
    greatest(p_limit - v_count, 0),
    v_window + make_interval(secs => p_window_seconds);
end;
$$;

revoke all on function public.consume_orbit_rate_limit(text,text,integer,integer) from public, anon, authenticated;
grant execute on function public.consume_orbit_rate_limit(text,text,integer,integer) to service_role;

-- Anonymous clients never need direct table access. Public certificate verification uses a reviewed RPC.
revoke all privileges on all tables in schema public from anon;

-- Application clients need only row operations. Schema/maintenance capabilities stay server-side.
revoke truncate, references, trigger on all tables in schema public from authenticated;

-- Lock server-only ledgers explicitly even if future grants change.
revoke all on public.integration_oauth_states from anon, authenticated;
revoke all on public.orbit_action_keys from anon, authenticated;
revoke all on public.orbit_platform_admins from anon, authenticated;
revoke all on public.orbit_scheduler_invocations from anon, authenticated;
revoke all on public.orbit_runtime_config from anon, authenticated;

-- Prevent future tables created by the migration owner from inheriting maintenance privileges.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke truncate, references, trigger on tables from authenticated;

-- Missing foreign-key/index coverage discovered by the production audit.
create index if not exists foundry_level_resources_workspace_student_idx
  on public.foundry_level_resources(workspace_id, student_id);
create index if not exists foundry_studio_assignments_project_id_idx
  on public.foundry_studio_assignments(project_id);
create index if not exists integration_connections_connected_by_idx
  on public.integration_connections(connected_by);
create index if not exists lead_source_assets_created_by_idx
  on public.lead_source_assets(created_by);
create index if not exists leads_workspace_source_asset_idx
  on public.leads(workspace_id, source_asset_id);

comment on table public.orbit_runtime_config is
  'Environment-scoped non-secret runtime endpoints. Service role only.';
comment on function public.consume_orbit_rate_limit(text,text,integer,integer) is
  'Atomic server-only fixed-window rate limiter for Orbit public and expensive endpoints.';
