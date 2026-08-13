-- Orbit Plugin Architecture v1 — Stage 4: SDK + Marketplace
-- Third parties submit immutable manifests; only Orbit platform reviewers can promote them.

create table if not exists public.orbit_platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'reviewer' check (role in ('owner','reviewer')),
  created_at timestamptz not null default now()
);
alter table public.orbit_platform_admins enable row level security;
revoke all on table public.orbit_platform_admins from anon, authenticated;

insert into public.orbit_platform_admins(user_id, role)
values ('1603309b-da17-403f-8c2b-a8639789567d'::uuid, 'owner')
on conflict (user_id) do update set role = excluded.role;

create table if not exists public.plugin_publishers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  display_name text not null check (char_length(display_name) between 2 and 100),
  website text,
  status text not null default 'active' check (status in ('active','suspended')),
  verified boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.plugin_submissions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  publisher_id uuid not null references public.plugin_publishers(id) on delete cascade,
  proposed_slug text not null check (proposed_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  proposed_version text not null check (proposed_version ~ '^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][A-Za-z0-9.-]+)?$'),
  manifest jsonb not null check (jsonb_typeof(manifest) = 'object'),
  manifest_hash text not null check (manifest_hash ~ '^[a-f0-9]{64}$'),
  review_status text not null default 'draft' check (review_status in ('draft','submitted','approved','rejected')),
  submitted_by uuid not null references auth.users(id) on delete restrict,
  reviewed_by uuid references auth.users(id) on delete set null,
  review_notes text check (review_notes is null or char_length(review_notes) <= 4000),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (publisher_id, proposed_slug, proposed_version)
);

create table if not exists public.plugin_versions (
  id uuid primary key default gen_random_uuid(),
  plugin_id uuid not null references public.plugin_catalog(id) on delete restrict,
  publisher_id uuid not null references public.plugin_publishers(id) on delete restrict,
  version text not null check (version ~ '^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][A-Za-z0-9.-]+)?$'),
  manifest jsonb not null check (jsonb_typeof(manifest) = 'object'),
  manifest_hash text not null check (manifest_hash ~ '^[a-f0-9]{64}$'),
  permissions text[] not null default '{}'::text[],
  mcp_url text,
  approved_by uuid not null references auth.users(id) on delete restrict,
  approved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (plugin_id, version)
);

alter table public.plugin_catalog add column if not exists publisher_id uuid references public.plugin_publishers(id) on delete restrict;
alter table public.plugin_installations drop constraint if exists plugin_installations_status_check;
alter table public.plugin_installations add constraint plugin_installations_status_check
  check (status in ('installed','disabled','pending_connections','pending_review','revoked'));

create index if not exists plugin_publishers_workspace_idx on public.plugin_publishers(workspace_id);
create index if not exists plugin_publishers_created_by_idx on public.plugin_publishers(created_by) where created_by is not null;
create index if not exists plugin_submissions_workspace_status_idx on public.plugin_submissions(workspace_id, review_status, created_at desc);
create index if not exists plugin_submissions_publisher_idx on public.plugin_submissions(publisher_id);
create index if not exists plugin_submissions_submitted_by_idx on public.plugin_submissions(submitted_by);
create index if not exists plugin_submissions_reviewed_by_idx on public.plugin_submissions(reviewed_by) where reviewed_by is not null;
create index if not exists plugin_versions_plugin_time_idx on public.plugin_versions(plugin_id, approved_at desc);
create index if not exists plugin_versions_publisher_idx on public.plugin_versions(publisher_id);
create index if not exists plugin_versions_approved_by_idx on public.plugin_versions(approved_by);
create index if not exists plugin_catalog_publisher_idx on public.plugin_catalog(publisher_id) where publisher_id is not null;

alter table public.plugin_publishers enable row level security;
alter table public.plugin_submissions enable row level security;
alter table public.plugin_versions enable row level security;
revoke all on table public.plugin_publishers from anon, authenticated;
revoke all on table public.plugin_submissions from anon, authenticated;
revoke all on table public.plugin_versions from anon, authenticated;
grant select, insert, update on table public.plugin_publishers to authenticated;
grant select, insert, update on table public.plugin_submissions to authenticated;
grant select on table public.plugin_versions to authenticated;

