-- Migration: per-owner send state for the voting-link fanout.
-- Purpose:   Roadmap S-04. Record, per owner per resolution, whether their voting link has
--            been mailed -- enough to resume an interrupted fanout and to answer "who got
--            their link" on screen, and no more.
-- Affects:   public.voting_links (four columns, one constraint, one partial index, one
--            extension of the column-level select grant) and public.unsent_voting_links
--            (new function).
--
-- Why status is DERIVED rather than stored. There is no `status` column here, on purpose:
--
--   sent_at is not null                      -> wyslano
--   sent_at is null and attempt_count > 0    -> blad, showing last_error_code
--   attempt_count = 0                        -> niewyslane
--
-- A stored status column would be a second thing to keep consistent with the timestamps,
-- and this project has twice reached for a trigger to keep two representations in
-- agreement (units_registry_check, buildings_registry_check). Here that cost is avoided by
-- not creating the second representation at all.
--
-- Forward-only, one transaction, applied by hand with `npx supabase db push` BEFORE the
-- code that reads these columns is deployed. No existing row is rewritten: every column
-- added here is nullable or defaulted, so links minted by S-02 read as attempt_count = 0,
-- niewyslane -- which is exactly what they are.

begin;

-- ---------------------------------------------------------------------------
-- Send state
-- ---------------------------------------------------------------------------

alter table public.voting_links
  -- Null until a send SUCCEEDS. This column alone drives the resume: the fanout selects
  -- the links where it is null, so a run that dies half-way costs at most one owner's
  -- status rather than the whole run.
  add column sent_at timestamptz,

  -- When the most recent attempt ran, successful or not. Never consulted by the resume --
  -- it exists so an administrator looking at a stuck row can tell "never tried" from
  -- "tried and failed a minute ago".
  add column last_attempt_at timestamptz,

  -- Cloudflare's string code (or our own E_BINDING_MISSING) from the most recent FAILED
  -- attempt; null when the last attempt succeeded or none has run. Stored raw and
  -- untranslated: the Polish sentence is built at render time by describeSendFailure in
  -- src/lib/voting-link-email.ts, so a better wording later is a code change, not a
  -- backfill.
  add column last_error_code text,

  add column attempt_count integer not null default 0,

  add constraint voting_links_attempt_count_non_negative check (attempt_count >= 0),

  -- The invariant the resume depends on: a link cannot be both delivered and carrying a
  -- live error.
  --
  -- This holds ONLY because a successfully sent link is never re-attempted -- the fanout
  -- filters on `sent_at is null`, so nothing that has a sent_at can acquire an error code
  -- afterwards. Whoever adds the per-owner "send again" button that v1 deliberately omits
  -- is the person this comment is for: that button re-attempts a SENT link, and the first
  -- failure of one would violate this constraint. The fix at that point is to decide what a
  -- re-send failure means for a link that was already delivered once, not to drop the
  -- constraint.
  add constraint voting_links_send_state_check
    check (sent_at is null or last_error_code is null);

comment on column public.voting_links.sent_at is
  'When this link was successfully mailed to its owner. Null until then, and the sole
   driver of the S-04 resume: the fanout selects links where this is null.';

comment on column public.voting_links.last_attempt_at is
  'When the most recent send attempt ran, successful or not. Diagnostic only -- the resume
   does not read it.';

comment on column public.voting_links.last_error_code is
  'Raw provider error code (or E_BINDING_MISSING, ours) from the most recent FAILED
   attempt; null when the last attempt succeeded. Untranslated on purpose: the Polish
   sentence is built at render time, so rewording it is a code change, not a backfill.';

comment on column public.voting_links.attempt_count is
  'How many send attempts this link has seen. Distinguishes niewyslane (0) from a link that
   has been tried and failed, which sent_at alone cannot.';

-- Partial because the sent rows are exactly the ones the resume query never wants, so the
-- index shrinks towards nothing as a fanout completes rather than growing with the table.
create index voting_links_unsent_idx
  on public.voting_links (resolution_id)
  where sent_at is null;

-- ---------------------------------------------------------------------------
-- No new RLS policies, and one necessary extension of the column grant
-- ---------------------------------------------------------------------------

