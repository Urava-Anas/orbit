-- Final security hardening: make server-only RLS intent explicit and machine-auditable.
drop policy if exists integration_oauth_states_deny_user_jwts on public.integration_oauth_states;
create policy integration_oauth_states_deny_user_jwts
  on public.integration_oauth_states
  for all to anon, authenticated
  using (false)
  with check (false);

drop policy if exists orbit_platform_admins_deny_user_jwts on public.orbit_platform_admins;
create policy orbit_platform_admins_deny_user_jwts
  on public.orbit_platform_admins
  for all to anon, authenticated
  using (false)
  with check (false);

drop policy if exists orbit_scheduler_invocations_deny_user_jwts on public.orbit_scheduler_invocations;
create policy orbit_scheduler_invocations_deny_user_jwts
  on public.orbit_scheduler_invocations
  for all to anon, authenticated
  using (false)
  with check (false);
