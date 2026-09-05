begin;

-- Foundry legacy reconciliation dry-run contract.
--
-- This suite intentionally performs no production migration and creates no
-- invitation, enrolment, workspace membership, student identity, or Auth user.
-- It converts the source reconciliation completed on 2026-09-04 into a
-- machine-verifiable release guard for the five source-backed rows while
-- keeping the two founder-gated rows impossible to include accidentally.

create temporary table foundry_legacy_reconciliation_dry_run (
  learner_name text not null,
  external_source text,
  external_source_id text,
  ufs_id text,
  source_status text,
  day1_status text,
  disposition text not null check (disposition in ('PRESERVE','HOLD')),
  intended_application_state text,
  intended_review_state text,
  invite boolean not null default false,
  enrol boolean not null default false,
  hold_reason text
) on commit drop;

insert into foundry_legacy_reconciliation_dry_run (
  learner_name, external_source, external_source_id, ufs_id,
  source_status, day1_status, disposition,
  intended_application_state, intended_review_state,
  invite, enrol, hold_reason
)
values
  (
    'Isha Malik', 'airtable_foundry_admissions', 'recsSDKcSMIbn3R3m', 'UFS-2',
    'Accepted', 'Accepted', 'PRESERVE',
    'accepted', 'accepted', false, false, null
  ),
  (
    'Komal', 'airtable_foundry_admissions', 'recg2uD8m1kioowzq', 'UFS-9',
    'Reviewing', 'Revision Required', 'PRESERVE',
    'reviewing', 'revision_required', false, false, null
  ),
  (
    'Malaika', 'airtable_foundry_admissions', 'recYkTeyYi8bEuwfn', 'UFS-1',
    'Accepted', 'Revision Required', 'PRESERVE',
    'accepted', 'revision_required', false, false, null
  ),
  (
    'Rabia', 'airtable_foundry_admissions', 'recaQPyB0FPupwTUR', 'UFS-11',
    'Reviewing', 'Pending', 'PRESERVE',
    'reviewing', 'pending', false, false, null
  ),
  (
    'Rubab', 'airtable_foundry_admissions', 'recpNs3Sk1h4vv6QG', 'UFS-3',
    'Reviewing', 'Accepted', 'PRESERVE',
    'reviewing', 'accepted', false, false, null
  ),
  (
    'Mian Anas', 'airtable_foundry_admissions', 'rec4cccaJuIvmKdSN', 'UFS-8',
    null, null, 'HOLD',
    null, null, false, false,
    'Airtable marks this as a test learner; founder must choose keep vs archive.'
  ),
  (
    'Qurat Ali', null, null, null,
    null, null, 'HOLD',
    null, null, false, false,
    'Distinct legacy Supabase intake has no matching Airtable admissions record; founder classification required.'
  );

do $$
declare
  total_rows integer;
  preserve_rows integer;
  hold_rows integer;
  unsafe_rows integer;
  duplicate_external_ids integer;
  incomplete_preserve_rows integer;
  executable_hold_rows integer;
begin
  select count(*) into total_rows
  from foundry_legacy_reconciliation_dry_run;

  if total_rows <> 7 then
    raise exception 'Foundry reconciliation contract failure: expected 7 rows, got %', total_rows;
  end if;

  select count(*) filter (where disposition='PRESERVE'),
         count(*) filter (where disposition='HOLD')
  into preserve_rows, hold_rows
  from foundry_legacy_reconciliation_dry_run;

  if preserve_rows <> 5 or hold_rows <> 2 then
    raise exception 'Foundry reconciliation contract failure: expected 5 PRESERVE / 2 HOLD, got % / %', preserve_rows, hold_rows;
  end if;

  select count(*) into unsafe_rows
  from foundry_legacy_reconciliation_dry_run
  where invite is true or enrol is true;

  if unsafe_rows <> 0 then
    raise exception 'Foundry reconciliation safety failure: dry-run attempted invite/enrolment for % row(s)', unsafe_rows;
  end if;

  select count(*) into duplicate_external_ids
  from (
    select external_source, external_source_id
    from foundry_legacy_reconciliation_dry_run
    where disposition='PRESERVE'
    group by external_source, external_source_id
    having count(*) > 1
  ) duplicates;

  if duplicate_external_ids <> 0 then
    raise exception 'Foundry reconciliation identity failure: duplicate external source IDs detected';
  end if;

  select count(*) into incomplete_preserve_rows
  from foundry_legacy_reconciliation_dry_run
  where disposition='PRESERVE'
    and (
      external_source <> 'airtable_foundry_admissions'
      or external_source_id is null
      or btrim(external_source_id) = ''
      or ufs_id is null
      or intended_application_state is null
      or intended_review_state is null
    );

  if incomplete_preserve_rows <> 0 then
    raise exception 'Foundry reconciliation identity failure: % PRESERVE row(s) are incomplete', incomplete_preserve_rows;
  end if;

  select count(*) into executable_hold_rows
  from foundry_legacy_reconciliation_dry_run
  where disposition='HOLD'
    and (
      intended_application_state is not null
      or intended_review_state is not null
      or invite is true
      or enrol is true
      or hold_reason is null
      or btrim(hold_reason) = ''
    );

  if executable_hold_rows <> 0 then
    raise exception 'Foundry reconciliation safety failure: HOLD rows contain executable migration state';
  end if;
end;
$$;

-- Intended diff report. CI output is evidence only; this transaction rolls back.
select
  learner_name,
  coalesce(external_source || ':' || external_source_id, 'UNRESOLVED') as source_identity,
  disposition,
  intended_application_state,
  intended_review_state,
  invite,
  enrol,
  hold_reason
from foundry_legacy_reconciliation_dry_run
order by case when disposition='PRESERVE' then 0 else 1 end, learner_name;

rollback;
select 'Foundry legacy reconciliation dry-run contract passed' as result;
