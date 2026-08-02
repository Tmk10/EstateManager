-- Takes the voting token out of reach of the administrator's own API session.
--
-- Until now `voting_links` was readable column-for-column by `authenticated`, and the
-- resolution page printed every token in the building as plain text. That made the
-- administrator's browser -- and its history, its cache, anything on screen behind them --
-- a second copy of a credential that IS the voter's identity (PRD, open question no. 1).
-- The page has been rewritten to report only WHETHER a link exists; this migration makes
-- that a property of the database rather than a property of one `.select()` string, since
-- this version of supabase-js does not type-check projection strings and a token added back
-- to one would not fail any build.
--
-- Why a table-level revoke followed by a column list, rather than `revoke select (token)`:
-- Postgres treats table-level and column-level privileges as separate grants, and a
-- column-level revoke does NOTHING while a table-level `select` is still held. Revoking the
-- table grant first is what makes the per-column grant the operative one. The consequence
-- to remember: a column added to this table in a later migration is NOT readable by
-- `authenticated` until it is added to the grant below. That is the intended direction of
-- failure -- a new column is invisible until someone says it should be visible -- but it
-- will look like an RLS bug to whoever meets it first.
--
-- What is deliberately NOT solved here: an administrator can still reach tokens through any
-- `security definer` function granted to `authenticated`, which is how S-04's fanout will
-- have to read them. This narrows the surface to a named, reviewable function instead of
-- every row of a table; it does not make tokens unobtainable by a determined administrator.
-- That needs the v2 roles model, or a service-role separation this repository deliberately
-- does not have (CLAUDE.md, "Local seeds an admin, production never does").
--
-- `anon` gets the same treatment, and it is not redundant. Checked rather than assumed:
-- before this migration `has_column_privilege('anon', 'public.voting_links', 'token',
-- 'select')` returned TRUE -- Supabase grants `anon` a table-level select on every table in
-- `public`, and the only thing standing between an anonymous caller and the token column was
-- the `using (false)` RLS policy. One policy edit was all that separated the internet from a
-- table of bearer credentials. After this migration the grant is gone too, so that edit
-- would no longer be sufficient to expose them.
--
-- The unauthenticated voting path does not read this table directly -- it goes through
-- `public.resolve_voting_link(text)`, which is `security definer` and therefore unaffected
-- by everything below.

begin;

revoke select on public.voting_links from authenticated, anon;

-- Every column except `token`.
grant select (id, resolution_id, owner_id, building_id, created_at)
  on public.voting_links
  to authenticated, anon;

commit;
