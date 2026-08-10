create or replace function public.consume_stage4_scheduler_invocation(
  p_id uuid,
  p_token text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  consumed_id uuid;
begin
  if p_id is null or p_token is null or p_token !~ '^[0-9a-fA-F]{64}$' then
    return false;
  end if;

  update public.orbit_scheduler_invocations
  set used_at = now()
  where id = p_id
    and used_at is null
    and expires_at > now()
    and token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
  returning id into consumed_id;

  return consumed_id is not null;
end;
$$;

revoke all on function public.consume_stage4_scheduler_invocation(uuid,text) from public;
grant execute on function public.consume_stage4_scheduler_invocation(uuid,text) to anon, authenticated, service_role;
