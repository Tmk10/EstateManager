-- The electorate of an open resolution is closed under every operation.
--
-- `context/foundation/test-plan.md` §3 Phase 2, Risk #3: someone outside the registry casts a
-- binding vote at another właściciel's weight, because one of the several independent guards
-- on an open resolution's electorate is relaxed by a later migration. Four error codes close
-- that surface (`supabase/migrations/20260803090000_harden_voting_links_and_resolutions.sql`):
-- EM008 (a delivered link cannot be repointed), EM009 (an open resolution cannot be deleted),
-- EM012 (no new link may be issued once voting has started, except the idempotent re-press an
-- existing owner's `on conflict do nothing` needs), EM013 (a delivered link cannot be deleted).
--
-- The bypass this file reproduces is the one that migration's own header narrates
-- (:181-206): PATCH a link's owner (refused, EM008) -> DELETE it -> POST a fresh one for a
-- different owner -> cast_vote at the wrong person's weight. EM008 alone already stops the
-- sequence at its first step; the test below says so rather than pretending the DELETE step is
-- still worth attempting once UPDATE has already raised.
--
-- The anon assertions below split on mechanism deliberately: INSERT is refused with `check
-- (false)`, which raises 42501 as a real exception. SELECT, UPDATE and DELETE are refused with
-- `using (false)`, which filters the candidate rows to nothing and therefore raises no
-- exception at all -- the statement succeeds and touches zero rows. A test that expected all
-- four to throw would be wrong about how RLS denial actually behaves for three of them.
--
-- pgTAP is created inside this transaction and rolled back with it, so it never reaches a
-- migration and therefore never reaches production.

begin;

create extension if not exists pgtap;

select plan(14);

-- A building of its own so nothing here depends on -- or disturbs -- the fixtures any other
-- suite carries. Three owners: A and B get links on the open resolution, C gets none (the
-- EM012 negative control -- a genuinely new voter).
insert into public.buildings (id, name, city, street, total_area_m2)
values ('aaaaaaaa-0001-4000-8000-000000000001', 'Testowa Elektorat', 'Warszawa', 'Elektorat 1', 100.00);

insert into public.owners (id, building_id, full_name, email)
values
  ('bbbbbbbb-0001-4000-8000-000000000001', 'aaaaaaaa-0001-4000-8000-000000000001', 'Anna Elektorat', 'anna.elektorat@example.test'),
  ('bbbbbbbb-0001-4000-8000-000000000002', 'aaaaaaaa-0001-4000-8000-000000000001', 'Piotr Elektorat', 'piotr.elektorat@example.test'),
  ('bbbbbbbb-0001-4000-8000-000000000003', 'aaaaaaaa-0001-4000-8000-000000000001', 'Celina Elektorat', 'celina.elektorat@example.test');

insert into public.units (building_id, owner_id, unit_number, area_m2, share_bps)
values
  ('aaaaaaaa-0001-4000-8000-000000000001', 'bbbbbbbb-0001-4000-8000-000000000001', '1', 40.00, 4000),
  ('aaaaaaaa-0001-4000-8000-000000000001', 'bbbbbbbb-0001-4000-8000-000000000002', '2', 40.00, 4000),
  ('aaaaaaaa-0001-4000-8000-000000000001', 'bbbbbbbb-0001-4000-8000-000000000003', '3', 20.00, 2000);

-- Two resolutions, both created draft: one is moved to open below (the electorate under
-- test), the other stays draft (EM009's positive control -- a draft stays deletable).
insert into public.resolutions (id, building_id, number, title, body, status, opened_at)
values
  ('cccccccc-0001-4000-8000-000000000001', 'aaaaaaaa-0001-4000-8000-000000000001',
   '1/2026', 'Uchwala otwarta', 'Tresc uchwaly otwartej', 'draft', null),
  ('cccccccc-0001-4000-8000-000000000002', 'aaaaaaaa-0001-4000-8000-000000000001',
   '2/2026', 'Uchwala robocza', 'Tresc uchwaly roboczej', 'draft', null);

-- Links minted WHILE the resolution is still draft, matching open.ts's real sequencing --
-- `assert_voting_link_issuable` (EM012) refuses a genuinely new link the moment status leaves
-- draft, so the application mints every owner's link first and flips status second.
insert into public.voting_links (id, resolution_id, owner_id, building_id, token)
values
  ('dddddddd-0001-4000-8000-000000000001', 'cccccccc-0001-4000-8000-000000000001',
   'bbbbbbbb-0001-4000-8000-000000000001', 'aaaaaaaa-0001-4000-8000-000000000001',
   'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'),
  ('dddddddd-0001-4000-8000-000000000002', 'cccccccc-0001-4000-8000-000000000001',
   'bbbbbbbb-0001-4000-8000-000000000002', 'aaaaaaaa-0001-4000-8000-000000000001',
   'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB');

-- Now open the vote on the first resolution -- the transition draft -> open, the only one
-- EM007 permits besides open -> passed/rejected.
update public.resolutions
   set status = 'open', opened_at = now()
 where id = 'cccccccc-0001-4000-8000-000000000001';

set local role authenticated;

-- ---------------------------------------------------------------------------
-- EM008 -- a delivered link cannot be repointed
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ update public.voting_links
       set owner_id = 'bbbbbbbb-0001-4000-8000-000000000002'
     where id = 'dddddddd-0001-4000-8000-000000000001' $$,
  'EM008',
  null,
  'a delivered voting link cannot be repointed to another owner'
);

-- ---------------------------------------------------------------------------
-- EM009 -- an open resolution cannot be deleted; a draft one still can
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ delete from public.resolutions where id = 'cccccccc-0001-4000-8000-000000000001' $$,
  'EM009',
  null,
  'an open resolution cannot be deleted'
);