drop policy if exists plugin_publishers_select_member on public.plugin_publishers;
create policy plugin_publishers_select_member on public.plugin_publishers
  for select to authenticated using ((select private.is_workspace_member(plugin_publishers.workspace_id)));
drop policy if exists plugin_publishers_insert_admin on public.plugin_publishers;
create policy plugin_publishers_insert_admin on public.plugin_publishers
  for insert to authenticated with check ((select private.is_workspace_admin(plugin_publishers.workspace_id)));
drop policy if exists plugin_publishers_update_admin on public.plugin_publishers;
create policy plugin_publishers_update_admin on public.plugin_publishers
  for update to authenticated
  using ((select private.is_workspace_admin(plugin_publishers.workspace_id)))
  with check ((select private.is_workspace_admin(plugin_publishers.workspace_id)));

drop policy if exists plugin_submissions_select_member on public.plugin_submissions;
create policy plugin_submissions_select_member on public.plugin_submissions
  for select to authenticated using ((select private.is_workspace_member(plugin_submissions.workspace_id)));
drop policy if exists plugin_submissions_insert_admin on public.plugin_submissions;
create policy plugin_submissions_insert_admin on public.plugin_submissions
  for insert to authenticated with check ((select private.is_workspace_admin(plugin_submissions.workspace_id)));
drop policy if exists plugin_submissions_update_admin on public.plugin_submissions;
create policy plugin_submissions_update_admin on public.plugin_submissions
  for update to authenticated
  using ((select private.is_workspace_admin(plugin_submissions.workspace_id)))
  with check ((select private.is_workspace_admin(plugin_submissions.workspace_id)));

drop policy if exists plugin_versions_select_authenticated on public.plugin_versions;
create policy plugin_versions_select_authenticated on public.plugin_versions
  for select to authenticated
  using (exists (
    select 1 from public.plugin_catalog catalog
    where catalog.id = plugin_versions.plugin_id and catalog.status in ('published','deprecated')
  ));

create or replace trigger plugin_publishers_set_updated_at
before update on public.plugin_publishers
for each row execute function private.set_updated_at();
create or replace trigger plugin_submissions_set_updated_at
before update on public.plugin_submissions
for each row execute function private.set_updated_at();

insert into public.plugin_publishers(workspace_id,slug,display_name,website,status,verified,created_by)
select wm.workspace_id,'urava','Urava','https://orbit-two-delta.vercel.app','active',true,wm.user_id
from public.workspace_members wm
where wm.user_id = '1603309b-da17-403f-8c2b-a8639789567d'::uuid and wm.role='owner'
limit 1
on conflict (slug) do update set verified=true,status='active',updated_at=now();

create or replace function private.guard_plugin_publisher_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare request_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
begin
  if request_role <> 'service_role' then
    if tg_op = 'INSERT' and (new.verified or new.status <> 'active') then
      raise exception 'Publisher verification and suspension are controlled by Orbit review';
    end if;
    if tg_op = 'UPDATE' and (new.verified is distinct from old.verified or new.status is distinct from old.status) then
      raise exception 'Publisher verification and suspension are controlled by Orbit review';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_plugin_publisher_write() from public;
drop trigger if exists guard_plugin_publisher_before_write on public.plugin_publishers;
create trigger guard_plugin_publisher_before_write
before insert or update on public.plugin_publishers
for each row execute function private.guard_plugin_publisher_write();

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
    if request_role <> 'service_role' and new.review_status not in ('draft','submitted') then
      raise exception 'New plugin submissions cannot start in a terminal review state';
    end if;
    if request_role <> 'service_role' and (new.reviewed_by is not null or new.reviewed_at is not null or new.review_notes is not null) then
      raise exception 'Review fields are controlled by Orbit review';
    end if;
    if new.review_status = 'submitted' then new.submitted_at := coalesce(new.submitted_at, now()); end if;
    return new;
  end if;

  if old.review_status in ('approved','rejected') then raise exception 'Reviewed plugin submissions are immutable'; end if;
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
drop trigger if exists validate_plugin_submission_before_write on public.plugin_submissions;
create trigger validate_plugin_submission_before_write
before insert or update on public.plugin_submissions
for each row execute function private.validate_plugin_submission_write();

