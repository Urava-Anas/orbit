-- Recover the production project-file registry used by Orbit project workspaces.
create table if not exists public.project_files (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null,
  name text not null,
  file_type text not null default 'document',
  source text not null default 'link',
  url text not null,
  path text,
  notes text,
  is_primary boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_files_project_same_workspace
    foreign key (workspace_id, project_id)
    references public.projects(workspace_id, id) on delete cascade,
  constraint project_files_workspace_project_url_key unique (workspace_id, project_id, url),
  constraint project_files_name_check check (char_length(name) between 2 and 240),
  constraint project_files_file_type_check check (char_length(file_type) between 2 and 80),
  constraint project_files_source_check check (source in ('github','google_drive','file_library','upload','link')),
  constraint project_files_url_check check (char_length(url) between 1 and 1000),
  constraint project_files_path_check check (path is null or char_length(path) <= 1000),
  constraint project_files_notes_check check (notes is null or char_length(notes) <= 2000)
);

create index if not exists project_files_workspace_project_idx
  on public.project_files(workspace_id, project_id, created_at desc);

create trigger project_files_set_updated_at
before update on public.project_files
for each row execute function private.set_updated_at();

alter table public.project_files enable row level security;

create policy project_files_select_member on public.project_files
for select to authenticated
using ((select private.is_workspace_member(workspace_id)));

create policy project_files_insert_member on public.project_files
for insert to authenticated
with check ((select private.is_workspace_member(workspace_id)));

create policy project_files_update_member on public.project_files
for update to authenticated
using ((select private.is_workspace_member(workspace_id)))
with check ((select private.is_workspace_member(workspace_id)));

create policy project_files_delete_admin on public.project_files
for delete to authenticated
using ((select private.is_workspace_admin(workspace_id)));

revoke all on table public.project_files from anon, authenticated;
grant select, insert, update, delete on table public.project_files to authenticated;
