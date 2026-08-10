create or replace function public.get_stage4_provider_secret(
  p_workspace_id uuid,
  p_key text
) returns text
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  allowed_keys constant text[] := array[
    'resend_api_key','email_from','resend_webhook_secret',
    'whatsapp_access_token','whatsapp_phone_number_id','whatsapp_graph_api_version',
    'whatsapp_template_outreach','whatsapp_template_followup','whatsapp_template_proposal',
    'whatsapp_template_payment_request','whatsapp_template_referral','whatsapp_template_language',
    'whatsapp_app_secret','whatsapp_webhook_verify_token'
  ];
  secret_name text;
  result text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required';
  end if;
  if not (p_key = any(allowed_keys)) then
    raise exception 'unsupported Stage 4 provider secret key';
  end if;
  secret_name := 'orbit_stage4_' || replace(p_workspace_id::text, '-', '_') || '_' || p_key;
  select decrypted_secret into result from vault.decrypted_secrets where name = secret_name limit 1;
  return result;
end;
$$;

revoke all on function public.get_stage4_provider_secret(uuid,text) from public, anon, authenticated;
grant execute on function public.get_stage4_provider_secret(uuid,text) to service_role;

create or replace function public.set_stage4_provider_secret(
  p_workspace_id uuid,
  p_key text,
  p_value text
) returns boolean
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  allowed_keys constant text[] := array[
    'resend_api_key','email_from','resend_webhook_secret',
    'whatsapp_access_token','whatsapp_phone_number_id','whatsapp_graph_api_version',
    'whatsapp_template_outreach','whatsapp_template_followup','whatsapp_template_proposal',
    'whatsapp_template_payment_request','whatsapp_template_referral','whatsapp_template_language',
    'whatsapp_app_secret','whatsapp_webhook_verify_token'
  ];
  secret_name text;
  secret_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if not exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id
      and user_id = auth.uid()
      and role in ('owner','admin','founder')
  ) then
    raise exception 'workspace founder authority required';
  end if;
  if not (p_key = any(allowed_keys)) then raise exception 'unsupported Stage 4 provider secret key'; end if;
  if p_value is null or length(trim(p_value)) = 0 or length(p_value) > 10000 then raise exception 'invalid provider secret value'; end if;
  secret_name := 'orbit_stage4_' || replace(p_workspace_id::text, '-', '_') || '_' || p_key;
  select id into secret_id from vault.secrets where name = secret_name limit 1;
  if secret_id is null then
    perform vault.create_secret(p_value, secret_name, 'Orbit Stage 4 encrypted provider setting for workspace ' || p_workspace_id::text);
  else
    perform vault.update_secret(secret_id, p_value, null, null, null);
  end if;
  return true;
end;
$$;

revoke all on function public.set_stage4_provider_secret(uuid,text,text) from public, anon;
grant execute on function public.set_stage4_provider_secret(uuid,text,text) to authenticated;
