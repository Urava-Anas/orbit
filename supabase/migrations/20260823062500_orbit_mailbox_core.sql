create table public.orbit_mailboxes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  address text not null,
  display_name text not null default '',
  provider text not null default 'imap_smtp',
  status text not null default 'disconnected' check (status in ('disconnected','connected','syncing','error')),
  inbound_enabled boolean not null default false,
  outbound_enabled boolean not null default false,
  provider_connection_ref text,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id,address)
);

create table public.orbit_mail_threads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  mailbox_id uuid not null references public.orbit_mailboxes(id) on delete cascade,
  subject text not null default '(no subject)',
  normalized_subject text not null default '',
  participant_emails text[] not null default '{}',
  folder text not null default 'inbox' check (folder in ('inbox','sent','drafts','archive','spam','trash')),
  is_unread boolean not null default true,
  is_starred boolean not null default false,
  business_context_type text,
  business_context_id uuid,
  latest_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.orbit_mail_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  mailbox_id uuid not null references public.orbit_mailboxes(id) on delete cascade,
  thread_id uuid not null references public.orbit_mail_threads(id) on delete cascade,
  direction text not null check (direction in ('inbound','outbound','draft')),
  provider_message_id text,
  internet_message_id text,
  in_reply_to text,
  from_address text not null,
  to_addresses text[] not null default '{}',
  cc_addresses text[] not null default '{}',
  bcc_addresses text[] not null default '{}',
  subject text not null default '(no subject)',
  body_text text not null default '',
  body_html text,
  attachments jsonb not null default '[]'::jsonb,
  status text not null default 'received' check (status in ('received','draft','queued','pending_approval','sending','sent','failed')),
  authority_level text not null default 'green' check (authority_level in ('green','amber','red')),
  external_action_request_id uuid references public.orbit_external_action_requests(id) on delete set null,
  sent_at timestamptz,
  received_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index orbit_mailboxes_workspace_idx on public.orbit_mailboxes(workspace_id);
create index orbit_mail_threads_workspace_latest_idx on public.orbit_mail_threads(workspace_id, latest_message_at desc);
create index orbit_mail_threads_mailbox_folder_idx on public.orbit_mail_threads(mailbox_id, folder, latest_message_at desc);
create index orbit_mail_messages_thread_created_idx on public.orbit_mail_messages(thread_id, created_at asc);
create unique index orbit_mail_messages_provider_unique on public.orbit_mail_messages(mailbox_id, provider_message_id) where provider_message_id is not null;

alter table public.orbit_mailboxes enable row level security;
alter table public.orbit_mail_threads enable row level security;
alter table public.orbit_mail_messages enable row level security;

create policy orbit_mailboxes_select_member on public.orbit_mailboxes for select to authenticated using ((select private.is_workspace_member(workspace_id)));
create policy orbit_mailboxes_insert_admin on public.orbit_mailboxes for insert to authenticated with check ((select private.is_workspace_admin(workspace_id)) and (select private.orbit_workspace_can_write(workspace_id)));
create policy orbit_mailboxes_update_admin on public.orbit_mailboxes for update to authenticated using ((select private.is_workspace_admin(workspace_id)) and (select private.orbit_workspace_can_write(workspace_id))) with check ((select private.is_workspace_admin(workspace_id)) and (select private.orbit_workspace_can_write(workspace_id)));
create policy orbit_mail_threads_select_member on public.orbit_mail_threads for select to authenticated using ((select private.is_workspace_member(workspace_id)));
create policy orbit_mail_threads_insert_member on public.orbit_mail_threads for insert to authenticated with check ((select private.is_workspace_member(workspace_id)) and (select private.orbit_workspace_can_write(workspace_id)));
create policy orbit_mail_threads_update_member on public.orbit_mail_threads for update to authenticated using ((select private.is_workspace_member(workspace_id)) and (select private.orbit_workspace_can_write(workspace_id))) with check ((select private.is_workspace_member(workspace_id)) and (select private.orbit_workspace_can_write(workspace_id)));
create policy orbit_mail_messages_select_member on public.orbit_mail_messages for select to authenticated using ((select private.is_workspace_member(workspace_id)));
create policy orbit_mail_messages_insert_member on public.orbit_mail_messages for insert to authenticated with check ((select private.is_workspace_member(workspace_id)) and (select private.orbit_workspace_can_write(workspace_id)));
create policy orbit_mail_messages_update_member on public.orbit_mail_messages for update to authenticated using ((select private.is_workspace_member(workspace_id)) and (select private.orbit_workspace_can_write(workspace_id))) with check ((select private.is_workspace_member(workspace_id)) and (select private.orbit_workspace_can_write(workspace_id)));

do $$
declare apex_id uuid;
begin
  select id into apex_id from public.workspaces where lower(name) like '%apex%' and lower(name) like '%dispatch%' limit 1;
  if apex_id is not null then
    insert into public.orbit_mailboxes(workspace_id,address,display_name,provider,status)
    values (apex_id,'info@apexlogisticsdispatch.com','Apex Logistics & Dispatch','namecheap_private_email','disconnected')
    on conflict (workspace_id,address) do nothing;
  end if;
end $$;
