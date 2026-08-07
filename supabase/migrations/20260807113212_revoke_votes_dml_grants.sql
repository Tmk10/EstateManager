-- Migration: revoke the table-level DML grants on public.votes that Supabase's defaults
--            leave standing behind the deny-all policies.
-- Purpose:   Closes review finding F2 from S-03 (context/changes/share-weighted-vote/
--            change.md), left open deliberately at the time. public.votes denies insert,
--            update and delete to both anon and authenticated by RLS policy alone -- no
--            revoke was written, so the default table-level grants still stand behind those
--            policies. Verified denied for both roles through PostgREST already; the
--            exposure was to a future edit flipping votes_insert_authenticated (or the
--            update/delete equivalents) to true, which would read like restoring
--            consistency with the other seven tables in this schema and would then be
--            caught by nothing but review.
-- Affects:   Grants only. No table, column, policy or function changes -- database.types.ts
--            is unaffected.
--
-- Does not touch public.cast_vote's ability to write: it is SECURITY DEFINER
-- (20260803090500_create_votes.sql), so it runs as the function owner and was never subject
-- to anon/authenticated's table grants in the first place. Revoking those grants narrows
-- only the two PostgREST-facing roles, which is exactly and only what glos jest ostateczny
-- requires.
--
-- Forward-only, one transaction.

begin;

revoke insert, update, delete on public.votes from anon, authenticated;

commit;
