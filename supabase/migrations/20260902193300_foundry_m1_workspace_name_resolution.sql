-- Foundry M1 workspace-name resolution
--
-- private.foundry_claim_invitation returns an OUT column named workspace_id.
-- That output variable can collide with any unqualified workspace_id table
-- column inside the PL/pgSQL body, not only ON CONFLICT targets. CI #678 proved
-- the same class of ambiguity later in an UPDATE predicate.
--
-- Resolve the class once at function compilation time: where a bare identifier
-- could mean either a PL/pgSQL variable or a SQL column, prefer the SQL column.
-- The function never relies on the OUT workspace_id variable as an input value;
-- its return value is emitted explicitly from v_inv.workspace_id.
--
-- Keep this as a follow-up compatibility migration so the original M1 migration
-- remains an auditable record of what CI exercised in #676/#677/#678.

do $patch$
declare
  v_definition text;
  v_original text;
  v_marker text := E'AS $function$\ndeclare';
  v_replacement text := E'AS $function$\n#variable_conflict use_column\ndeclare';
begin
  select pg_get_functiondef(
    'private.foundry_claim_invitation(text,uuid,text)'::regprocedure
  ) into v_definition;

  if v_definition is null then
    raise exception 'Foundry claim function is missing';
  end if;

  if position('#variable_conflict use_column' in v_definition) > 0 then
    raise exception 'Foundry claim function already has a variable-conflict directive';
  end if;

  if position(v_marker in v_definition) = 0 then
    raise exception 'Expected Foundry claim function body marker was not found';
  end if;

  v_original := v_definition;
  v_definition := replace(v_definition, v_marker, v_replacement);

  if v_definition = v_original then
    raise exception 'Foundry workspace-name patch made no changes';
  end if;

  execute v_definition;
end;
$patch$;
