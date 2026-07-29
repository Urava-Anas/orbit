-- Cover the foreign-key columns surfaced by the Supabase performance advisor.
-- These tables are currently tiny, so regular transactional index creation is
-- preferable to CREATE INDEX CONCURRENTLY during this controlled migration.

create index if not exists foundry_certificates_revoked_by_idx
  on public.foundry_certificates(revoked_by);

create index if not exists foundry_delivery_preferences_updated_by_idx
  on public.foundry_delivery_preferences(updated_by);

create index if not exists foundry_external_deliveries_workspace_student_idx
  on public.foundry_external_deliveries(workspace_id, student_id);
