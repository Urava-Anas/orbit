-- Atomically lease one due Stage 4 action to the trusted service-role worker.
-- Client roles cannot execute this function.

create or replace function public.claim_stage4_external_action()
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_action_id uuid;
begin
  select r.id
  into v_action_id
  from public.orbit_external_action_requests r
  join public.orbit_autopilot_configs c
    on c.workspace_id = r.workspace_id
  where r.status in ('queued','failed')
    and r.scheduled_at <= now()
    and (r.lock_expires_at is null or r.lock_expires_at < now())
    and c.state in ('running','degraded')
  order by r.scheduled_at asc, r.created_at asc
  for update of r skip locked
  limit 1;

  if v_action_id is null then
    return null;
  end if;

  update public.orbit_external_action_requests
  set locked_at = now(),
      lock_expires_at = now() + interval '60 seconds'
  where id = v_action_id;

  return v_action_id;
end;
$$;

revoke all on function public.claim_stage4_external_action() from public;
revoke all on function public.claim_stage4_external_action() from anon;
revoke all on function public.claim_stage4_external_action() from authenticated;
grant execute on function public.claim_stage4_external_action() to service_role;
