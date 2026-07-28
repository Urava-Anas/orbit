create index access_grants_capability_key_idx
  on public.access_grants(capability_key);
create index access_grants_granted_by_idx
  on public.access_grants(granted_by)
  where granted_by is not null;
create index member_permission_bundles_assigned_by_idx
  on public.member_permission_bundles(assigned_by)
  where assigned_by is not null;
create index member_permission_bundles_workspace_bundle_idx
  on public.member_permission_bundles(workspace_id, bundle_id);
create index organisation_modules_enabled_by_idx
  on public.organisation_modules(enabled_by)
  where enabled_by is not null;
create index permission_bundle_capabilities_capability_idx
  on public.permission_bundle_capabilities(capability_key);
create index permission_bundles_created_by_idx
  on public.permission_bundles(created_by)
  where created_by is not null;
