-- Close two guardrail gaps discovered while reconciling production migrations.
-- Keep recovered production history immutable; apply the corrections forward.

drop policy if exists content_insert_member on public.content_drafts;
drop policy if exists content_insert_member_draft_only on public.content_drafts;
create policy content_insert_member_draft_only
on public.content_drafts
for insert
to authenticated
with check (
  (select private.is_workspace_member(content_drafts.workspace_id))
  and content_drafts.status in ('draft', 'review')
  and content_drafts.approved_by is null
  and (select private.orbit_workspace_can_write(content_drafts.workspace_id))
);

comment on policy content_insert_member_draft_only on public.content_drafts is
  'Members may create only unapproved draft/review content. Approval and publication remain admin-controlled.';

alter table public.commercial_content_assets
  drop constraint if exists commercial_content_assets_proof_fk;

alter table public.commercial_content_assets
  add constraint commercial_content_assets_proof_fk
  foreign key (workspace_id, proof_id)
  references public.proofs(workspace_id, id)
  on delete set null (proof_id);
