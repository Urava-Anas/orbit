-- Phase 1, step 1 of the Relay credential boundary hardening.
--
-- The application now performs decrypted credential reads only from trusted
-- server code via the Supabase service-role client. Keep the authenticated
-- grant temporarily so this migration can be applied before the application
-- deployment without breaking the currently-running Relay release.
--
-- After the new application release is verified in production, a follow-up
-- migration must revoke EXECUTE from authenticated.

grant execute on function public.orbit_relay_get_credential(uuid) to service_role;
