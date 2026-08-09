alter table public.foundry_level_resources
  add column if not exists content text;

alter table public.foundry_level_resources
  alter column resource_url drop not null;

alter table public.foundry_level_resources
  drop constraint if exists foundry_level_resources_resource_kind_check;

alter table public.foundry_level_resources
  add constraint foundry_level_resources_resource_kind_check
  check (
    resource_kind = any (
      array[
        'pdf'::text,
        'link'::text,
        'video'::text,
        'file'::text,
        'tool'::text,
        'note'::text
      ]
    )
  );

alter table public.foundry_level_resources
  drop constraint if exists foundry_level_resources_resource_url_check;

alter table public.foundry_level_resources
  add constraint foundry_level_resources_resource_url_check
  check (
    resource_url is null
    or (char_length(resource_url) >= 8 and char_length(resource_url) <= 500)
  );

alter table public.foundry_level_resources
  add constraint foundry_level_resources_content_check
  check (content is null or char_length(content) <= 8000);

alter table public.foundry_level_resources
  add constraint foundry_level_resources_payload_check
  check (
    (
      resource_kind = 'note'
      and content is not null
      and char_length(btrim(content)) >= 2
    )
    or (
      resource_kind <> 'note'
      and resource_url is not null
    )
  );
