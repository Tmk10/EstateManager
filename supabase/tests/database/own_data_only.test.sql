-- The unauthenticated surface returns the reader's own data and nothing about any other
-- właściciel -- across every column it exposes and every grant that could leak one outside it.
--
-- `context/foundation/test-plan.md` §3 Phase 2, Risk #6. Two independent guarantees:
--
-- 1. Column-grant containment (`supabase/migrations/20260802214500_restrict_voting_link_token_select.sql`):
--    table-level `select` on `voting_links` is revoked from `anon` and `authenticated`, and
--    re-granted column by column, excluding `token`. A column added to this table later is
--    invisible to both roles until it is explicitly added to the grant -- the migration's own
--    header calls this "the intended direction of failure".
-- 2. Visibility-contract containment (`supabase/migrations/20260803090500_create_votes.sql:681-748`):
--    `resolve_voting_link`'s comment states "NO OTHER OWNER'S VOTE MAY EVER JOIN THIS LIST".
--    This file proves it with a second owner's vote actually present to leak, not merely
--    absent -- a fixture with only one owner would pass this test by having nothing to fail on.
--
-- pgTAP is created inside this transaction and rolled back with it, so it never reaches a
-- migration and therefore never reaches production.

begin;

create extension if not exists pgtap;

select plan(6);

insert into public.buildings (id, name, city, street, total_area_m2)
values ('aaaaaaaa-0003-4000-8000-000000000001', 'Testowa Wlasne Dane', 'Warszawa', 'Wlasne Dane 1', 100.00);

-- Owner A holds TWO units, so owner_share_bps can be distinguished from "the whole building's
-- total" (10000) and from "the other unit's share alone" -- it must equal the SUM of exactly
-- A's own units (2000 + 1000 = 3000), never B's 7000 and never the building's 10000.
insert into public.owners (id, building_id, full_name, email)
values
  ('bbbbbbbb-0003-4000-8000-000000000001', 'aaaaaaaa-0003-4000-8000-000000000001', 'Anna Wlasne', 'anna.wlasne@example.test'),
  ('bbbbbbbb-0003-4000-8000-000000000002', 'aaaaaaaa-0003-4000-8000-000000000001', 'Piotr Wlasne', 'piotr.wlasne@example.test');

insert into public.units (building_id, owner_id, unit_number, area_m2, share_bps)
values
  ('aaaaaaaa-0003-4000-8000-000000000001', 'bbbbbbbb-0003-4000-8000-000000000001', '1', 20.00, 2000),
  ('aaaaaaaa-0003-4000-8000-000000000001', 'bbbbbbbb-0003-4000-8000-000000000001', '1A', 10.00, 1000),
  ('aaaaaaaa-0003-4000-8000-000000000001', 'bbbbbbbb-0003-4000-8000-000000000002', '2', 70.00, 7000);

insert into public.resolutions (id, building_id, number, title, body, status, opened_at)
values ('cccccccc-0003-4000-8000-000000000001', 'aaaaaaaa-0003-4000-8000-000000000001',
        '1/2026', 'Uchwala wlasnych danych', 'Tresc', 'draft', null);

insert into public.voting_links (id, resolution_id, owner_id, building_id, token)
values
  ('dddddddd-0003-4000-8000-000000000001', 'cccccccc-0003-4000-8000-000000000001',
   'bbbbbbbb-0003-4000-8000-000000000001', 'aaaaaaaa-0003-4000-8000-000000000001',
   'HHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHH'),
  ('dddddddd-0003-4000-8000-000000000002', 'cccccccc-0003-4000-8000-000000000001',
   'bbbbbbbb-0003-4000-8000-000000000002', 'aaaaaaaa-0003-4000-8000-000000000001',
   'JJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJ');

update public.resolutions
   set status = 'open', opened_at = now()
 where id = 'cccccccc-0003-4000-8000-000000000001';

-- Both owners vote, differently, as themselves -- so there is a real second owner's vote
-- present to leak if resolve_voting_link's isolation were ever loosened.
set local role anon;
select public.cast_vote('HHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHH', 'for');
select public.cast_vote('JJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJ', 'against');
reset role;

-- ---------------------------------------------------------------------------
-- Column-grant containment: token is unreachable by either role, at the grant level, which is
-- what makes select * fail structurally instead of by RLS coincidence.
-- ---------------------------------------------------------------------------

select ok(
  not has_column_privilege('anon', 'public.voting_links', 'token', 'select'),
  'anon has no select privilege on voting_links.token'
);

select ok(
  not has_column_privilege('authenticated', 'public.voting_links', 'token', 'select'),
  'authenticated has no select privilege on voting_links.token either -- narrowed 20260802214500'
);

set local role anon;
select throws_ok(
  $$ select * from public.voting_links limit 1 $$,
  '42501',
  null,
  'select * as anon fails on the grant, not merely on RLS -- token is not among the granted columns'
);
reset role;

set local role authenticated;
select throws_ok(
  $$ select * from public.voting_links limit 1 $$,
  '42501',
  null,
  'select * as authenticated fails the same way -- the same grant list, no admin exception'
);
reset role;

-- ---------------------------------------------------------------------------
-- resolve_voting_link: A's own view carries A's own data and none of B's, with B's vote
-- genuinely present to leak.
-- ---------------------------------------------------------------------------

set local role anon;

select results_eq(
  $$ select owner_full_name, owner_share_bps, own_vote_choice
       from public.resolve_voting_link('HHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHH') $$,
  $$ values ('Anna Wlasne'::text, 3000, 'for'::text) $$,
  'A''s own view: A''s name, the SUM of A''s own two units (2000+1000), and A''s own vote'
);

select results_eq(
  $$ select owner_full_name, owner_share_bps, own_vote_choice
       from public.resolve_voting_link('JJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJ') $$,
  $$ values ('Piotr Wlasne'::text, 7000, 'against'::text) $$,
  'B''s own view carries B''s data, not a trace of A''s'
);

reset role;

select * from finish();

rollback;
