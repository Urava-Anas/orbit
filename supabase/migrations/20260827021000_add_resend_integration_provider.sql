alter table public.integration_connections
  drop constraint if exists integration_connections_provider_check;

alter table public.integration_connections
  add constraint integration_connections_provider_check
  check (
    provider = any (
      array[
        'github'::text,
        'vercel'::text,
        'google_search_console'::text,
        'google_analytics'::text,
        'meta'::text,
        'instagram'::text,
        'linkedin'::text,
        'geoapify'::text,
        'tiktok'::text,
        'resend'::text
      ]
    )
  );