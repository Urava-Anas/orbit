drop policy if exists "relay_templates_workspace_read" on public.relay_templates;
drop policy if exists "relay_templates_workspace_write" on public.relay_templates;
drop policy if exists "relay_versions_workspace_read" on public.relay_template_versions;
drop policy if exists "relay_versions_workspace_write" on public.relay_template_versions;
drop policy if exists "relay_modules_workspace_read" on public.relay_modules;
drop policy if exists "relay_modules_workspace_write" on public.relay_modules;

create policy relay_templates_select_member
on public.relay_templates for select to authenticated
using ((select private.is_workspace_member(relay_templates.workspace_id)));

create policy relay_templates_insert_admin
on public.relay_templates for insert to authenticated
with check (
  (select private.is_workspace_admin(relay_templates.workspace_id))
  and (select private.orbit_workspace_can_write(relay_templates.workspace_id))
);

create policy relay_templates_update_admin
on public.relay_templates for update to authenticated
using (
  (select private.is_workspace_admin(relay_templates.workspace_id))
  and (select private.orbit_workspace_can_write(relay_templates.workspace_id))
)
with check (
  (select private.is_workspace_admin(relay_templates.workspace_id))
  and (select private.orbit_workspace_can_write(relay_templates.workspace_id))
);

create policy relay_templates_delete_admin
on public.relay_templates for delete to authenticated
using (
  (select private.is_workspace_admin(relay_templates.workspace_id))
  and (select private.orbit_workspace_can_write(relay_templates.workspace_id))
);

create policy relay_versions_select_member
on public.relay_template_versions for select to authenticated
using ((select private.is_workspace_member(relay_template_versions.workspace_id)));

create policy relay_versions_insert_admin
on public.relay_template_versions for insert to authenticated
with check (
  (select private.is_workspace_admin(relay_template_versions.workspace_id))
  and (select private.orbit_workspace_can_write(relay_template_versions.workspace_id))
);

create policy relay_modules_select_member
on public.relay_modules for select to authenticated
using ((select private.is_workspace_member(relay_modules.workspace_id)));

create policy relay_modules_insert_admin
on public.relay_modules for insert to authenticated
with check (
  (select private.is_workspace_admin(relay_modules.workspace_id))
  and (select private.orbit_workspace_can_write(relay_modules.workspace_id))
);

create policy relay_modules_update_admin
on public.relay_modules for update to authenticated
using (
  (select private.is_workspace_admin(relay_modules.workspace_id))
  and (select private.orbit_workspace_can_write(relay_modules.workspace_id))
)
with check (
  (select private.is_workspace_admin(relay_modules.workspace_id))
  and (select private.orbit_workspace_can_write(relay_modules.workspace_id))
);

create policy relay_modules_delete_admin
on public.relay_modules for delete to authenticated
using (
  (select private.is_workspace_admin(relay_modules.workspace_id))
  and (select private.orbit_workspace_can_write(relay_modules.workspace_id))
);

create index if not exists relay_templates_created_by_idx
  on public.relay_templates(created_by);
create index if not exists relay_template_versions_workspace_idx
  on public.relay_template_versions(workspace_id);
create index if not exists relay_template_versions_created_by_idx
  on public.relay_template_versions(created_by);
create index if not exists relay_modules_created_by_idx
  on public.relay_modules(created_by);