-- NO new policies. The four columns above inherit public.voting_links' existing eight:
-- `authenticated` unconditional, which is what lets the signed-in administrator write them,
-- and `anon` denied on all four operations, which is what keeps send state out of reach of
-- the unauthenticated /vote path. A reader counting policies after this migration should
-- find the same sixteen S-02 created across resolutions and voting_links, and should read
-- that as deliberate rather than as an omission.
--
-- What DOES need saying explicitly is the grant, and missing it would have been a silent
-- bug. 20260802214500 revoked the table-level `select` and re-granted an explicit column
-- list in order to put `token` out of reach; its own header warns that "a column added to
-- this table in a later migration is NOT readable by `authenticated` until it is added to
-- the grant" and that it "will look like an RLS bug to whoever meets it first". These are
-- those columns. Without the grant below the resolution page selects four columns it has
-- no privilege on and gets 42501, with RLS -- which is fine -- as the obvious suspect.
--
-- `authenticated` only, NOT `anon`, which departs from the existing grant's `to
-- authenticated, anon`. Send state is administrator data; the unauthenticated path reads
-- nothing from this table directly, it goes through resolve_voting_link. There is no
-- reason to hand `anon` a column grant it has no policy to use, and one fewer grant is one
-- fewer thing standing between a future policy edit and an exposure.
grant select (sent_at, last_attempt_at, last_error_code, attempt_count)
  on public.voting_links
  to authenticated;

-- `update` is deliberately untouched. 20260802214500 revoked `select` alone, so the
-- default table-level `update` grant still stands behind the RLS policies, and the
-- administrator's per-owner status write needs no new privilege.

-- ---------------------------------------------------------------------------
-- The fanout's only way to read a token
-- ---------------------------------------------------------------------------

-- security definer, and this is the second definer READ in the project after
-- assert_building_registry / building_units_area_total. The argument is the same one
-- 20260802214500 made when it predicted this function would have to exist (:21-24): the
-- fanout must put a token into an e-mail, and `authenticated` has no column grant on
-- `token` -- deliberately, because the administrator's browser must not become a second
-- copy of every voter's identity. An invoker function cannot read a column its caller has
-- no privilege on, so an invoker version of this would return nulls or fail.
--
-- What this narrows the surface TO, stated plainly rather than overclaimed:
--
--   * One named, reviewable function instead of a column on a table that any .select()
--     string could name -- and this version of supabase-js does not type-check projection
--     strings, so "any .select() string" was the real exposure.
--   * One resolution per call. It takes a resolution_id and nothing else, so it cannot
--     enumerate a building, let alone the table.
--   * Unsent links only. A link that has already been mailed is not returned, so the
--     window in which any given token is reachable through this function closes the moment
--     it is used.
--
-- What it does NOT do: it does not make tokens unobtainable by a determined
-- administrator, who can call it through PostgREST directly. That needs the v2 roles model,
-- or a service-role separation this repository deliberately does not have (CLAUDE.md,
-- "Local seeds an admin, production never does"). In PRD v1 every authenticated user IS an
-- administrator and every buildings/owners/units select policy is `using (true)`, so
-- bypassing RLS here costs nothing that is not already given away. The day a roles model
-- lands, THIS FUNCTION IS A HOLE -- it must gain the same building scoping the policies
-- gain, in the same change, or it becomes the way around them.
--
-- The e-mail filter is belt-and-braces: open.ts already mints links only for owners with a
-- non-null address, so this predicate should never exclude a row that exists. It is here so
-- that a future path which mints links more liberally cannot turn "owner without an
-- address" into a send attempt against null.
create function public.unsent_voting_links(p_resolution_id uuid)
returns table (
  link_id uuid,
  token text,
  owner_full_name text,
  owner_email text
)
language sql
stable
security definer
set search_path = ''
as $$
  select vl.id, vl.token, o.full_name, o.email
  from public.voting_links vl
  join public.owners o on o.id = vl.owner_id
  where vl.resolution_id = p_resolution_id
    and vl.sent_at is null
    and o.email is not null;
$$;

comment on function public.unsent_voting_links(uuid) is
  'Returns the not-yet-mailed voting links of ONE resolution, with the token and the
   recipient. The only path by which S-04''s fanout can read a token: 20260802214500 put
   the token column out of `authenticated`''s reach and an invoker function would inherit
   that. security definer, so it bypasses RLS -- harmless while PRD v1 has no roles model
   and every select policy is `using (true)`, and a hole to be closed in the same change
   that introduces one. Never widen the return list: an owner''s share, unit numbers or
   vote have no business on the fanout''s path.';

revoke execute on function public.unsent_voting_links(uuid) from public, anon;
grant execute on function public.unsent_voting_links(uuid) to authenticated;

commit;
