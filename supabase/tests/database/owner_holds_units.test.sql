-- An owner is someone who owns something.
--
-- `import_building_units` can never produce an owner with no lokal -- it derives
-- owners from the CSV's unit rows, so every owner it inserts gets a unit in the
-- same statement -- but nothing in the schema said so, and a row arriving by any
-- other route was accepted. One such owner reached the local database by hand and
-- surfaced on S-06's audit trail as "— (0,00%)": a member of the electorate
-- holding no udziały, listed among those whose silence counted as a no.
--
-- These tests pin the constraint that closes the route. Written before the
-- migration that satisfies them.
--
-- How a deferred constraint is tested at all: `set constraints all immediate` is
-- the only commit-like checkpoint available inside a transaction that must roll
-- back, and unlike `savepoint` it survives pgTAP's EXECUTE. So every assertion
-- here is on that statement rather than on the write itself -- which is also the
-- honest shape, because deferral means the write is never what fails.
--
-- pgTAP is created inside this transaction and rolled back with it, so it never
-- reaches a migration and therefore never reaches production. The whole file runs
-- inside begin/rollback: the local stack holds hand-made test state that must
-- survive a run.

begin;

create extension if not exists pgtap;

select plan(3);

-- A building of its own, so nothing here depends on -- or disturbs -- the fixtures
-- the rest of the local database carries. Two owners at half the building each.
insert into public.buildings (id, name, city, street, total_area_m2)
values ('aaaaaaaa-0000-4000-8000-000000000001', 'Testowa 1', 'Warszawa', 'Testowa 1', 100.00);

insert into public.owners (id, building_id, full_name, email)
values
  ('bbbbbbbb-0000-4000-8000-000000000001',
   'aaaaaaaa-0000-4000-8000-000000000001', 'Anna Kowalska', 'anna@example.test'),
  ('bbbbbbbb-0000-4000-8000-000000000002',
   'aaaaaaaa-0000-4000-8000-000000000001', 'Piotr Nowak', 'piotr@example.test');

insert into public.units (building_id, owner_id, unit_number, area_m2, share_bps)
values
  ('aaaaaaaa-0000-4000-8000-000000000001',
   'bbbbbbbb-0000-4000-8000-000000000001', '1', 50.00, 5000),
  ('aaaaaaaa-0000-4000-8000-000000000001',
   'bbbbbbbb-0000-4000-8000-000000000002', '2', 50.00, 5000);

-- 1. The shape the application actually writes stays legal. Asserted first and on
--    purpose: a constraint that refused a legitimate import would be worse than
--    the hole it closes, and this is the assertion that would catch it.
select lives_ok(
  'set constraints all immediate',
  'a registry where every owner holds a lokal commits'
);
set constraints all deferred;

-- 2. The hole itself: an owner with no lokal at all.
insert into public.owners (id, building_id, full_name, email)
values ('bbbbbbbb-0000-4000-8000-000000000003',
        'aaaaaaaa-0000-4000-8000-000000000001', 'Ewa Bezlokalowa', 'ewa@example.test');

select throws_ok(
  'set constraints all immediate',
  'EM015',
  null,
  'an owner holding no lokal is refused'
);
set constraints all deferred;

-- Removed before the next assertion, so what test 3 catches can only be test 3's
-- own violation and not this one wearing the same error code.
delete from public.owners where id = 'bbbbbbbb-0000-4000-8000-000000000003';

-- 3. The other way in: an owner who held a lokal and stops holding one. The
--    registry is static in v1, but the delete policy exists, and an invariant that
--    only guards inserts is one DELETE away from being untrue.
--
--    Anna's lokal is transferred to Piotr rather than simply deleted, so the
--    building still totals 10000 bps and 100 m2. That isolates the assertion: the
--    only thing wrong at the checkpoint is that Anna now owns nothing, so EM003
--    and EM004 cannot be what raises.
delete from public.units where owner_id = 'bbbbbbbb-0000-4000-8000-000000000001';
update public.units
   set share_bps = 10000, area_m2 = 100.00
 where owner_id = 'bbbbbbbb-0000-4000-8000-000000000002';

select throws_ok(
  'set constraints all immediate',
  'EM015',
  null,
  'an owner left holding no lokal is refused even when the registry still totals 100%'
);

select * from finish();

rollback;
