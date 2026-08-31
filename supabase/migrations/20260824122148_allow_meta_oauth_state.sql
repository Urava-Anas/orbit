-- Restore the production OAuth-state provider expansion applied for Meta connect.
alter table public.integration_oauth_states
  drop constraint if exists integration_oauth_states_provider_check;

alter table public.integration_oauth_states
  add constraint integration_oauth_states_provider_check
  check (provider in ('github', 'vercel', 'meta'));
