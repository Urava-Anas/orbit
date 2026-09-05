-- Keep drafting collaborative, but reserve approval/rejection/publication state for workspace admins.

drop policy if exists content_update_member on public.content_drafts;

drop policy if exists content_update_member_review_only on public.content_drafts;
create policy content_update_member_review_only
on public.content_drafts
for update
to authenticated
using (
  (select private.is_workspace_member(content_drafts.workspace_id))
  and content_drafts.status in ('draft', 'review')
  and content_drafts.approved_by is null
)
with check (
  (select private.is_workspace_member(content_drafts.workspace_id))
  and content_drafts.status in ('draft', 'review')
  and content_drafts.approved_by is null
  and (select private.orbit_workspace_can_write(content_drafts.workspace_id))
);

drop policy if exists content_update_admin on public.content_drafts;
create policy content_update_admin
on public.content_drafts
for update
to authenticated
using (
  (select private.is_workspace_admin(content_drafts.workspace_id))
)
with check (
  (select private.is_workspace_admin(content_drafts.workspace_id))
  and (select private.orbit_workspace_can_write(content_drafts.workspace_id))
);

comment on policy content_update_member_review_only on public.content_drafts is
  'Members may edit only unapproved draft/review content. Founder/admin approval state is not writable through this policy.';
comment on policy content_update_admin on public.content_drafts is
  'Workspace admins control approval, rejection, scheduling and publication state changes.';
