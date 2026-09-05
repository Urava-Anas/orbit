-- Extend project files to support connector-backed files that may not expose a URL.
alter table public.project_files
  add column if not exists external_ref text;

alter table public.project_files
  alter column url drop not null;

alter table public.project_files
  add constraint project_files_external_ref_check
    check (external_ref is null or char_length(external_ref) <= 500),
  add constraint project_files_location_check
    check (url is not null or external_ref is not null);

create unique index if not exists project_files_external_ref_unique
  on public.project_files(workspace_id, project_id, source, external_ref)
  where external_ref is not null;
