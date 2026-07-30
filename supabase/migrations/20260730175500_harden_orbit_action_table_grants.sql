-- Explicitly remove Supabase default table grants from Orbit action tables.
-- All writes occur through SECURITY DEFINER RPCs; founders may read call receipts via RLS.

revoke all privileges on table public.orbit_action_keys
from public, anon, authenticated;

revoke all privileges on table public.orbit_action_calls
from public, anon, authenticated;

grant select on table public.orbit_action_calls to authenticated;
