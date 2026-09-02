-- Foundry M1 PL/pgSQL conflict-resolution compatibility
--
-- private.foundry_claim_invitation returns an OUT column named workspace_id.
-- PL/pgSQL therefore treats unqualified workspace_id references inside
-- ON CONFLICT column lists as ambiguous between the OUT variable and table
-- columns. Keep the public return contract unchanged, but make both conflict
-- paths unambiguous.
--
-- This migration intentionally patches only the function definition created by
-- the immediately preceding M1 migration. Assertions make repository drift fail
-- loudly instead of silently leaving a partially corrected state.

do $patch$
declare
  v_definition text;
  v_original text;
begin
  if not exists (
    select 1
    from pg_constraint constraint_record
    where constraint_record.conrelid = 'public.foundry_enrolments'::regclass
      and constraint_record.conname = 'foundry_enrolments_workspace_id_application_id_key'
      and constraint_record.contype = 'u'
  ) then
    raise exception 'Expected Foundry enrolment workspace/application unique constraint is missing';
  end if;

  select pg_get_functiondef(
    'private.foundry_claim_invitation(text,uuid,text)'::regprocedure
  ) into v_definition;

  if v_definition is null then
    raise exception 'Foundry claim function is missing';
  end if;

  v_original := v_definition;

  if position(
    'on conflict (workspace_id, user_id) do nothing'
    in v_definition
  ) = 0 then
    raise exception 'Expected workspace_members conflict clause was not found';
  end if;

  v_definition := replace(
    v_definition,
    'on conflict (workspace_id, user_id) do nothing',
    'on conflict do nothing'
  );

  if position(
    'on conflict (workspace_id, application_id) do update'
    in v_definition
  ) = 0 then
    raise exception 'Expected foundry_enrolments conflict clause was not found';
  end if;

  v_definition := replace(
    v_definition,
    'on conflict (workspace_id, application_id) do update',
    'on conflict on constraint foundry_enrolments_workspace_id_application_id_key do update'
  );

  if v_definition = v_original then
    raise exception 'Foundry claim function patch made no changes';
  end if;

  execute v_definition;
end;
$patch$;
