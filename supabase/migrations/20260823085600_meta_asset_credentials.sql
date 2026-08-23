-- Server-only per-asset credentials for provider workers.
-- Tokens are encrypted by Orbit before persistence and are never exposed through user-facing connection records.
create table if not exists public.integration_asset_credentials (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null check (provider in ('meta')),
  asset_id text not null check (char_length(asset_id) between 1 and 300),
  asset_kind text not null check (asset_kind in ('facebook_page')),
  credential_ciphertext text not null check (char_length(credential_ciphertext) between 20 and 20000),
  metadata jsonb not null default '{}'::jsonb,
  connected_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, provider, asset_id)
);

create index if not exists integration_asset_credentials_workspace_provider_idx
  on public.integration_asset_credentials(workspace_id, provider, asset_kind);

alter table public.integration_asset_credentials enable row level security;
revoke all on table public.integration_asset_credentials from anon, authenticated;

drop trigger if exists integration_asset_credentials_set_updated_at on public.integration_asset_credentials;
create trigger integration_asset_credentials_set_updated_at
before update on public.integration_asset_credentials
for each row execute function private.set_updated_at();

comment on table public.integration_asset_credentials is
  'Server-only encrypted provider asset credentials used by governed publishing workers. User JWTs have no table privileges.';
