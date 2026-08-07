-- Głos jest ostateczny -- a second vote by the same właściciel fails at every layer
-- independently, and finality holds even at the one caller RLS cannot reach.
--
-- `context/foundation/test-plan.md` §3 Phase 2, Risk #4. Three independent mechanisms are
-- exercised on purpose, because the risk guidance names "asserting one mechanism and assuming
-- the rest" as the anti-pattern: the RLS policies on `public.votes`
-- (`supabase/migrations/20260803090500_create_votes.sql:416-503`, the one table where
-- `authenticated` is NOT unconditional), `assert_vote_immutable` / EM010 (:518-540, a trigger
-- rather than a policy because `cast_vote` is `security definer` and bypasses RLS entirely),
-- and `votes_resolution_owner_key` (:369, binds any future writer, not only `cast_vote`).
--
-- The EM010 and unique-constraint assertions insert a vote row directly, as the connecting
-- role (bypasses RLS the way `cast_vote`'s SECURITY DEFINER context does), never through
-- `cast_vote` -- proving these two mechanisms bind the write path itself, independent of the
-- policies already proven above them.
--
-- pgTAP is created inside this transaction and rolled back with it, so it never reaches a
-- migration and therefore never reaches production.

begin;

create extension if not exists pgtap;

select plan(8);

insert into public.buildings (id, name, city, street, total_area_m2)
values ('aaaaaaaa-0002-4000-8000-000000000001', 'Testowa Finalnosc', 'Warszawa', 'Finalnosc 1', 100.00);

-- Owner A: the cast_vote double-call test. Owner B: the direct-insert bypass tests (EM010,
-- unique constraint) -- kept apart from A so the two groups never collide on
-- votes_resolution_owner_key.
insert into public.owners (id, building_id, full_name, email)
values
  ('bbbbbbbb-0002-4000-8000-000000000001', 'aaaaaaaa-0002-4000-8000-000000000001', 'Anna Finalnosc', 'anna.finalnosc@example.test'),
  ('bbbbbbbb-0002-4000-8000-000000000002', 'aaaaaaaa-0002-4000-8000-000000000001', 'Piotr Finalnosc', 'piotr.finalnosc@example.test');

-- A's share is deliberately well under half the building (3000/10000): a single vote from A
-- must not itself decide the resolution, or the second cast_vote call below would hit the
-- already-decided neutral path instead of the finality property this file is testing.
insert into public.units (building_id, owner_id, unit_number, area_m2, share_bps)
values
  ('aaaaaaaa-0002-4000-8000-000000000001', 'bbbbbbbb-0002-4000-8000-000000000001', '1', 30.00, 3000),
  ('aaaaaaaa-0002-4000-8000-000000000001', 'bbbbbbbb-0002-4000-8000-000000000002', '2', 70.00, 7000);

insert into public.resolutions (id, building_id, number, title, body, status, opened_at)
values ('cccccccc-0002-4000-8000-000000000001', 'aaaaaaaa-0002-4000-8000-000000000001',
        '1/2026', 'Uchwala finalnosci', 'Tresc', 'draft', null);

insert into public.voting_links (id, resolution_id, owner_id, building_id, token)
values
  ('dddddddd-0002-4000-8000-000000000001', 'cccccccc-0002-4000-8000-000000000001',
   'bbbbbbbb-0002-4000-8000-000000000001', 'aaaaaaaa-0002-4000-8000-000000000001',
   'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF'),
  ('dddddddd-0002-4000-8000-000000000002', 'cccccccc-0002-4000-8000-000000000001',
   'bbbbbbbb-0002-4000-8000-000000000002', 'aaaaaaaa-0002-4000-8000-000000000001',
   'GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG');

update public.resolutions
   set status = 'open', opened_at = now()
 where id = 'cccccccc-0002-4000-8000-000000000001';

-- ---------------------------------------------------------------------------
-- RLS: insert raises (with check (false)); update/delete filter to zero rows, no exception --
-- for BOTH roles. votes is the one table where authenticated is not unconditional.
-- ---------------------------------------------------------------------------

set local role anon;
select throws_ok(
  $$ insert into public.votes (resolution_id, owner_id, building_id, voting_link_id, choice, share_bps)
     values ('cccccccc-0002-4000-8000-000000000001', 'bbbbbbbb-0002-4000-8000-000000000001',
             'aaaaaaaa-0002-4000-8000-000000000001', 'dddddddd-0002-4000-8000-000000000001',
             'for', 6000) $$,
  '42501',
  null,
  'anon cannot insert a vote directly -- cast_vote is the only door'
);
reset role;

set local role authenticated;
select throws_ok(
  $$ insert into public.votes (resolution_id, owner_id, building_id, voting_link_id, choice, share_bps)
     values ('cccccccc-0002-4000-8000-000000000001', 'bbbbbbbb-0002-4000-8000-000000000001',
             'aaaaaaaa-0002-4000-8000-000000000001', 'dddddddd-0002-4000-8000-000000000001',
             'for', 6000) $$,
  '42501',
  null,
  'authenticated cannot insert a vote directly either -- the one table where it is not unconditional'
);
reset role;

-- ---------------------------------------------------------------------------
-- cast_vote finality: a second call with the same token and a different choice does not
-- change what is stored.
-- ---------------------------------------------------------------------------

set local role anon;

select results_eq(
  $$ select vote_recorded, vote_choice
       from public.cast_vote('FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF', 'for') $$,
  $$ values (true, 'for'::text) $$,
  'the first cast_vote call records the vote as cast'
);

select results_eq(
  $$ select vote_recorded, vote_choice
       from public.cast_vote('FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF', 'against') $$,
  $$ values (false, 'for'::text) $$,
  'a second cast_vote call with a different choice reports not-recorded and returns the FIRST choice, unchanged'
);

reset role;

select is(
  (select count(*)::int from public.votes
    where resolution_id = 'cccccccc-0002-4000-8000-000000000001'
      and owner_id = 'bbbbbbbb-0002-4000-8000-000000000001'),
  1,
  'exactly one vote row exists for the owner after two cast_vote calls'
);

-- ---------------------------------------------------------------------------
-- EM010: the trigger binds the write path itself, independent of RLS -- inserted directly,
-- bypassing cast_vote, as the connecting role (which bypasses RLS the same way cast_vote's
-- SECURITY DEFINER context does).
-- ---------------------------------------------------------------------------

insert into public.votes (id, resolution_id, owner_id, building_id, voting_link_id, choice, share_bps)
values ('eeeeeeee-0002-4000-8000-000000000001', 'cccccccc-0002-4000-8000-000000000001',
        'bbbbbbbb-0002-4000-8000-000000000002', 'aaaaaaaa-0002-4000-8000-000000000001',
        'dddddddd-0002-4000-8000-000000000002', 'against', 7000);

select throws_ok(
  $$ update public.votes set choice = 'for' where id = 'eeeeeeee-0002-4000-8000-000000000001' $$,
  'EM010',
  null,
  'a vote cannot be changed, even bypassing RLS entirely -- the trigger is what binds this'
);

select throws_ok(
  $$ delete from public.votes where id = 'eeeeeeee-0002-4000-8000-000000000001' $$,
  'EM010',
  null,
  'a vote cannot be withdrawn, even bypassing RLS entirely -- the trigger is what binds this'
);

-- ---------------------------------------------------------------------------
-- votes_resolution_owner_key: binds any writer, not only cast_vote.
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ insert into public.votes (resolution_id, owner_id, building_id, voting_link_id, choice, share_bps)
     values ('cccccccc-0002-4000-8000-000000000001', 'bbbbbbbb-0002-4000-8000-000000000002',
             'aaaaaaaa-0002-4000-8000-000000000001', 'dddddddd-0002-4000-8000-000000000002',
             'for', 7000) $$,
  '23505',
  null,
  'a second vote row for the same (resolution, owner) is refused by the unique constraint, independent of the trigger'
);

select * from finish();

rollback;