create or replace function private.prevent_plugin_version_mutation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin raise exception 'Approved plugin versions are immutable'; end;
$$;
revoke all on function private.prevent_plugin_version_mutation() from public;
drop trigger if exists plugin_versions_immutable on public.plugin_versions;
create trigger plugin_versions_immutable
before update or delete on public.plugin_versions
for each row execute function private.prevent_plugin_version_mutation();

create or replace function private.semver_is_upgrade(old_version text, new_version text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  old_core text[] := string_to_array(split_part(split_part(old_version,'+',1),'-',1),'.');
  new_core text[] := string_to_array(split_part(split_part(new_version,'+',1),'-',1),'.');
  old_pre boolean := position('-' in split_part(old_version,'+',1)) > 0;
  new_pre boolean := position('-' in split_part(new_version,'+',1)) > 0;
  old_tuple integer[];
  new_tuple integer[];
begin
  old_tuple := array[old_core[1]::integer,old_core[2]::integer,old_core[3]::integer];
  new_tuple := array[new_core[1]::integer,new_core[2]::integer,new_core[3]::integer];
  if new_tuple > old_tuple then return true; end if;
  if new_tuple < old_tuple then return false; end if;
  if old_pre and not new_pre then return true; end if;
  return false;
exception when others then return false;
end;
$$;
revoke all on function private.semver_is_upgrade(text,text) from public;

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
  mcp_url_value text;
  previous_mcp_url text;
  escalated boolean := false;
begin
  if not exists (select 1 from public.orbit_platform_admins where user_id = target_reviewer_id) then
    raise exception 'Reviewer is not an Orbit platform administrator';
  end if;
  if target_review_notes is not null and char_length(target_review_notes) > 4000 then raise exception 'Review notes are too long'; end if;

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
    previous_mcp_url := plugin_row.manifest #>> '{mcp,url}';
    escalated := exists (
      select 1 from unnest(permissions_value) permission where not (permission = any(previous_permissions))
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
      update public.plugin_installations set version=submission_row.proposed_version,updated_at=now()
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

create or replace function public.reject_plugin_submission(
  target_submission_id uuid,target_reviewer_id uuid,target_review_notes text
)
returns boolean
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
begin
  if not exists (select 1 from public.orbit_platform_admins where user_id=target_reviewer_id) then
    raise exception 'Reviewer is not an Orbit platform administrator';
  end if;
  if target_review_notes is null or char_length(trim(target_review_notes)) < 3 or char_length(target_review_notes) > 4000 then
    raise exception 'A concise rejection reason is required';
  end if;
  update public.plugin_submissions set
    review_status='rejected',reviewed_by=target_reviewer_id,review_notes=target_review_notes,
    reviewed_at=now(),updated_at=now()
  where id=target_submission_id and review_status='submitted';
  return found;
end;
$$;
revoke all on function public.reject_plugin_submission(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.reject_plugin_submission(uuid,uuid,text) to service_role;

update public.plugin_catalog catalog set publisher_id=publisher.id
from public.plugin_publishers publisher
where publisher.slug='urava' and catalog.first_party=true and catalog.publisher_id is null;

insert into public.plugin_versions(plugin_id,publisher_id,version,manifest,manifest_hash,permissions,mcp_url,approved_by,approved_at)
select catalog.id,catalog.publisher_id,catalog.current_version,catalog.manifest,
  encode(extensions.digest(catalog.manifest::text,'sha256'),'hex'),
  coalesce((select array_agg(value order by value) from jsonb_array_elements_text(coalesce(catalog.manifest->'permissions','[]'::jsonb)) value),'{}'::text[]),
  catalog.manifest #>> '{mcp,url}',
  '1603309b-da17-403f-8c2b-a8639789567d'::uuid,now()
from public.plugin_catalog catalog
where catalog.first_party=true and catalog.publisher_id is not null
on conflict (plugin_id,version) do nothing;
