-- One-time scheduler credentials bridge Supabase Cron/Edge to the Vercel worker
-- without requiring the two runtimes to share an application secret.

create table if not exists public.orbit_scheduler_invocations (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint orbit_scheduler_invocations_token_hash_check check (char_length(token_hash) = 64),
  constraint orbit_scheduler_invocations_expiry_check check (expires_at > created_at)
);

create index if not exists orbit_scheduler_invocations_pending_idx
  on public.orbit_scheduler_invocations(expires_at,created_at)
  where used_at is null;

alter table public.orbit_scheduler_invocations enable row level security;
revoke all on table public.orbit_scheduler_invocations from anon, authenticated;
grant select,insert,update,delete on table public.orbit_scheduler_invocations to service_role;
