-- An uchwała is decided against the WHOLE building, never against the udziały cast, and it
-- flips exactly where FR-007 says it must -- not one basis point earlier.
--
-- `context/foundation/test-plan.md` §3 Phase 2, Risk #2 (threshold half). Grounded directly in
-- `supabase/migrations/20260804213630_resolution_outcome.sql` (`resolution_tally`,
-- `apply_resolution_outcome`) and `20260805084000_assert_outcome_matches_tally.sql` (EM014).
--
-- The knife-edge assertions use 5000 / 4999 / 1 bps splits on purpose: `for_bps * 2 > 10000`
-- is false at exactly 5000 (5000*2 = 10000, not greater) and true at 5001 -- the smallest
-- possible margin, and the one place a `>=` typo instead of `>` would go unnoticed by any
-- fixture using a larger margin. This is the assertion the risk guidance names by name ("the
-- near-threshold uchwała where one rounding decision changes the result").
--
-- The lock-ordering property that makes the threshold correct under concurrent voters
-- (`lock_resolution_for_outcome` / `votes_lock_resolution`, migration lines 1189-1259) is
-- pinned structurally here rather than by reproducing a real two-transaction race -- see
-- `context/changes/testing-database-contract-tests/plan.md`, "What We're NOT Doing", for why:
-- `dblink` sessions cannot see this file's uncommitted fixtures under READ COMMITTED, and a
-- committed-then-cleaned-up fixture would break the rollback-only convention every pgTAP file
-- in this project holds to.
--
-- pgTAP is created inside this transaction and rolled back with it, so it never reaches a
-- migration and therefore never reaches production.

begin;

create extension if not exists pgtap;

select plan(9);

-- ---------------------------------------------------------------------------
-- Structural: the lock is taken BEFORE the insert, not after. Moving it to AFTER is exactly
-- the edit that deadlocked two concurrent voters (migration comment, lines 1205-1226) -- this
-- is the fact that must never silently change.
-- ---------------------------------------------------------------------------

select trigger_is(
  'public', 'votes', 'votes_lock_resolution', 'public', 'lock_resolution_for_outcome',
  'votes_lock_resolution calls lock_resolution_for_outcome'
);

select is(
  (select action_timing from information_schema.triggers
    where event_object_schema = 'public' and event_object_table = 'votes'
      and trigger_name = 'votes_lock_resolution'),
  'BEFORE',
  'votes_lock_resolution fires BEFORE INSERT -- AFTER is the exact edit that deadlocks two concurrent voters'
);

-- ---------------------------------------------------------------------------
-- Building A: the 'for' knife edge. X=5000, Y=4999, Z=1 bps -- sums to exactly 10000.
-- ---------------------------------------------------------------------------

insert into public.buildings (id, name, city, street, total_area_m2)
values ('aaaaaaaa-0004-4000-8000-00000000000a', 'Testowa Prog Za', 'Warszawa', 'Prog Za 1', 100.00);

insert into public.owners (id, building_id, full_name, email)
values
  ('bbbbbbbb-0004-4000-8000-000000000001', 'aaaaaaaa-0004-4000-8000-00000000000a', 'X Prog', 'x.prog@example.test'),
  ('bbbbbbbb-0004-4000-8000-000000000002', 'aaaaaaaa-0004-4000-8000-00000000000a', 'Y Prog', 'y.prog@example.test'),
  ('bbbbbbbb-0004-4000-8000-000000000003', 'aaaaaaaa-0004-4000-8000-00000000000a', 'Z Prog', 'z.prog@example.test');

insert into public.units (building_id, owner_id, unit_number, area_m2, share_bps)
values
  ('aaaaaaaa-0004-4000-8000-00000000000a', 'bbbbbbbb-0004-4000-8000-000000000001', '1', 50.00, 5000),
  ('aaaaaaaa-0004-4000-8000-00000000000a', 'bbbbbbbb-0004-4000-8000-000000000002', '2', 49.99, 4999),
  ('aaaaaaaa-0004-4000-8000-00000000000a', 'bbbbbbbb-0004-4000-8000-000000000003', '3', 0.01, 1);

insert into public.resolutions (id, building_id, number, title, body, status, opened_at)
values ('cccccccc-0004-4000-8000-00000000000a', 'aaaaaaaa-0004-4000-8000-00000000000a',
        '1/2026', 'Uchwala progu za', 'Tresc', 'draft', null);

insert into public.voting_links (id, resolution_id, owner_id, building_id, token)
values
  ('dddddddd-0004-4000-8000-000000000001', 'cccccccc-0004-4000-8000-00000000000a',
   'bbbbbbbb-0004-4000-8000-000000000001', 'aaaaaaaa-0004-4000-8000-00000000000a',
   'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'),
  ('dddddddd-0004-4000-8000-000000000003', 'cccccccc-0004-4000-8000-00000000000a',
   'bbbbbbbb-0004-4000-8000-000000000003', 'aaaaaaaa-0004-4000-8000-00000000000a',
   'ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ');

update public.resolutions
   set status = 'open', opened_at = now()
 where id = 'cccccccc-0004-4000-8000-00000000000a';

-- The zero-vote tally: total_bps is the constant 10000 (never a re-sum of the registry), and
-- the two *_missing_bps figures are 5001, the smallest total that satisfies `bps * 2 > 10000`.
set local role authenticated;
select results_eq(
  $$ select total_bps, for_bps, against_bps, not_cast_bps, for_missing_bps, against_missing_bps
       from public.resolution_tally('cccccccc-0004-4000-8000-00000000000a') $$,
  $$ values (10000, 0, 0, 10000, 5001, 5001) $$,
  'zero-vote tally: total is the constant 10000, both sides need 5001 to cross'
);
reset role;

-- X votes 'for' at exactly 5000 bps -- for_bps * 2 = 10000, NOT greater than 10000, so the
-- resolution must stay open.
set local role anon;
select public.cast_vote('XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX', 'for');
reset role;

select is(
  (select status from public.resolutions where id = 'cccccccc-0004-4000-8000-00000000000a'),
  'open',
  'exactly 5000 of 10000 bps for -- 5000*2 is not greater than 10000, resolution stays open'
);

-- EM014 at the near boundary, not only the obviously-unsupported case below: for_missing_bps
-- is 1 here, not 0. A future re-derivation of resolution_outcome_supported's condition as
-- `for_bps >= 5000` instead of reusing resolution_tally's for_missing_bps = 0 would pass this
-- exact forgery through -- 5000 >= 5000 -- while the file's other EM014 case (zero votes at
-- all) stays green regardless, since it is nowhere near the boundary. Confirmed by hand, see
-- mutations.md.
set local role authenticated;
select throws_ok(
  $$ update public.resolutions
       set status = 'passed', decided_at = now()
     where id = 'cccccccc-0004-4000-8000-00000000000a' $$,
  'EM014',
  null,
  'one basis point short of the threshold is still refused -- not only the zero-vote case'
);
reset role;

