alter table public.orbit_proposal_drafts
  add column if not exists relay_template_version_id uuid references public.relay_template_versions(id) on delete set null,
  add column if not exists relay_rendered_subject text,
  add column if not exists relay_rendered_html text,
  add column if not exists relay_rendered_text text,
  add column if not exists relay_variable_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists relay_rendered_at timestamptz;

create index if not exists orbit_proposal_drafts_relay_template_version_idx
  on public.orbit_proposal_drafts(relay_template_version_id);