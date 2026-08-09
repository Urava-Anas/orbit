alter table public.foundry_classes
  add column if not exists level_number smallint not null default 1;
alter table public.foundry_classes
  drop constraint if exists foundry_classes_level_number_check;
alter table public.foundry_classes
  add constraint foundry_classes_level_number_check
  check (level_number between 1 and 100);

alter table public.foundry_tasks
  add column if not exists level_number smallint not null default 1;
alter table public.foundry_tasks
  drop constraint if exists foundry_tasks_level_number_check;
alter table public.foundry_tasks
  add constraint foundry_tasks_level_number_check
  check (level_number between 1 and 100);

alter table public.foundry_task_assignments
  add column if not exists starts_at timestamptz not null default now();
alter table public.foundry_task_assignments
  drop constraint if exists foundry_task_assignments_time_check;
alter table public.foundry_task_assignments
  add constraint foundry_task_assignments_time_check
  check (due_at > starts_at);

create index if not exists foundry_classes_level_idx
  on public.foundry_classes (workspace_id, department, level_number, starts_at);
create index if not exists foundry_tasks_level_idx
  on public.foundry_tasks (workspace_id, department, level_number, created_at desc);
create index if not exists foundry_assignments_student_time_idx
  on public.foundry_task_assignments (workspace_id, student_id, starts_at, due_at);

create table if not exists public.foundry_level_resources (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  request_id uuid not null,
  student_id uuid,
  department text,
  level_number smallint not null check (level_number between 1 and 100),
  title text not null check (char_length(title) between 2 and 180),
  resource_url text not null check (char_length(resource_url) between 8 and 500),
  resource_kind text not null default 'pdf'
    check (resource_kind in ('pdf','link','video','file')),
  status text not null default 'published'
    check (status in ('published','archived')),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint foundry_level_resources_student_same_workspace
    foreign key (workspace_id, student_id)
    references public.foundry_students(workspace_id, id)
    on delete cascade,
  constraint foundry_level_resources_request_unique
    unique (created_by, request_id)
);

create index if not exists foundry_level_resources_map_idx
  on public.foundry_level_resources (workspace_id, level_number, department, student_id, status);

alter table public.foundry_level_resources enable row level security;
revoke all on table public.foundry_level_resources from anon;
grant select, insert, update, delete on table public.foundry_level_resources to authenticated;
grant all on table public.foundry_level_resources to service_role;

drop policy if exists foundry_level_resources_select_authorised on public.foundry_level_resources;
create policy foundry_level_resources_select_authorised
on public.foundry_level_resources for select to authenticated
using (
  (select private.has_capability(workspace_id, 'foundry.manage'))
  or (select private.has_capability(workspace_id, 'foundry.review'))
  or (
    status = 'published'
    and (select private.has_capability(workspace_id, 'foundry.learn'))
    and (student_id is null or (select private.is_foundry_student(workspace_id, student_id)))
    and (select private.student_can_view_foundry_class(workspace_id, department))
  )
);

drop policy if exists foundry_level_resources_insert_manage on public.foundry_level_resources;
create policy foundry_level_resources_insert_manage
on public.foundry_level_resources for insert to authenticated
with check (
  (select private.has_capability(workspace_id, 'foundry.manage'))
  and created_by = auth.uid()
);

drop policy if exists foundry_level_resources_update_manage on public.foundry_level_resources;
create policy foundry_level_resources_update_manage
on public.foundry_level_resources for update to authenticated
using ((select private.has_capability(workspace_id, 'foundry.manage')))
with check ((select private.has_capability(workspace_id, 'foundry.manage')));

drop policy if exists foundry_level_resources_delete_manage on public.foundry_level_resources;
create policy foundry_level_resources_delete_manage
on public.foundry_level_resources for delete to authenticated
using ((select private.has_capability(workspace_id, 'foundry.manage')));

drop trigger if exists set_foundry_level_resources_updated_at on public.foundry_level_resources;
create trigger set_foundry_level_resources_updated_at
before update on public.foundry_level_resources
for each row execute function private.set_updated_at();

create table if not exists public.foundry_studio_assignments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  request_id uuid not null,
  student_id uuid not null,
  project_id uuid not null references public.projects(id) on delete restrict,
  project_name_snapshot text not null check (char_length(project_name_snapshot) between 2 and 180),
  level_number smallint not null check (level_number between 1 and 100),
  role_title text not null check (char_length(role_title) between 2 and 120),
  deliverable text not null check (char_length(deliverable) between 2 and 2000),
  starts_at timestamptz not null,
  due_at timestamptz not null,
  status text not null default 'planned'
    check (status in ('planned','active','completed','cancelled')),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint foundry_studio_assignments_student_same_workspace
    foreign key (workspace_id, student_id)
    references public.foundry_students(workspace_id, id)
    on delete cascade,
  constraint foundry_studio_assignments_time_check check (due_at > starts_at),
  constraint foundry_studio_assignments_request_unique unique (created_by, request_id)
);

create index if not exists foundry_studio_assignments_map_idx
  on public.foundry_studio_assignments (workspace_id, student_id, level_number, starts_at, due_at);
create index if not exists foundry_studio_assignments_project_idx
  on public.foundry_studio_assignments (workspace_id, project_id, status);

alter table public.foundry_studio_assignments enable row level security;
revoke all on table public.foundry_studio_assignments from anon;
grant select, insert, update, delete on table public.foundry_studio_assignments to authenticated;
grant all on table public.foundry_studio_assignments to service_role;

