create table if not exists public.content_assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  content_id uuid not null references public.content_drafts(id) on delete cascade,
  asset_type text not null check (asset_type in ('image','video','document','link_preview')),
  source text not null default 'upload' check (source in ('upload','generated','library','external')),
  status text not null default 'pending' check (status in ('pending','generating','ready','failed','archived')),
  storage_bucket text,
  storage_path text,
  public_url text,
  mime_type text,
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  duration_seconds numeric(10,2) check (duration_seconds is null or duration_seconds >= 0),
  alt_text text,
  prompt text,
  generation_metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id)
);

create index if not exists content_assets_content_status_idx
  on public.content_assets(workspace_id, content_id, status, created_at desc);

alter table public.content_assets enable row level security;

drop policy if exists content_assets_select_member on public.content_assets;
create policy content_assets_select_member
on public.content_assets for select to authenticated
using ((select private.is_workspace_member(content_assets.workspace_id)));

drop policy if exists content_assets_manage_admin on public.content_assets;
create policy content_assets_manage_admin
on public.content_assets for all to authenticated
using (
  (select private.is_workspace_admin(content_assets.workspace_id))
  and (select private.orbit_workspace_can_write(content_assets.workspace_id))
)
with check (
  (select private.is_workspace_admin(content_assets.workspace_id))
  and (select private.orbit_workspace_can_write(content_assets.workspace_id))
);

drop trigger if exists content_assets_set_updated_at on public.content_assets;
create trigger content_assets_set_updated_at before update on public.content_assets
for each row execute function private.set_updated_at();

comment on table public.content_assets is
  'Media and document assets attached to approved Content Engine items. Media-required channels remain blocked until an asset is ready.';
