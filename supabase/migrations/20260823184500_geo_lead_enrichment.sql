alter table public.lead_finder_results
  add column if not exists contact_person text,
  add column if not exists contact_role text,
  add column if not exists enrichment_status text not null default 'pending',
  add column if not exists enrichment_confidence smallint,
  add column if not exists enrichment_source text,
  add column if not exists enriched_at timestamptz;

alter table public.leads
  add column if not exists contact_person text,
  add column if not exists contact_role text,
  add column if not exists website_url text,
  add column if not exists enrichment_status text not null default 'pending',
  add column if not exists enrichment_confidence smallint,
  add column if not exists enrichment_source text,
  add column if not exists enriched_at timestamptz;

alter table public.lead_finder_results
  drop constraint if exists lead_finder_results_enrichment_confidence_check;
alter table public.lead_finder_results
  add constraint lead_finder_results_enrichment_confidence_check
  check (enrichment_confidence is null or enrichment_confidence between 0 and 100);

alter table public.leads
  drop constraint if exists leads_enrichment_confidence_check;
alter table public.leads
  add constraint leads_enrichment_confidence_check
  check (enrichment_confidence is null or enrichment_confidence between 0 and 100);

create index if not exists leads_workspace_contact_person_idx
  on public.leads (workspace_id, contact_person)
  where contact_person is not null;
