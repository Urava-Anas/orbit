alter table public.plugin_app_bindings
  drop constraint if exists plugin_app_bindings_provider_check;

alter table public.plugin_app_bindings
  add constraint plugin_app_bindings_provider_check
  check (provider = any (array[
    'github','vercel','google_search_console','google_analytics','meta','instagram','linkedin','geoapify'
  ]::text[]));
