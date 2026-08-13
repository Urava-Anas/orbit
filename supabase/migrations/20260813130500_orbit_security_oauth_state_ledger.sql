-- Final security hardening: OAuth/App state tokens become one-time, short-lived capabilities.
create table if not exists public.integration_oauth_states (
  state_hash text primary key check (state_hash ~ '^[a-f0-9]{64}$'),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('github','vercel')),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create index if not exists integration_oauth_states_workspace_idx
  on public.integration_oauth_states(workspace_id, expires_at desc);
create index if not exists integration_oauth_states_user_idx
  on public.integration_oauth_states(user_id, expires_at desc);
create index if not exists integration_oauth_states_expiry_idx
  on public.integration_oauth_states(expires_at)
  where consumed_at is null;

alter table public.integration_oauth_states enable row level security;
revoke all on table public.integration_oauth_states from anon, authenticated;

comment on table public.integration_oauth_states is
  'Server-only one-time ledger for signed OAuth/App state values. Only SHA-256 digests are persisted.';
