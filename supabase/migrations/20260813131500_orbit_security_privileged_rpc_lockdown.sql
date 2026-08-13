-- Final security hardening: privileged Stage 4 RPCs must never be callable by public/user JWT roles.
revoke all on function public.consume_stage4_scheduler_invocation(uuid,text) from public, anon, authenticated;
grant execute on function public.consume_stage4_scheduler_invocation(uuid,text) to service_role;

revoke all on function public.set_stage4_provider_secret(uuid,text,text) from public, anon, authenticated;
grant execute on function public.set_stage4_provider_secret(uuid,text,text) to service_role;

-- Explicitly keep server-only security tables invisible to user JWTs.
revoke all on table public.orbit_scheduler_invocations from public, anon, authenticated;
revoke all on table public.orbit_platform_admins from public, anon, authenticated;
revoke all on table public.integration_oauth_states from public, anon, authenticated;
