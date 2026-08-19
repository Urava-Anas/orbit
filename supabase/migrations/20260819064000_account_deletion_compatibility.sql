-- Account deletion must not be blocked by historical actor-attribution foreign keys.
-- Workspace ownership remains RESTRICT: the deletion workflow removes owned workspaces first.

do $$
declare
  r record;
begin
  for r in
    select
      n.nspname as schema_name,
      c.relname as table_name,
      con.conname as constraint_name,
      a.attname as column_name
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    join lateral unnest(con.conkey) with ordinality k(attnum, ord) on true
    join pg_attribute a on a.attrelid = c.oid and a.attnum = k.attnum
    where con.contype = 'f'
      and con.confrelid = 'auth.users'::regclass
      and n.nspname = 'public'
      and array_length(con.conkey, 1) = 1
      and con.confdeltype in ('a', 'r')
      and not (c.relname = 'workspaces' and a.attname = 'owner_id')
  loop
    execute format(
      'alter table %I.%I alter column %I drop not null',
      r.schema_name, r.table_name, r.column_name
    );
    execute format(
      'alter table %I.%I drop constraint %I',
      r.schema_name, r.table_name, r.constraint_name
    );
    execute format(
      'alter table %I.%I add constraint %I foreign key (%I) references auth.users(id) on delete set null',
      r.schema_name, r.table_name, r.constraint_name, r.column_name
    );
  end loop;
end
$$;

comment on column public.workspaces.owner_id is
  'Account deletion must explicitly delete or transfer owned workspaces before deleting the auth user.';