-- Z votes 'for' at 1 more bp -- 5001*2 = 10002 > 10000, crossing the line by the smallest
-- possible margin.
set local role anon;
select public.cast_vote('ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ', 'for');
reset role;

select results_eq(
  $$ select status, (decided_at is not null) from public.resolutions
      where id = 'cccccccc-0004-4000-8000-00000000000a' $$,
  $$ values ('passed'::text, true) $$,
  '5001 of 10000 bps for -- one basis point past 5000 -- flips to passed, decided_at set'
);

-- ---------------------------------------------------------------------------
-- Building B: the symmetric 'against' knife edge. P=5000, Q=4999, R=1 bps.
-- ---------------------------------------------------------------------------

insert into public.buildings (id, name, city, street, total_area_m2)
values ('aaaaaaaa-0004-4000-8000-00000000000b', 'Testowa Prog Przeciw', 'Warszawa', 'Prog Przeciw 1', 100.00);

insert into public.owners (id, building_id, full_name, email)
values
  ('bbbbbbbb-0004-4000-8000-000000000004', 'aaaaaaaa-0004-4000-8000-00000000000b', 'P Prog', 'p.prog@example.test'),
  ('bbbbbbbb-0004-4000-8000-000000000005', 'aaaaaaaa-0004-4000-8000-00000000000b', 'Q Prog', 'q.prog@example.test'),
  ('bbbbbbbb-0004-4000-8000-000000000006', 'aaaaaaaa-0004-4000-8000-00000000000b', 'R Prog', 'r.prog@example.test');

