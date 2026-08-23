alter table public.orbit_mailboxes
  add column if not exists sync_cursor_uid bigint,
  add column if not exists last_connection_test_at timestamptz,
  add column if not exists connection_health text not null default 'unknown'
    check (connection_health in ('unknown','healthy','degraded','failed')),
  add column if not exists is_primary boolean not null default false;

create unique index if not exists orbit_mailboxes_one_primary_per_workspace
  on public.orbit_mailboxes(workspace_id)
  where is_primary;

create table if not exists public.orbit_mailbox_credentials (
  mailbox_id uuid primary key references public.orbit_mailboxes(id) on delete cascade,
  username text not null,
  encrypted_password text not null,
  provider text not null default 'namecheap_private_email',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.orbit_mailbox_credentials enable row level security;
revoke all on table public.orbit_mailbox_credentials from public, anon, authenticated;
grant all on table public.orbit_mailbox_credentials to service_role;

create policy orbit_mailboxes_delete_admin
  on public.orbit_mailboxes
  for delete to authenticated
  using (
    (select private.is_workspace_admin(workspace_id))
    and (select private.orbit_workspace_can_write(workspace_id))
  );

with ranked as (
  select id, workspace_id,
    row_number() over (partition by workspace_id order by created_at asc, id asc) as rn
  from public.orbit_mailboxes
)
update public.orbit_mailboxes m
set is_primary = true
from ranked r
where m.id = r.id and r.rn = 1
  and not exists (
    select 1 from public.orbit_mailboxes existing
    where existing.workspace_id = m.workspace_id and existing.is_primary
  );