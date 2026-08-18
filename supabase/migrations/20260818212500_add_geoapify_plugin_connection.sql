alter table public.integration_connections
  drop constraint if exists integration_connections_provider_check;
alter table public.integration_connections
  add constraint integration_connections_provider_check
  check (provider = any (array[
    'github','vercel','google_search_console','google_analytics','meta','instagram','linkedin','geoapify'
  ]::text[]));

alter table public.lead_source_assets
  drop constraint if exists lead_source_assets_source_slug_check;
alter table public.lead_source_assets
  add constraint lead_source_assets_source_slug_check
  check (source_slug = any (array[
    'website','google','local-search','instagram','linkedin','facebook','youtube','referrals','cold-list'
  ]::text[]));

insert into public.plugin_catalog (
  slug,
  name,
  short_description,
  developer_name,
  developer_url,
  current_version,
  status,
  verified,
  first_party,
  manifest
)
values (
  'geoapify-lead-discovery',
  'Geoapify Lead Discovery',
  'Local business discovery for Orbit Lead Engine using Geoapify Places, Geocoding and Place Details APIs.',
  'Urava',
  'https://www.geoapify.com',
  '1.0.0',
  'published',
  true,
  true,
  jsonb_build_object(
    'schema_version','1',
    'id','geoapify-lead-discovery',
    'name','Geoapify Lead Discovery',
    'description','Discover local businesses by niche and place, enrich public contact data, deduplicate and stage results for founder review.',
    'version','1.0.0',
    'category','Growth',
    'developer',jsonb_build_object('name','Urava','url','https://www.geoapify.com'),
    'skills',jsonb_build_array(
      jsonb_build_object('id','local-business-discovery','name','Local Business Discovery','description','Find local businesses by category, location and radius.'),
      jsonb_build_object('id','contact-enrichment','name','Contact Enrichment','description','Use public place details such as website, phone and email when available.'),
      jsonb_build_object('id','lead-deduplication','name','Lead Deduplication','description','Remember provider place IDs so rejected or approved businesses are not resurfaced accidentally.')
    ),
    'apps',jsonb_build_array(jsonb_build_object('provider','geoapify','required',true)),
    'workflows',jsonb_build_array(
      jsonb_build_object('id','discover-review-add','name','Discover → review → add','description','Search Geoapify, score and review results, then add selected businesses to Lead Engine.')
    ),
    'permissions',jsonb_build_array('workspace.read','integrations.read','geoapify.places.read','leads.create'),
    'orbit_modules',jsonb_build_array('growth','lead_engine')
  )
)
on conflict (slug) do update set
  name = excluded.name,
  short_description = excluded.short_description,
  developer_name = excluded.developer_name,
  developer_url = excluded.developer_url,
  current_version = excluded.current_version,
  status = excluded.status,
  verified = excluded.verified,
  first_party = excluded.first_party,
  manifest = excluded.manifest,
  updated_at = now();

comment on table public.integration_connections is
  'Workspace-scoped external app connections. Geoapify API keys are encrypted server-side before storage.';
