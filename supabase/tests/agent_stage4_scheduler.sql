-- Stage 4 one-time service capability acceptance test.
-- Proves scoped single use, replay rejection and cross-purpose rejection.

begin;

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);

do $$
declare
  invocation_id uuid;
  provider_invocation_id uuid;
  test_token text := repeat('a',64);
  provider_token text := repeat('b',64);
  first_ok boolean;
  replay_ok boolean;
  wrong_purpose_ok boolean;
  provider_ok boolean;
begin
  insert into public.orbit_scheduler_invocations(token_hash,expires_at,purpose)
  values(
    encode(extensions.digest(test_token,'sha256'),'hex'),
    now()+interval '2 minutes',
    'autopilot_worker'
  )
  returning id into invocation_id;

  select public.consume_stage4_scheduler_invocation(
    invocation_id,
    test_token,
    'autopilot_worker'
  ) into first_ok;
  select public.consume_stage4_scheduler_invocation(
    invocation_id,
    test_token,
    'autopilot_worker'
  ) into replay_ok;

  if first_ok is distinct from true then
    raise exception 'Stage 4 scheduler valid one-time token was rejected';
  end if;
  if replay_ok is distinct from false then
    raise exception 'Stage 4 scheduler token replay was accepted';
  end if;

  insert into public.orbit_scheduler_invocations(token_hash,expires_at,purpose)
  values(
    encode(extensions.digest(provider_token,'sha256'),'hex'),
    now()+interval '2 minutes',
    'provider_reply'
  )
  returning id into provider_invocation_id;

  select public.consume_stage4_scheduler_invocation(
    provider_invocation_id,
    provider_token,
    'autopilot_worker'
  ) into wrong_purpose_ok;
  if wrong_purpose_ok is distinct from false then
    raise exception 'Provider reply capability was accepted by Autopilot worker scope';
  end if;

  select public.consume_stage4_scheduler_invocation(
    provider_invocation_id,
    provider_token,
    'provider_reply'
  ) into provider_ok;
  if provider_ok is distinct from true then
    raise exception 'Provider reply scoped capability was rejected';
  end if;
end
$$;

reset role;
rollback;
