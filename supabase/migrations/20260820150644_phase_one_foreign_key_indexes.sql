create index if not exists commercial_content_assets_created_by_idx
  on public.commercial_content_assets (created_by);

create index if not exists commercial_content_assets_workspace_proof_idx
  on public.commercial_content_assets (workspace_id, proof_id);

create index if not exists commercial_content_assets_updated_by_idx
  on public.commercial_content_assets (updated_by);

create index if not exists orbit_recommended_send_packs_workspace_action_idx
  on public.orbit_recommended_send_packs (workspace_id, action_request_id);

create index if not exists orbit_recommended_send_packs_workspace_content_idx
  on public.orbit_recommended_send_packs (workspace_id, content_asset_id);

create index if not exists orbit_recommended_send_packs_created_by_idx
  on public.orbit_recommended_send_packs (created_by);

create index if not exists orbit_recommended_send_packs_workspace_opportunity_idx
  on public.orbit_recommended_send_packs (workspace_id, opportunity_id);

create index if not exists orbit_recommended_send_packs_workspace_pricing_idx
  on public.orbit_recommended_send_packs (workspace_id, pricing_plan_id);

create index if not exists pricing_plan_versions_changed_by_idx
  on public.pricing_plan_versions (changed_by);

create index if not exists pricing_plans_created_by_idx
  on public.pricing_plans (created_by);

create index if not exists pricing_plans_updated_by_idx
  on public.pricing_plans (updated_by);
