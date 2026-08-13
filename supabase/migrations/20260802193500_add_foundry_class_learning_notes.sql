create table if not exists public.foundry_class_learning_notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  student_id uuid not null,
  class_id uuid not null,
  class_title_snapshot text not null
    check (char_length(class_title_snapshot) between 2 and 180),
  class_date timestamptz not null,
  lesson_summary text not null
    check (char_length(lesson_summary) between 2 and 1200),
  key_concepts text
    check (key_concepts is null or char_length(key_concepts) <= 2000),
  student_notes text not null
    check (char_length(student_notes) between 2 and 4000),
  learning_state text not null default 'introduced'
    check (learning_state in ('introduced', 'practising', 'understood', 'applied', 'mastered')),
  understanding_level smallint
    check (understanding_level is null or understanding_level between 1 and 5),
  student_progress_snapshot smallint
    check (
      student_progress_snapshot is null
      or student_progress_snapshot between 0 and 100
    ),
  progress_summary text
    check (progress_summary is null or char_length(progress_summary) <= 1200),
  support_note text
    check (support_note is null or char_length(support_note) <= 1200),
  next_step text
    check (next_step is null or char_length(next_step) <= 1200),
  resource_url text
    check (resource_url is null or char_length(resource_url) <= 500),
  created_by uuid not null default auth.uid()
    references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint foundry_class_learning_notes_student_same_workspace
    foreign key (workspace_id, student_id)
    references public.foundry_students(workspace_id, id)
    on delete cascade,
  constraint foundry_class_learning_notes_class_same_workspace
    foreign key (workspace_id, class_id)
    references public.foundry_classes(workspace_id, id)
    on delete cascade,
  constraint foundry_class_learning_notes_one_per_class
    unique (workspace_id, student_id, class_id)
);

create index if not exists foundry_class_learning_notes_student_date_idx
  on public.foundry_class_learning_notes (workspace_id, student_id, class_date desc);
create index if not exists foundry_class_learning_notes_class_idx
  on public.foundry_class_learning_notes (workspace_id, class_id);
create index if not exists foundry_class_learning_notes_created_by_idx
  on public.foundry_class_learning_notes (created_by);

alter table public.foundry_class_learning_notes enable row level security;

revoke all on table public.foundry_class_learning_notes from anon;
grant select, insert, update, delete
  on table public.foundry_class_learning_notes
  to authenticated;
grant all on table public.foundry_class_learning_notes to service_role;

drop policy if exists foundry_class_learning_notes_select_authorised
  on public.foundry_class_learning_notes;
create policy foundry_class_learning_notes_select_authorised
on public.foundry_class_learning_notes
for select
to authenticated
using (
  (select private.has_capability(workspace_id, 'foundry.manage'))
  or (select private.has_capability(workspace_id, 'foundry.review'))
  or (
    (select private.has_capability(workspace_id, 'foundry.learn'))
    and (select private.is_foundry_student(workspace_id, student_id))
  )
);

drop policy if exists foundry_class_learning_notes_insert_staff
  on public.foundry_class_learning_notes;
create policy foundry_class_learning_notes_insert_staff
on public.foundry_class_learning_notes
for insert
to authenticated
with check (
  (
    (select private.has_capability(workspace_id, 'foundry.manage'))
    or (select private.has_capability(workspace_id, 'foundry.review'))
  )
  and created_by = (select auth.uid())
);

drop policy if exists foundry_class_learning_notes_update_staff
  on public.foundry_class_learning_notes;
create policy foundry_class_learning_notes_update_staff
on public.foundry_class_learning_notes
for update
to authenticated
using (
  (select private.has_capability(workspace_id, 'foundry.manage'))
  or (select private.has_capability(workspace_id, 'foundry.review'))
)
with check (
  (select private.has_capability(workspace_id, 'foundry.manage'))
  or (select private.has_capability(workspace_id, 'foundry.review'))
);

drop policy if exists foundry_class_learning_notes_delete_manage
  on public.foundry_class_learning_notes;
create policy foundry_class_learning_notes_delete_manage
on public.foundry_class_learning_notes
for delete
to authenticated
using ((select private.has_capability(workspace_id, 'foundry.manage')));

drop trigger if exists set_foundry_class_learning_notes_updated_at
  on public.foundry_class_learning_notes;
create trigger set_foundry_class_learning_notes_updated_at
before update on public.foundry_class_learning_notes
for each row execute function private.set_updated_at();

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'foundry_class_learning_notes'
  ) then
    alter publication supabase_realtime
      add table public.foundry_class_learning_notes;
  end if;
end
$$;
