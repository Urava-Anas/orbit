-- Recover Apex server-only integration credential storage.
create table if not exists public.apex_integration_credentials (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider_key text not null,
  credential_type text not null default 'bearer_token',
  vault_secret_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, provider_key)
);

alter table public.apex_integration_credentials enable row level security;

create or replace function public.apex_service_store_integration_credential(
  p_workspace_id uuid,
  p_provider_key text,
  p_secret text,
  p_credential_type text default 'bearer_token'
)
returns void
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare
  v_secret_id uuid;
  v_exists boolean;
begin
  select exists(
    select 1 from public.apex_integrations
    where workspace_id = p_workspace_id and provider_key = p_provider_key
  ) into v_exists;

  if not v_exists then
    raise exception 'Integration not found.' using errcode = 'P0002';
  end if;

  if p_provider_key not in ('carrier_source') then
    raise exception 'Credential storage is not enabled for this provider.' using errcode = '22023';
  end if;

  if length(coalesce(p_secret, '')) < 8 or length(p_secret) > 4000 then
    raise exception 'Invalid integration credential.' using errcode = '22023';
  end if;

  select vault_secret_id into v_secret_id
  from public.apex_integration_credentials
  where workspace_id = p_workspace_id and provider_key = p_provider_key;

  if v_secret_id is null then
    v_secret_id := vault.create_secret(
      p_secret,
      'apex-integration-' || p_workspace_id::text || '-' || p_provider_key,
      'Apex integration credential',
      null
    );
  else
    perform vault.update_secret(v_secret_id, p_secret, null, null, null);
  end if;

  insert into public.apex_integration_credentials (
    workspace_id, provider_key, credential_type, vault_secret_id, updated_at
  ) values (
    p_workspace_id, p_provider_key, coalesce(nullif(p_credential_type,''), 'bearer_token'), v_secret_id, now()
  )
  on conflict (workspace_id, provider_key) do update
    set credential_type = excluded.credential_type,
        vault_secret_id = excluded.vault_secret_id,
        updated_at = now();
end;
$$;

create or replace function public.apex_service_get_integration_credential(
  p_workspace_id uuid,
  p_provider_key text
)
returns table(secret text, credential_type text)
language sql
security definer
set search_path = public, vault, pg_temp
as $$
  select v.decrypted_secret, c.credential_type
  from public.apex_integration_credentials c
  join vault.decrypted_secrets v on v.id = c.vault_secret_id
  where c.workspace_id = p_workspace_id and c.provider_key = p_provider_key
  limit 1;
$$;

create or replace function public.apex_service_delete_integration_credential(
  p_workspace_id uuid,
  p_provider_key text
)
returns void
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare
  v_secret_id uuid;
begin
  select vault_secret_id into v_secret_id
  from public.apex_integration_credentials
  where workspace_id = p_workspace_id and provider_key = p_provider_key;

  delete from public.apex_integration_credentials
  where workspace_id = p_workspace_id and provider_key = p_provider_key;

  if v_secret_id is not null then
    delete from vault.secrets where id = v_secret_id;
  end if;
end;
$$;

create or replace function public.apex_service_store_mailbox_credential(
  p_workspace_id uuid,
  p_mailbox_id uuid,
  p_username text,
  p_password text
)
returns void
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare
  v_address text;
  v_secret_id uuid;
begin
  select lower(address)
    into v_address
  from public.orbit_mailboxes
  where id = p_mailbox_id and workspace_id = p_workspace_id;

  if v_address is null then
    raise exception 'Mailbox not found.' using errcode = 'P0002';
  end if;

  if lower(trim(coalesce(p_username, ''))) <> v_address then
    raise exception 'Mailbox identity mismatch.' using errcode = '22023';
  end if;

  if length(coalesce(p_password, '')) < 1 or length(p_password) > 500 then
    raise exception 'Invalid mailbox credential.' using errcode = '22023';
  end if;

  select vault_secret_id into v_secret_id
  from public.orbit_mailbox_credentials
  where mailbox_id = p_mailbox_id;

  if v_secret_id is null then
    v_secret_id := vault.create_secret(
      p_password,
      'apex-mailbox-' || p_mailbox_id::text,
      'Apex Private Email mailbox credential',
      null
    );
  else
    perform vault.update_secret(v_secret_id, p_password, null, null, null);
  end if;

  insert into public.orbit_mailbox_credentials (
    mailbox_id, username, encrypted_password, provider, vault_secret_id, updated_at
  ) values (
    p_mailbox_id, v_address, null, 'namecheap_private_email', v_secret_id, now()
  )
  on conflict (mailbox_id) do update
    set username = excluded.username,
        encrypted_password = null,
        provider = excluded.provider,
        vault_secret_id = excluded.vault_secret_id,
        updated_at = now();

  update public.orbit_mailboxes
  set status = 'disconnected',
      connection_health = 'unknown',
      inbound_enabled = false,
      outbound_enabled = false,
      last_error = 'Credentials saved securely; IMAP/SMTP verification pending.',
      updated_at = now()
  where id = p_mailbox_id and workspace_id = p_workspace_id;
end;
$$;

create or replace function public.apex_service_delete_mailbox_credential(
  p_workspace_id uuid,
  p_mailbox_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare
  v_secret_id uuid;
begin
  select c.vault_secret_id into v_secret_id
  from public.orbit_mailboxes m
  join public.orbit_mailbox_credentials c on c.mailbox_id = m.id
  where m.id = p_mailbox_id and m.workspace_id = p_workspace_id;

  delete from public.orbit_mailbox_credentials
  where mailbox_id = p_mailbox_id;

  if v_secret_id is not null then
    delete from vault.secrets where id = v_secret_id;
  end if;

  update public.orbit_mailboxes
  set status = 'disconnected',
      connection_health = 'unknown',
      inbound_enabled = false,
      outbound_enabled = false,
      last_error = null,
      last_synced_at = null,
      updated_at = now()
  where id = p_mailbox_id and workspace_id = p_workspace_id;
end;
$$;

revoke all on function public.apex_service_store_integration_credential(uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.apex_service_get_integration_credential(uuid,text) from public, anon, authenticated;
revoke all on function public.apex_service_delete_integration_credential(uuid,text) from public, anon, authenticated;
revoke all on function public.apex_service_store_mailbox_credential(uuid,uuid,text,text) from public, anon, authenticated;
revoke all on function public.apex_service_delete_mailbox_credential(uuid,uuid) from public, anon, authenticated;

grant execute on function public.apex_service_store_integration_credential(uuid,text,text,text) to service_role;
grant execute on function public.apex_service_get_integration_credential(uuid,text) to service_role;
grant execute on function public.apex_service_delete_integration_credential(uuid,text) to service_role;
grant execute on function public.apex_service_store_mailbox_credential(uuid,uuid,text,text) to service_role;
grant execute on function public.apex_service_delete_mailbox_credential(uuid,uuid) to service_role;
