-- Avoid re-evaluating auth.uid() for every candidate row in high-volume Foundry inserts.

drop policy if exists foundry_level_resources_insert_manage
  on public.foundry_level_resources;
create policy foundry_level_resources_insert_manage
on public.foundry_level_resources
for insert
to authenticated
with check (
  (select private.has_capability(foundry_level_resources.workspace_id, 'foundry.manage'))
  and created_by = (select auth.uid())
);

drop policy if exists foundry_studio_assignments_insert_manage
  on public.foundry_studio_assignments;
create policy foundry_studio_assignments_insert_manage
on public.foundry_studio_assignments
for insert
to authenticated
with check (
  (select private.has_capability(foundry_studio_assignments.workspace_id, 'foundry.manage'))
  and created_by = (select auth.uid())
);
