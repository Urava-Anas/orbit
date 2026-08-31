-- Phase 1, step 1 of the Relay credential boundary hardening.
--
-- Decrypted Relay credential reads are performed only from trusted server code
-- through the Supabase service-role client. Keep the authenticated grant during
-- the staged cutover so the previously deployed Relay path remains compatible
-- until the server-only application release is verified.

grant execute on function public.orbit_relay_get_credential(uuid) to service_role;
