alter table public.lead_finder_searches
  drop constraint if exists lead_finder_searches_provider_check;
alter table public.lead_finder_searches
  add constraint lead_finder_searches_provider_check
  check (provider in ('google_places','geoapify'));
alter table public.lead_finder_searches
  alter column provider set default 'geoapify';

alter table public.lead_finder_results
  drop constraint if exists lead_finder_results_provider_check;
alter table public.lead_finder_results
  add constraint lead_finder_results_provider_check
  check (provider in ('google_places','geoapify'));
alter table public.lead_finder_results
  alter column provider set default 'geoapify';
alter table public.lead_finder_results
  add column if not exists email text;
alter table public.lead_finder_results
  drop constraint if exists lead_finder_results_email_check;
alter table public.lead_finder_results
  add constraint lead_finder_results_email_check
  check (email is null or char_length(email) <= 254);

alter table public.lead_finder_place_memory
  drop constraint if exists lead_finder_place_memory_provider_check;
alter table public.lead_finder_place_memory
  add constraint lead_finder_place_memory_provider_check
  check (provider in ('google_places','geoapify'));
alter table public.lead_finder_place_memory
  alter column provider set default 'geoapify';

alter table public.leads
  add column if not exists lead_provider text,
  add column if not exists provider_place_id text;
alter table public.leads
  drop constraint if exists leads_lead_provider_check;
alter table public.leads
  add constraint leads_lead_provider_check
  check (lead_provider is null or lead_provider in ('google_places','geoapify'));
alter table public.leads
  drop constraint if exists leads_provider_place_id_check;
alter table public.leads
  add constraint leads_provider_place_id_check
  check (provider_place_id is null or char_length(provider_place_id) between 3 and 300);
create unique index if not exists leads_workspace_provider_place_unique
  on public.leads(workspace_id, lead_provider, provider_place_id)
  where lead_provider is not null and provider_place_id is not null;

alter table public.leads
  drop constraint if exists leads_source_check;
alter table public.leads
  add constraint leads_source_check
  check (source = any (array[
    'direct','referral','website','whatsapp','facebook','instagram','linkedin','google','local_search','other'
  ]::text[]));

comment on column public.leads.lead_provider is
  'Discovery data provider used for provider-specific deduplication, e.g. geoapify or google_places.';
comment on column public.leads.provider_place_id is
  'Provider place identifier paired with lead_provider for durable deduplication.';
comment on column public.lead_finder_results.email is
  'Public business email returned by the configured discovery provider when available.';
