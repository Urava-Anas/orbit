-- One-time service capabilities are not interchangeable between internal routes.
-- Existing scheduler producers remain compatible while new callers use the scoped RPC.

alter table public.orbit_scheduler_invocations
  add column if not exists purpose text not null default 'autopilot_worker';

alter table public.orbit_scheduler_invocations
  drop constraint if exists orbit_scheduler_invocations_purpose_check;
alter table public.orbit_scheduler_invocations
  add constraint orbit_scheduler_invocations_purpose_check
  check (purpose in ('autopilot_worker','provider_reply'));

create index if not exists orbit_scheduler_invocations_purpose_expiry_idx
  on public.orbit_scheduler_invocations(purpose, expires_at)
  where used_at is null;

create or replace function public.consume_stage4_scheduler_invocation(
  p_id uuid,
  p_token text,
  p_purpose text
)
returns boolean
language plpgsql
security definer
set search_path = ''
set statement_timeout = '3s'
as $$
declare
  consumed_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_id is null
     or p_token is null
     or p_token !~ '^[0-9a-fA-F]{64}$'
     or p_purpose not in ('autopilot_worker','provider_reply') then
    return false;
  end if;

  update public.orbit_scheduler_invocations
  set used_at = now()
  where id = p_id
    and purpose = p_purpose
    and used_at is null
    and expires_at > now()
    and token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
  returning id into consumed_id;

  return consumed_id is not null;
end;
$$;

-- Backward-compatible scheduler-only overload for the currently deployed worker.
create or replace function public.consume_stage4_scheduler_invocation(
  p_id uuid,
  p_token text
)
returns boolean
language plpgsql
security definer
set search_path = ''
set statement_timeout = '3s'
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  return public.consume_stage4_scheduler_invocation(p_id, p_token, 'autopilot_worker');
end;
$$;

revoke all on function public.consume_stage4_scheduler_invocation(uuid,text,text) from public, anon, authenticated;
revoke all on function public.consume_stage4_scheduler_invocation(uuid,text) from public, anon, authenticated;
grant execute on function public.consume_stage4_scheduler_invocation(uuid,text,text) to service_role;
grant execute on function public.consume_stage4_scheduler_invocation(uuid,text) to service_role;
