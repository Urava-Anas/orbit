do $$
begin
  if to_regclass('public.foundry_class_learning_notes') is not null then
    alter table public.foundry_class_learning_notes
      drop constraint if exists foundry_class_learning_notes_learning_state_check;

    alter table public.foundry_class_learning_notes
      add constraint foundry_class_learning_notes_learning_state_check
      check (learning_state = any (array[
        'introduced'::text,
        'practising'::text,
        'understood'::text,
        'applied'::text,
        'mastered'::text
      ]));
  end if;
end
$$;
