-- Keep the carrier-to-lead relationship tenant-safe while allowing a Lead Engine
-- record to be deleted without nulling the carrier workspace_id.

alter table public.apex_carriers
  drop constraint if exists apex_carriers_lead_fk;

alter table public.apex_carriers
  add constraint apex_carriers_lead_fk
  foreign key (workspace_id, lead_id)
  references public.leads(workspace_id, id)
  on delete set null (lead_id);
