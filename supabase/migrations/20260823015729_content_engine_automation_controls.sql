alter table public.content_brand_profiles
  add column if not exists daily_generation_enabled boolean not null default false,
  add column if not exists generation_hour smallint not null default 6 check (generation_hour between 0 and 23),
  add column if not exists approval_required boolean not null default true;

comment on column public.content_brand_profiles.daily_generation_enabled is 'When true, the workspace is eligible for the daily Content Engine generation job.';
comment on column public.content_brand_profiles.generation_hour is 'Local hour in the profile timezone when a daily batch should be generated.';
comment on column public.content_brand_profiles.approval_required is 'When true, generated content can never enter the publishing queue until a human approves it.';
