-- Reconcile OAuth provider constraints after the later Meta-only compatibility migration.
-- Keep the server-only one-time OAuth ledger aligned with the reviewed provider contract
-- used by Content Engine and integration-connections.ts.

alter table public.integration_oauth_states
  drop constraint if exists integration_oauth_states_provider_check;

alter table public.integration_oauth_states
  add constraint integration_oauth_states_provider_check
  check (provider in (
    'github',
    'vercel',
    'google_search_console',
    'google_analytics',
    'meta',
    'linkedin',
    'tiktok'
  ));

alter table public.integration_connections
  drop constraint if exists integration_connections_provider_check;

alter table public.integration_connections
  add constraint integration_connections_provider_check
  check (provider in (
    'github',
    'vercel',
    'google_search_console',
    'google_analytics',
    'meta',
    'instagram',
    'linkedin',
    'tiktok'
  ));