drop policy if exists foundry_studio_assignments_select_authorised on public.foundry_studio_assignments;
create policy foundry_studio_assignments_select_authorised
on public.foundry_studio_assignments for select to authenticated
using (
  (select private.has_capability(workspace_id, 'foundry.manage'))
  or (select private.has_capability(workspace_id, 'foundry.review'))
  or (
    (select private.has_capability(workspace_id, 'foundry.learn'))
    and (select private.is_foundry_student(workspace_id, student_id))
  )
);

drop policy if exists foundry_studio_assignments_insert_manage on public.foundry_studio_assignments;
create policy foundry_studio_assignments_insert_manage
on public.foundry_studio_assignments for insert to authenticated
with check (
  (select private.has_capability(workspace_id, 'foundry.manage'))
  and created_by = auth.uid()
);

drop policy if exists foundry_studio_assignments_update_manage on public.foundry_studio_assignments;
create policy foundry_studio_assignments_update_manage
on public.foundry_studio_assignments for update to authenticated
using ((select private.has_capability(workspace_id, 'foundry.manage')))
with check ((select private.has_capability(workspace_id, 'foundry.manage')));

drop policy if exists foundry_studio_assignments_delete_manage on public.foundry_studio_assignments;
create policy foundry_studio_assignments_delete_manage
on public.foundry_studio_assignments for delete to authenticated
using ((select private.has_capability(workspace_id, 'foundry.manage')));

drop trigger if exists set_foundry_studio_assignments_updated_at on public.foundry_studio_assignments;
create trigger set_foundry_studio_assignments_updated_at
before update on public.foundry_studio_assignments
for each row execute function private.set_updated_at();

create or replace function public.create_foundry_class_journey_command(
  target_workspace_id uuid,
  command_request_id uuid,
  class_title text,
  class_instructor_name text,
  class_department text,
  class_starts_at timestamptz,
  class_ends_at timestamptz,
  class_mode text,
  class_join_url text,
  class_notes text,
  class_level_number smallint
)
returns uuid
language plpgsql
set search_path to ''
set statement_timeout to '5s'
as $$
declare
  created_id uuid;
begin
  if class_level_number < 1 or class_level_number > 100 then
    raise exception 'Level number must be between 1 and 100' using errcode = '22003';
  end if;

  created_id := public.create_foundry_class_command(
    target_workspace_id,
    command_request_id,
    class_title,
    class_instructor_name,
    class_department,
    class_starts_at,
    class_ends_at,
    class_mode,
    class_join_url,
    class_notes
  );

  update public.foundry_classes
  set level_number = class_level_number
  where workspace_id = target_workspace_id and id = created_id;

  return created_id;
end;
$$;

grant execute on function public.create_foundry_class_journey_command(uuid,uuid,text,text,text,timestamptz,timestamptz,text,text,text,smallint) to authenticated;

create or replace function public.create_foundry_task_assignment_journey_command(
  target_workspace_id uuid,
  target_student_id uuid,
  command_request_id uuid,
  task_title text,
  task_instructions_roman_urdu text,
  task_department text,
  task_difficulty text,
  task_skill_dimension text,
  task_points smallint,
  assignment_starts_at timestamptz,
  assignment_due_at timestamptz,
  task_level_number smallint
)
returns table(task_id uuid, assignment_id uuid)
language plpgsql
set search_path to ''
set statement_timeout to '5s'
as $$
declare
  created_task_id uuid;
  created_assignment_id uuid;
begin
  if task_level_number < 1 or task_level_number > 100 then
    raise exception 'Level number must be between 1 and 100' using errcode = '22003';
  end if;
  if assignment_due_at <= assignment_starts_at then
    raise exception 'Task due time must be after start time' using errcode = '22007';
  end if;

  select created.task_id, created.assignment_id
  into created_task_id, created_assignment_id
  from public.create_foundry_task_assignment_command(
    target_workspace_id,
    target_student_id,
    command_request_id,
    task_title,
    task_instructions_roman_urdu,
    task_department,
    task_difficulty,
    task_skill_dimension,
    task_points,
    assignment_due_at
  ) as created;

  update public.foundry_tasks
  set level_number = task_level_number
  where workspace_id = target_workspace_id and id = created_task_id;

  update public.foundry_task_assignments
  set starts_at = assignment_starts_at
  where workspace_id = target_workspace_id and id = created_assignment_id;

  return query select created_task_id, created_assignment_id;
end;
$$;

grant execute on function public.create_foundry_task_assignment_journey_command(uuid,uuid,uuid,text,text,text,text,text,smallint,timestamptz,timestamptz,smallint) to authenticated;

with ranked as (
  select
    id,
    row_number() over (
      partition by workspace_id, coalesce(department, '')
      order by starts_at, id
    )::smallint as level_number
  from public.foundry_classes
)
update public.foundry_classes c
set level_number = ranked.level_number
from ranked
where c.id = ranked.id;

insert into public.foundry_level_resources (
  workspace_id,
  request_id,
  student_id,
  department,
  level_number,
  title,
  resource_url,
  resource_kind,
  status,
  created_by,
  created_at,
  updated_at
)
select
  n.workspace_id,
  gen_random_uuid(),
  n.student_id,
  c.department,
  c.level_number,
  'Level ' || c.level_number || ' · ' || n.class_title_snapshot,
  n.resource_url,
  'pdf',
  'published',
  n.created_by,
  n.created_at,
  n.updated_at
from public.foundry_class_learning_notes n
join public.foundry_classes c
  on c.workspace_id = n.workspace_id and c.id = n.class_id
where n.resource_url is not null
  and not exists (
    select 1
    from public.foundry_level_resources r
    where r.workspace_id = n.workspace_id
      and r.student_id = n.student_id
      and r.level_number = c.level_number
      and r.resource_url = n.resource_url
  );
