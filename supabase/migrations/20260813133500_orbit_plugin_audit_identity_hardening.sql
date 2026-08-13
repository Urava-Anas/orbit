-- Final plugin security review: authenticated users cannot spoof actor/audit identity or move publisher ownership.
create or replace function private.guard_plugin_installation_actor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare request_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
begin
  if request_role <> 'service_role' then
    if auth.uid() is null then raise exception 'Authenticated actor required'; end if;
    if new.installed_by is distinct from auth.uid() then
      raise exception 'Plugin installation actor must match the authenticated user';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_plugin_installation_actor() from public;
drop trigger if exists guard_plugin_installation_actor_before_write on public.plugin_installations;
create trigger guard_plugin_installation_actor_before_write
before insert or update of installed_by on public.plugin_installations
for each row execute function private.guard_plugin_installation_actor();

create or replace function private.guard_plugin_event_actor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare request_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
begin
  if request_role <> 'service_role' then
    if auth.uid() is null or new.actor_user_id is distinct from auth.uid() then
      raise exception 'Plugin audit actor must match the authenticated user';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_plugin_event_actor() from public;
drop trigger if exists guard_plugin_event_actor_before_insert on public.plugin_installation_events;
create trigger guard_plugin_event_actor_before_insert
before insert on public.plugin_installation_events
for each row execute function private.guard_plugin_event_actor();

create or replace function private.guard_plugin_publisher_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare request_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
begin
  if request_role <> 'service_role' then
    if auth.uid() is null then raise exception 'Authenticated actor required'; end if;
    if tg_op = 'INSERT' then
      if new.created_by is distinct from auth.uid() then
        raise exception 'Publisher creator must match the authenticated user';
      end if;
      if new.verified or new.status <> 'active' then
        raise exception 'Publisher verification and suspension are controlled by Orbit review';
      end if;
    else
      if new.workspace_id is distinct from old.workspace_id
         or new.created_by is distinct from old.created_by
         or new.slug is distinct from old.slug then
        raise exception 'Publisher ownership and slug are immutable';
      end if;
      if new.verified is distinct from old.verified or new.status is distinct from old.status then
        raise exception 'Publisher verification and suspension are controlled by Orbit review';
      end if;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_plugin_publisher_write() from public;

create or replace function private.validate_plugin_submission_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  publisher_workspace uuid;
  request_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
begin
  select workspace_id into publisher_workspace from public.plugin_publishers where id = new.publisher_id;
  if publisher_workspace is null or publisher_workspace <> new.workspace_id then
    raise exception 'Publisher and submission must belong to the same workspace';
  end if;
  if new.manifest ->> 'id' is distinct from new.proposed_slug then raise exception 'Manifest id must match proposed slug'; end if;
  if new.manifest ->> 'version' is distinct from new.proposed_version then raise exception 'Manifest version must match proposed version'; end if;
  if new.manifest ->> 'schema_version' is distinct from '1' then raise exception 'Unsupported plugin manifest schema'; end if;
  new.manifest_hash := encode(extensions.digest(new.manifest::text, 'sha256'), 'hex');

  if tg_op = 'INSERT' then
    if request_role <> 'service_role' then
      if auth.uid() is null or new.submitted_by is distinct from auth.uid() then
        raise exception 'Submission actor must match the authenticated user';
      end if;
      if new.review_status not in ('draft','submitted') then
        raise exception 'New plugin submissions cannot start in a terminal review state';
      end if;
      if new.reviewed_by is not null or new.reviewed_at is not null or new.review_notes is not null then
        raise exception 'Review fields are controlled by Orbit review';
      end if;
    end if;
    if new.review_status = 'submitted' then new.submitted_at := coalesce(new.submitted_at, now()); end if;
    return new;
  end if;

  if old.review_status in ('approved','rejected') then raise exception 'Reviewed plugin submissions are immutable'; end if;
  if request_role <> 'service_role' then
    if auth.uid() is null then raise exception 'Authenticated actor required'; end if;
    if new.workspace_id is distinct from old.workspace_id or new.submitted_by is distinct from old.submitted_by then
      raise exception 'Submission ownership is immutable';
    end if;
  end if;
  if old.review_status = 'submitted' and (
    new.manifest is distinct from old.manifest or new.proposed_slug is distinct from old.proposed_slug or
    new.proposed_version is distinct from old.proposed_version or new.publisher_id is distinct from old.publisher_id
  ) then raise exception 'Submitted plugin manifests cannot be changed'; end if;

  if request_role <> 'service_role' then
    if old.review_status = 'submitted' and new.review_status <> 'submitted' then
      raise exception 'Submitted plugins can only be resolved by Orbit review';
    end if;
    if old.review_status = 'draft' and new.review_status not in ('draft','submitted') then
      raise exception 'Draft plugins can only be submitted for review';
    end if;
    if new.reviewed_by is distinct from old.reviewed_by or new.reviewed_at is distinct from old.reviewed_at or new.review_notes is distinct from old.review_notes then
      raise exception 'Review fields are controlled by Orbit review';
    end if;
  end if;
  if old.review_status = 'draft' and new.review_status = 'submitted' then
    new.submitted_at := coalesce(new.submitted_at, now());
  end if;
  return new;
end;
$$;
revoke all on function private.validate_plugin_submission_write() from public;
