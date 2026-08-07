-- A refused import leaves the building importable again -- no owners, no units, no
-- total_area_m2 -- because v1 offers no re-import and no registry editing, so a partial write
-- is the one mistake this product cannot recover from.
--
-- `context/foundation/test-plan.md` §3 Phase 2, Risk #8 (atomicity half). Grounded in
-- `supabase/migrations/20260802101500_registry_assertion_security_definer.sql:956-1076`
-- (the current `import_building_units` body) -- one `WITH` statement combining the owners
-- insert and the units insert, so a mid-statement failure on either aborts both.
--
-- The mid-statement case deliberately does NOT use EM001, EM002 or EM005 -- all three return
-- before any insert is attempted, so a fixture that only reaches one of them proves nothing
-- about atomicity, only about the early-return guards Phase 1 already exercises indirectly.
-- The unique constraint on (building_id, unit_number) is the cheapest way to force a failure
-- genuinely mid-statement, after the owners half of the CTE has notionally run.
--
-- `set constraints all immediate` / `set constraints all deferred` follows the pattern
-- `owner_holds_units.test.sql` established for the deferred registry check.
--
-- pgTAP is created inside this transaction and rolled back with it, so it never reaches a
-- migration and therefore never reaches production.

begin;

create extension if not exists pgtap;

select plan(9);

set local role authenticated;

-- ---------------------------------------------------------------------------
-- Mid-statement unique violation: two rows share a unit_number, otherwise valid and distinct
-- (different owners, different e-mails, so EM005 does not fire first). The whole statement --
-- both the owners insert and the units insert -- must roll back together.
-- ---------------------------------------------------------------------------

insert into public.buildings (id, name, city, street, total_area_m2)
values ('aaaaaaaa-0005-4000-8000-000000000001', 'Testowa Atomowosc Duplikat', 'Warszawa', 'Atomowosc 1', null);

select throws_ok(
  format(
    $$ select public.import_building_units('aaaaaaaa-0005-4000-8000-000000000001'::uuid, %L::jsonb) $$,
    '[
      {"unit_number":"1","area_m2":"40.00","share_bps":5000,"full_name":"Jan Duplikat","email":"jan.duplikat@example.test"},
      {"unit_number":"1","area_m2":"60.00","share_bps":5000,"full_name":"Anna Duplikat","email":"anna.duplikat@example.test"}
    ]'
  ),
  '23505',
  null,
  'two rows sharing a unit_number fail mid-statement on the unique constraint'
);

select is(
  (select count(*)::int from public.units where building_id = 'aaaaaaaa-0005-4000-8000-000000000001'),
  0,
  'the failed import left zero unit rows -- the units half of the CTE did not survive'
);

select is(
  (select count(*)::int from public.owners where building_id = 'aaaaaaaa-0005-4000-8000-000000000001'),
  0,
  'the failed import left zero owner rows -- the owners half of the SAME statement rolled back too'
);

select is(
  (select total_area_m2 from public.buildings where id = 'aaaaaaaa-0005-4000-8000-000000000001'),
  null::numeric,
  'total_area_m2 was never written -- the building is importable again'
);

-- ---------------------------------------------------------------------------
-- Deferred share-total failure: rows are individually valid and distinct, but total 9000 bps,
-- not 10000. The RPC call itself returns normally -- the check is deferred to commit, or to an
-- explicit immediate check, exactly like a single PostgREST request's own transaction would
-- enforce at ITS commit. This case's rows are deliberately not asserted absent afterward: see
-- plan.md, "What We're NOT Doing".
-- ---------------------------------------------------------------------------

insert into public.buildings (id, name, city, street, total_area_m2)
values ('aaaaaaaa-0005-4000-8000-000000000002', 'Testowa Atomowosc Niedobor', 'Warszawa', 'Atomowosc 2', null);

select lives_ok(
  format(
    $$ select public.import_building_units('aaaaaaaa-0005-4000-8000-000000000002'::uuid, %L::jsonb) $$,
    '[
      {"unit_number":"1","area_m2":"90.00","share_bps":9000,"full_name":"Ewa Niedobor","email":"ewa.niedobor@example.test"}
    ]'
  ),
  'a registry totalling 9000 of 10000 bps is accepted by the RPC call itself -- the check is deferred'
);

select throws_ok(
  'set constraints all immediate',
  'EM003',
  null,
  'the deferred registry check refuses the same import at commit-equivalent time'
);
set constraints all deferred;

-- ---------------------------------------------------------------------------
-- Positive control: a clean import writes everything and stores the correct total. Without
-- this, the suite would only know how to detect failure, not recognise success.
-- ---------------------------------------------------------------------------

insert into public.buildings (id, name, city, street, total_area_m2)
values ('aaaaaaaa-0005-4000-8000-000000000003', 'Testowa Atomowosc Czysty', 'Warszawa', 'Atomowosc 3', null);

select lives_ok(
  format(
    $$ select public.import_building_units('aaaaaaaa-0005-4000-8000-000000000003'::uuid, %L::jsonb) $$,
    '[
      {"unit_number":"1","area_m2":"40.00","share_bps":4000,"full_name":"Karol Czysty","email":"karol.czysty@example.test"},
      {"unit_number":"2","area_m2":"60.00","share_bps":6000,"full_name":"Beata Czysty","email":"beata.czysty@example.test"}
    ]'
  ),
  'a clean, non-conflicting, 10000-bps registry imports without error'
);

select is(
  (select count(*)::int from public.units where building_id = 'aaaaaaaa-0005-4000-8000-000000000003'),
  2,
  'both rows of the clean import landed'
);

select is(
  (select total_area_m2 from public.buildings where id = 'aaaaaaaa-0005-4000-8000-000000000003'),
  100.00::numeric,
  'total_area_m2 equals the sum of the imported areas (40.00 + 60.00)'
);

reset role;

select * from finish();

rollback;
