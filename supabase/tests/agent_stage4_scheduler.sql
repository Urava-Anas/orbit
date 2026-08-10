-- Stage 4 scheduler credential acceptance test.
-- Proves valid single use and replay rejection without leaving synthetic state.

begin;

do $$
declare
  invocation_id uuid;
  test_token text := repeat('a',64);
  first_ok boolean;
  replay_ok boolean;
begin
  insert into public.orbit_scheduler_invocations(token_hash,expires_at)
  values(encode(extensions.digest(test_token,'sha256'),'hex'),now()+interval '2 minutes')
  returning id into invocation_id;

  select public.consume_stage4_scheduler_invocation(invocation_id,test_token) into first_ok;
  select public.consume_stage4_scheduler_invocation(invocation_id,test_token) into replay_ok;

  if first_ok is distinct from true then
    raise exception 'Stage 4 scheduler valid one-time token was rejected';
  end if;
  if replay_ok is distinct from false then
    raise exception 'Stage 4 scheduler token replay was accepted';
  end if;
end
$$;

rollback;
