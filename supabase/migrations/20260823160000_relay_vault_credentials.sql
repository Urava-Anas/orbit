alter table public.orbit_mailbox_credentials
  add column if not exists vault_secret_id uuid;

alter table public.orbit_mailbox_credentials
  alter column encrypted_password drop not null;

create unique index if not exists orbit_mailbox_credentials_vault_secret_uidx
  on public.orbit_mailbox_credentials(vault_secret_id)
  where vault_secret_id is not null;

create or replace function public.orbit_relay_store_credential(
  p_mailbox_id uuid,
  p_username text,
  p_password text
)
returns void
language plpgsql
security definer
set search_path = public, private, vault, pg_temp
as $$
declare
  v_workspace_id uuid;
  v_address text;
  v_secret_id uuid;
begin
  select workspace_id, lower(address)
    into v_workspace_id, v_address
  from public.orbit_mailboxes
  where id = p_mailbox_id;

  if v_workspace_id is null then
    raise exception 'Mailbox not found.' using errcode = 'P0002';
  end if;

  if not private.is_workspace_admin(v_workspace_id) then
    raise exception 'Workspace admin access required.' using errcode = '42501';
  end if;

  if not private.orbit_workspace_can_write(v_workspace_id) then
    raise exception 'Workspace is read-only.' using errcode = '42501';
  end if;

  if lower(trim(coalesce(p_username, ''))) <> v_address then
    raise exception 'Mailbox identity mismatch.' using errcode = '22023';
  end if;

  if length(coalesce(p_password, '')) < 1 or length(p_password) > 500 then
    raise exception 'Invalid mailbox credential.' using errcode = '22023';
  end if;

  select vault_secret_id
    into v_secret_id
  from public.orbit_mailbox_credentials
  where mailbox_id = p_mailbox_id;

  if v_secret_id is null then
    v_secret_id := vault.create_secret(
      p_password,
      'orbit-relay-' || p_mailbox_id::text,
      'Orbit Relay mailbox credential',
      null
    );
  else
    perform vault.update_secret(v_secret_id, p_password, null, null, null);
  end if;

  insert into public.orbit_mailbox_credentials (
    mailbox_id,
    username,
    encrypted_password,
    provider,
    vault_secret_id,
    updated_at
  ) values (
    p_mailbox_id,
    v_address,
    null,
    'namecheap_private_email',
    v_secret_id,
    now()
  )
  on conflict (mailbox_id) do update
    set username = excluded.username,
        encrypted_password = null,
        provider = excluded.provider,
        vault_secret_id = excluded.vault_secret_id,
        updated_at = now();
end;
$$;

create or replace function public.orbit_relay_get_credential(p_mailbox_id uuid)
returns table(username text, password text)
language plpgsql
security definer
set search_path = public, private, vault, pg_temp
as $$
declare
  v_workspace_id uuid;
begin
  select workspace_id
    into v_workspace_id
  from public.orbit_mailboxes
  where id = p_mailbox_id;

  if v_workspace_id is null then
    raise exception 'Mailbox not found.' using errcode = 'P0002';
  end if;

  if not private.is_workspace_admin(v_workspace_id) then
    raise exception 'Workspace admin access required.' using errcode = '42501';
  end if;

  return query
  select c.username, v.decrypted_secret
  from public.orbit_mailbox_credentials c
  join vault.decrypted_secrets v on v.id = c.vault_secret_id
  where c.mailbox_id = p_mailbox_id
  limit 1;
end;
$$;

create or replace function public.orbit_relay_delete_credential(p_mailbox_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private, vault, pg_temp
as $$
declare
  v_workspace_id uuid;
  v_secret_id uuid;
begin
  select m.workspace_id, c.vault_secret_id
    into v_workspace_id, v_secret_id
  from public.orbit_mailboxes m
  left join public.orbit_mailbox_credentials c on c.mailbox_id = m.id
  where m.id = p_mailbox_id;

  if v_workspace_id is null then
    raise exception 'Mailbox not found.' using errcode = 'P0002';
  end if;

  if not private.is_workspace_admin(v_workspace_id) then
    raise exception 'Workspace admin access required.' using errcode = '42501';
  end if;

  delete from public.orbit_mailbox_credentials where mailbox_id = p_mailbox_id;
  if v_secret_id is not null then
    delete from vault.secrets where id = v_secret_id;
  end if;
end;
$$;

revoke all on function public.orbit_relay_store_credential(uuid, text, text) from public, anon;
revoke all on function public.orbit_relay_get_credential(uuid) from public, anon;
revoke all on function public.orbit_relay_delete_credential(uuid) from public, anon;

grant execute on function public.orbit_relay_store_credential(uuid, text, text) to authenticated;
grant execute on function public.orbit_relay_get_credential(uuid) to authenticated;
grant execute on function public.orbit_relay_delete_credential(uuid) to authenticated;