select lives_ok(
  $$ delete from public.resolutions where id = 'cccccccc-0001-4000-8000-000000000002' $$,
  'a draft resolution -- nobody asked, no link delivered -- can still be deleted'
);

-- ---------------------------------------------------------------------------
-- EM012 -- no new link for an open resolution, except the idempotent re-press
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ insert into public.voting_links (resolution_id, owner_id, building_id, token)
     values ('cccccccc-0001-4000-8000-000000000001', 'bbbbbbbb-0001-4000-8000-000000000003',
             'aaaaaaaa-0001-4000-8000-000000000001',
             'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC') $$,
  'EM012',
  null,
  'a genuinely new voter gets no link once voting has started'
);

-- The idempotent second press: an owner who already holds a link for this resolution is let
-- through EM012's own exception clause, and refused instead by the unique constraint --
-- proving open.ts's `on conflict do nothing` upsert stays a no-op rather than becoming EM012.
select throws_ok(
  $$ insert into public.voting_links (resolution_id, owner_id, building_id, token)
     values ('cccccccc-0001-4000-8000-000000000001', 'bbbbbbbb-0001-4000-8000-000000000001',
             'aaaaaaaa-0001-4000-8000-000000000001',
             'DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD') $$,
  '23505',
  null,
  're-issuing a link to an owner who already holds one is a unique-constraint no-op, not EM012'
);

-- ---------------------------------------------------------------------------
-- EM013 -- a delivered link cannot be deleted
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ delete from public.voting_links where id = 'dddddddd-0001-4000-8000-000000000002' $$,
  'EM013',
  null,
  'a delivered voting link cannot be deleted while its resolution is open'
);

-- ---------------------------------------------------------------------------
-- The bypass sequence, reproduced and confirmed closed at its first step
-- ---------------------------------------------------------------------------
--
-- 20260803090000_harden_voting_links_and_resolutions.sql:181-206 narrates PATCH (refused) ->
-- DELETE (201/204 before the fix) -> POST for a different owner -> a vote cast at the wrong
-- person's weight. EM008 above already refuses the PATCH; there is no second step to attempt.
select throws_ok(
  $$ update public.voting_links
       set owner_id = 'bbbbbbbb-0001-4000-8000-000000000003'
     where id = 'dddddddd-0001-4000-8000-000000000002' $$,
  'EM008',
  null,
  'the bypass sequence''s first step (repoint) is refused, so its DELETE/POST steps are unreachable'
);

reset role;

-- ---------------------------------------------------------------------------
-- anon: denied on every operation on both tables, matching every other table's shape.
-- INSERT raises (with check (false)); SELECT/UPDATE/DELETE filter to zero rows and raise
-- nothing (using (false)) -- asserted by touching zero rows, not by expecting an exception.
-- ---------------------------------------------------------------------------

set local role anon;

select throws_ok(
  $$ insert into public.resolutions (building_id, number, title, body, status)
     values ('aaaaaaaa-0001-4000-8000-000000000001', '9/2026', 'x', 'x', 'draft') $$,
  '42501',
  null,
  'anon cannot insert a resolution'
);

select is(
  (select count(*) from public.resolutions where id = 'cccccccc-0001-4000-8000-000000000001')::int,
  0,
  'anon sees zero resolution rows -- using (false) filters silently, no exception'
);

update public.resolutions set title = 'PWNED' where id = 'cccccccc-0001-4000-8000-000000000001';
delete from public.resolutions where id = 'cccccccc-0001-4000-8000-000000000001';

select throws_ok(
  $$ insert into public.voting_links (resolution_id, owner_id, building_id, token)
     values ('cccccccc-0001-4000-8000-000000000001', 'bbbbbbbb-0001-4000-8000-000000000003',
             'aaaaaaaa-0001-4000-8000-000000000001',
             'EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE') $$,
  '42501',
  null,
  'anon cannot insert a voting link'
);

select is(
  (select count(*) from public.voting_links where id = 'dddddddd-0001-4000-8000-000000000001')::int,
  0,
  'anon sees zero voting_links rows -- using (false) filters silently, no exception'
);

delete from public.voting_links where id = 'dddddddd-0001-4000-8000-000000000001';

reset role;

-- The anon UPDATE and DELETE above must have matched zero rows -- verified now, as a role that
-- can actually see the table, so the "no exception" half of the story is not mistaken for "it
-- worked".
select is(
  (select title from public.resolutions where id = 'cccccccc-0001-4000-8000-000000000001'),
  'Uchwala otwarta',
  'anon''s UPDATE matched zero rows under RLS -- the title is unchanged'
);

select ok(
  exists(select 1 from public.resolutions where id = 'cccccccc-0001-4000-8000-000000000001'),
  'anon''s DELETE matched zero rows under RLS -- the resolution still exists'
);

select ok(
  exists(select 1 from public.voting_links where id = 'dddddddd-0001-4000-8000-000000000001'),
  'anon''s DELETE matched zero rows under RLS -- the voting link still exists'
);

select * from finish();

rollback;
