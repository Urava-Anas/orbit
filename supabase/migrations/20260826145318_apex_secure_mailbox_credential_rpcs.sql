-- Recover Apex admin mailbox credential controls. Secrets are stored in Vault;
-- only active Apex founders/admins may invoke the user-facing write RPCs.

create or replace function public.apex_store_mailbox_credential(
  p_mailbox_id uuid,
  p_username text,
  p_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare
  v_workspace_id uuid;
  v_address text;
  v_secret_id uuid;
  v_email text;
  v_role text;
begin
  select workspace_id, lower(address)
    into v_workspace_id, v_address
  from public.orbit_mailboxes
  where id = p_mailbox_id;

  if v_workspace_id is null then
    raise exception 'Mailbox not found.' using errcode = 'P0002';
  end if;

  v_email := lower(trim(coalesce(auth.jwt() ->> 'email', '')));

  select role
    into v_role
  from public.apex_authorized_users
  where workspace_id = v_workspace_id
    and email = v_email
    and active = true
  limit 1;

  if coalesce(v_role, '') not in ('founder', 'admin') then
    raise exception 'Apex admin access required.' using errcode = '42501';
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
      'apex-mailbox-' || p_mailbox_id::text,
      'Apex mailbox credential',
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

  update public.orbit_mailboxes
  set last_error = null,
      connection_health = 'unknown'
  where id = p_mailbox_id;

  update public.apex_integrations
  set status = 'configured',
      last_checked_at = now(),
      last_error = null,
      notes = 'Mailbox credentials are stored in Supabase Vault. Live IMAP/SMTP verification is still required.',
      updated_at = now()
  where workspace_id = v_workspace_id
    and provider_key = 'private_email';

  return jsonb_build_object(
    'ok', true,
    'mailbox_id', p_mailbox_id,
    'address', v_address,
    'stored', true
  );
end;
$$;

create or replace function public.apex_delete_mailbox_credential(p_mailbox_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare
  v_workspace_id uuid;
  v_address text;
  v_secret_id uuid;
  v_email text;
  v_role text;
begin
  select m.workspace_id, lower(m.address), c.vault_secret_id
    into v_workspace_id, v_address, v_secret_id
  from public.orbit_mailboxes m
  left join public.orbit_mailbox_credentials c on c.mailbox_id = m.id
  where m.id = p_mailbox_id;

  if v_workspace_id is null then
    raise exception 'Mailbox not found.' using errcode = 'P0002';
  end if;

  v_email := lower(trim(coalesce(auth.jwt() ->> 'email', '')));

  select role
    into v_role
  from public.apex_authorized_users
  where workspace_id = v_workspace_id
    and email = v_email
    and active = true
  limit 1;

  if coalesce(v_role, '') not in ('founder', 'admin') then
    raise exception 'Apex admin access required.' using errcode = '42501';
  end if;

  delete from public.orbit_mailbox_credentials where mailbox_id = p_mailbox_id;
  if v_secret_id is not null then
    delete from vault.secrets where id = v_secret_id;
  end if;

  update public.orbit_mailboxes
  set status = 'disconnected',
      inbound_enabled = false,
      outbound_enabled = false,
      connection_health = 'unknown',
      last_error = null
  where id = p_mailbox_id;

  if not exists (
    select 1
    from public.orbit_mailboxes m
    join public.orbit_mailbox_credentials c on c.mailbox_id = m.id
    where m.workspace_id = v_workspace_id
  ) then
    update public.apex_integrations
    set status = 'configured',
        last_checked_at = now(),
        last_error = null,
        notes = 'Three mailboxes are registered in Orbit; credentials are not connected yet.',
        updated_at = now()
    where workspace_id = v_workspace_id
      and provider_key = 'private_email';
  end if;

  return jsonb_build_object(
    'ok', true,
    'mailbox_id', p_mailbox_id,
    'address', v_address,
    'stored', false
  );
end;
$$;

revoke all on function public.apex_store_mailbox_credential(uuid,text,text) from public, anon;
revoke all on function public.apex_delete_mailbox_credential(uuid) from public, anon;
grant execute on function public.apex_store_mailbox_credential(uuid,text,text) to authenticated, service_role;
grant execute on function public.apex_delete_mailbox_credential(uuid) to authenticated, service_role;
