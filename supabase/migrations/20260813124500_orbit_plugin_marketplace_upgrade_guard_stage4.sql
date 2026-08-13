-- Stage 4 hardening: app-boundary changes also require re-approval, and safe updates narrow grants automatically.
create or replace function public.promote_plugin_submission(
  target_submission_id uuid,
  target_reviewer_id uuid,
  target_review_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
set statement_timeout = '10s'
as $$
declare
  submission_row public.plugin_submissions%rowtype;
  publisher_row public.plugin_publishers%rowtype;
  plugin_row public.plugin_catalog%rowtype;
  plugin_id_value uuid;
  permissions_value text[];
  previous_permissions text[];
  required_apps_value text[];
  previous_required_apps text[];
  mcp_url_value text;
  previous_mcp_url text;
  escalated boolean := false;
begin
  if not exists (select 1 from public.orbit_platform_admins where user_id = target_reviewer_id) then
    raise exception 'Reviewer is not an Orbit platform administrator';
  end if;
  if target_review_notes is not null and char_length(target_review_notes) > 4000 then
    raise exception 'Review notes are too long';
  end if;

  select * into submission_row from public.plugin_submissions where id = target_submission_id for update;
  if submission_row.id is null then raise exception 'Plugin submission not found'; end if;
  if submission_row.review_status <> 'submitted' then raise exception 'Plugin submission is not awaiting review'; end if;
  select * into publisher_row from public.plugin_publishers where id = submission_row.publisher_id for update;
  if publisher_row.id is null or publisher_row.status <> 'active' then raise exception 'Plugin publisher is not active'; end if;
  if submission_row.manifest_hash <> encode(extensions.digest(submission_row.manifest::text, 'sha256'), 'hex') then
    raise exception 'Plugin submission integrity check failed';
  end if;
  if submission_row.manifest ->> 'id' <> submission_row.proposed_slug
     or submission_row.manifest ->> 'version' <> submission_row.proposed_version
     or submission_row.manifest ->> 'schema_version' <> '1' then
    raise exception 'Plugin manifest identity is invalid';
  end if;
  if submission_row.manifest ? 'mcp' then
    mcp_url_value := submission_row.manifest #>> '{mcp,url}';
    if mcp_url_value is null or mcp_url_value !~ '^https://[^/@:]+(?::443)?(?:/|$)' then
      raise exception 'MCP endpoint must use HTTPS port 443 without URL credentials';
    end if;
  end if;

  select coalesce(array_agg(permission order by permission), '{}'::text[])
    into permissions_value
    from jsonb_array_elements_text(coalesce(submission_row.manifest -> 'permissions', '[]'::jsonb)) permission;
  select coalesce(array_agg(provider order by provider), '{}'::text[])
    into required_apps_value
    from (
      select app.value ->> 'provider' as provider
      from jsonb_array_elements(coalesce(submission_row.manifest -> 'apps', '[]'::jsonb)) app(value)
      where coalesce((app.value ->> 'required')::boolean, true)
    ) required_apps;

  select * into plugin_row from public.plugin_catalog where slug = submission_row.proposed_slug for update;
  if plugin_row.id is null then
    insert into public.plugin_catalog(
      slug,name,short_description,developer_name,developer_url,current_version,status,verified,first_party,manifest,publisher_id
    ) values (
      submission_row.proposed_slug,
      submission_row.manifest ->> 'name',
      coalesce(submission_row.manifest ->> 'description', 'Orbit plugin published through the verified marketplace review flow.'),
      publisher_row.display_name,publisher_row.website,submission_row.proposed_version,
      'published',true,false,submission_row.manifest,publisher_row.id
    ) returning id into plugin_id_value;
  else
    if plugin_row.publisher_id is distinct from publisher_row.id then raise exception 'Plugin slug belongs to another publisher'; end if;
    if not private.semver_is_upgrade(plugin_row.current_version, submission_row.proposed_version) then
      raise exception 'Plugin version must be a forward semantic-version upgrade';
    end if;
    select coalesce(array_agg(permission order by permission), '{}'::text[])
      into previous_permissions
      from jsonb_array_elements_text(coalesce(plugin_row.manifest -> 'permissions', '[]'::jsonb)) permission;
    select coalesce(array_agg(provider order by provider), '{}'::text[])
      into previous_required_apps
      from (
        select app.value ->> 'provider' as provider
        from jsonb_array_elements(coalesce(plugin_row.manifest -> 'apps', '[]'::jsonb)) app(value)
        where coalesce((app.value ->> 'required')::boolean, true)
      ) required_apps;
    previous_mcp_url := plugin_row.manifest #>> '{mcp,url}';
    escalated := exists (
      select 1 from unnest(permissions_value) permission where not (permission = any(previous_permissions))
    ) or exists (
      select 1 from unnest(required_apps_value) provider where not (provider = any(previous_required_apps))
    ) or coalesce(mcp_url_value, '') <> coalesce(previous_mcp_url, '');

    plugin_id_value := plugin_row.id;
    update public.plugin_catalog set
      name=submission_row.manifest->>'name',
      short_description=coalesce(submission_row.manifest->>'description',short_description),
      developer_name=publisher_row.display_name,developer_url=publisher_row.website,
      current_version=submission_row.proposed_version,status='published',verified=true,
      manifest=submission_row.manifest,publisher_id=publisher_row.id,updated_at=now()
    where id=plugin_id_value;
  end if;

  insert into public.plugin_versions(plugin_id,publisher_id,version,manifest,manifest_hash,permissions,mcp_url,approved_by)
  values (plugin_id_value,publisher_row.id,submission_row.proposed_version,submission_row.manifest,
          submission_row.manifest_hash,permissions_value,mcp_url_value,target_reviewer_id);

  if plugin_row.id is not null then
    if escalated then
      update public.plugin_installations set status='pending_review',updated_at=now()
      where plugin_id=plugin_id_value and status in ('installed','pending_connections');
    else
      update public.plugin_installations set
        version=submission_row.proposed_version,
        granted_permissions=permissions_value,
        updated_at=now()
      where plugin_id=plugin_id_value and status in ('installed','pending_connections');
    end if;
  end if;

  update public.plugin_submissions set
    review_status='approved',reviewed_by=target_reviewer_id,review_notes=target_review_notes,
    reviewed_at=now(),updated_at=now()
  where id=target_submission_id;
  return plugin_id_value;
end;
$$;
revoke all on function public.promote_plugin_submission(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.promote_plugin_submission(uuid,uuid,text) to service_role;
