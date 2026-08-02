alter table public.leads
  add column if not exists whatsapp text,
  add column if not exists niche text,
  add column if not exists lead_score smallint,
  add column if not exists pain_point text,
  add column if not exists google_maps_url text,
  add column if not exists legacy_notion_url text,
  add column if not exists imported_at timestamptz;

alter table public.leads
  drop constraint if exists leads_stage_check;

alter table public.leads
  add constraint leads_stage_check
  check (
    stage = any (
      array[
        'raw'::text,
        'scored'::text,
        'contacted'::text,
        'interested'::text,
        'demo_booked'::text,
        'won'::text,
        'lost'::text,
        'new'::text,
        'qualified'::text,
        'proposal'::text
      ]
    )
  );

alter table public.leads
  add constraint leads_whatsapp_check
  check (whatsapp is null or char_length(whatsapp) <= 40),
  add constraint leads_niche_check
  check (niche is null or char_length(niche) <= 100),
  add constraint leads_score_check
  check (lead_score is null or lead_score between 0 and 100),
  add constraint leads_pain_point_check
  check (pain_point is null or char_length(pain_point) <= 4000),
  add constraint leads_google_maps_url_check
  check (google_maps_url is null or char_length(google_maps_url) <= 500),
  add constraint leads_legacy_notion_url_check
  check (legacy_notion_url is null or char_length(legacy_notion_url) <= 500);

create unique index if not exists leads_workspace_legacy_notion_url_unique
  on public.leads (workspace_id, legacy_notion_url)
  where legacy_notion_url is not null;

create index if not exists leads_workspace_stage_score_idx
  on public.leads (workspace_id, stage, lead_score desc nulls last);

create index if not exists leads_workspace_next_action_idx
  on public.leads (workspace_id, next_action_at)
  where next_action_at is not null;

comment on column public.leads.whatsapp is
  'Dedicated WhatsApp contact. Kept separate from phone because the channels may differ.';
comment on column public.leads.niche is
  'Business category used for qualification and offer matching.';
comment on column public.leads.lead_score is
  'Founder-defined qualification score from 0 to 100.';
comment on column public.leads.pain_point is
  'Observed business problem that makes the lead worth pursuing.';
comment on column public.leads.google_maps_url is
  'Public location or Google Maps research reference.';
comment on column public.leads.legacy_notion_url is
  'Read-only source reference for records migrated from the legacy Notion Lead Engine.';
comment on column public.leads.imported_at is
  'Timestamp when a legacy lead was imported into Orbit.';
