alter table public.relay_templates
  drop constraint if exists relay_templates_created_by_fkey;
alter table public.relay_templates
  add constraint relay_templates_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;

alter table public.relay_template_versions
  drop constraint if exists relay_template_versions_created_by_fkey;
alter table public.relay_template_versions
  add constraint relay_template_versions_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;

alter table public.relay_modules
  drop constraint if exists relay_modules_created_by_fkey;
alter table public.relay_modules
  add constraint relay_modules_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;