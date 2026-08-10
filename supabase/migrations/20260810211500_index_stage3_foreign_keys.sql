-- Stage 3 performance hardening: cover remaining foreign keys reported by the Supabase linter.

create index if not exists orbit_sales_opportunities_created_by_idx
  on public.orbit_sales_opportunities(created_by);

create index if not exists orbit_lead_research_lead_idx
  on public.orbit_lead_research(workspace_id, lead_id);

create index if not exists orbit_qualifications_lead_idx
  on public.orbit_qualifications(workspace_id, lead_id);

create index if not exists orbit_followup_plans_lead_idx
  on public.orbit_followup_plans(workspace_id, lead_id);

create index if not exists orbit_sales_guidance_lead_idx
  on public.orbit_sales_guidance(workspace_id, lead_id);

create index if not exists orbit_proposal_drafts_lead_idx
  on public.orbit_proposal_drafts(workspace_id, lead_id);

create index if not exists orbit_onboarding_cases_lead_idx
  on public.orbit_onboarding_cases(workspace_id, lead_id);

create index if not exists orbit_delivery_handoffs_lead_idx
  on public.orbit_delivery_handoffs(workspace_id, lead_id);

create index if not exists orbit_proof_referral_plans_lead_idx
  on public.orbit_proof_referral_plans(workspace_id, lead_id);
