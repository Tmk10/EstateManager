-- Harness smoke test for the database contract layer.
--
-- This file proves the harness, not the schema. It is deliberately NOT the
-- contract suite `context/foundation/test-plan.md` §3 Phase 2 exists to buy:
-- that one must assert the electorate guards, vote finality, own-data-only, and
-- registry-import atomicity — including the delete-then-recreate bypass shape
-- that review already found live once.
--
-- pgTAP is created inside the transaction and rolled back with it, so it never
-- reaches a migration and therefore never reaches production. That is on
-- purpose: `supabase/migrations/` is applied to production by hand and is
-- forward-only, so test scaffolding must not enter it.
--
-- The whole file runs inside begin/rollback, so it writes nothing durable to the
-- local database. That matters here — the local stack holds hand-made test state
-- that must survive.

begin;

create extension if not exists pgtap;

select plan(4);

-- 1. The assertion mechanism itself evaluates.
select is(1, 1, 'pgTAP evaluates an assertion');

-- 2. A negative assertion really does distinguish failure from success, so a
--    green run is evidence rather than an empty suite reporting itself fine.
select throws_ok(
  'select 1 / 0',
  '22012',
  'division by zero',
  'pgTAP observes an error that should be raised'
);

-- 3. The suite runs against a migrated schema, not an empty database. Without
--    this, a suite could pass on a stack where no migration had been applied.
select has_table(
  'public',
  'resolutions',
  'the suite runs against a database with migrations applied'
);

-- 4. Assertions can execute AS a named role. Every test in §3 Phase 2 depends on
--    this and on nothing else — the rules it must prove ("nikt spoza rejestru
--    oddaje głos", own-data-only on the anon surface) are per-caller rules, and a
--    harness that cannot change caller cannot express them.
set local role anon;
select is(current_user::text, 'anon', 'assertions can execute as a named role');
reset role;

select * from finish();

rollback;