insert into public.units (building_id, owner_id, unit_number, area_m2, share_bps)
values
  ('aaaaaaaa-0004-4000-8000-00000000000b', 'bbbbbbbb-0004-4000-8000-000000000004', '1', 50.00, 5000),
  ('aaaaaaaa-0004-4000-8000-00000000000b', 'bbbbbbbb-0004-4000-8000-000000000005', '2', 49.99, 4999),
  ('aaaaaaaa-0004-4000-8000-00000000000b', 'bbbbbbbb-0004-4000-8000-000000000006', '3', 0.01, 1);

insert into public.resolutions (id, building_id, number, title, body, status, opened_at)
values ('cccccccc-0004-4000-8000-00000000000b', 'aaaaaaaa-0004-4000-8000-00000000000b',
        '1/2026', 'Uchwala progu przeciw', 'Tresc', 'draft', null);

insert into public.voting_links (id, resolution_id, owner_id, building_id, token)
values
  ('dddddddd-0004-4000-8000-000000000004', 'cccccccc-0004-4000-8000-00000000000b',
   'bbbbbbbb-0004-4000-8000-000000000004', 'aaaaaaaa-0004-4000-8000-00000000000b',
   'PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPP'),
  ('dddddddd-0004-4000-8000-000000000006', 'cccccccc-0004-4000-8000-00000000000b',
   'bbbbbbbb-0004-4000-8000-000000000006', 'aaaaaaaa-0004-4000-8000-00000000000b',
   'RRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRR');

update public.resolutions
   set status = 'open', opened_at = now()
 where id = 'cccccccc-0004-4000-8000-00000000000b';

set local role anon;
select public.cast_vote('PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPP', 'against');
reset role;

select is(
  (select status from public.resolutions where id = 'cccccccc-0004-4000-8000-00000000000b'),
  'open',
  'exactly 5000 of 10000 bps against -- resolution stays open, symmetric to the ''for'' case'
);

set local role anon;
select public.cast_vote('RRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRR', 'against');
reset role;

select results_eq(
  $$ select status, (decided_at is not null) from public.resolutions
      where id = 'cccccccc-0004-4000-8000-00000000000b' $$,
  $$ values ('rejected'::text, true) $$,
  '5001 of 10000 bps against flips to rejected, decided_at set'
);

-- ---------------------------------------------------------------------------
-- EM014: no writer, however privileged, may record an outcome the votes do not support.
-- ---------------------------------------------------------------------------

insert into public.buildings (id, name, city, street, total_area_m2)
values ('aaaaaaaa-0004-4000-8000-00000000000c', 'Testowa Sfalszowany Wynik', 'Warszawa', 'Sfalszowany 1', 50.00);

insert into public.owners (id, building_id, full_name, email)
values ('bbbbbbbb-0004-4000-8000-00000000000f', 'aaaaaaaa-0004-4000-8000-00000000000c', 'F Falsz', 'f.falsz@example.test');

insert into public.units (building_id, owner_id, unit_number, area_m2, share_bps)
values ('aaaaaaaa-0004-4000-8000-00000000000c', 'bbbbbbbb-0004-4000-8000-00000000000f', '1', 50.00, 10000);

insert into public.resolutions (id, building_id, number, title, body, status, opened_at)
values ('cccccccc-0004-4000-8000-00000000000c', 'aaaaaaaa-0004-4000-8000-00000000000c',
        '1/2026', 'Uchwala sfalszowana', 'Tresc', 'draft', null);

update public.resolutions
   set status = 'open', opened_at = now()
 where id = 'cccccccc-0004-4000-8000-00000000000c';

set local role authenticated;
select throws_ok(
  $$ update public.resolutions
       set status = 'passed', decided_at = now()
     where id = 'cccccccc-0004-4000-8000-00000000000c' $$,
  'EM014',
  null,
  'a signed-in administrator cannot PATCH a resolution to passed with zero votes behind it'
);
reset role;

select * from finish();

rollback;
