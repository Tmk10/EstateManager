-- Migration: an outcome may only be recorded when the votes behind it exist.
-- Purpose:   Closes the hole opened by 20260804213630. That migration widened EM007 so a
--            resolution could move open -> passed and open -> rejected, because
--            apply_resolution_outcome has to make exactly those two moves. But EM007 is a
--            trigger on the TABLE, not a permission on one function: widening it opened both
--            transitions to EVERY writer of public.resolutions, and
--            resolutions_update_authenticated is `using (true) with check (true)`
--            (20260802181500:190-195) with no `force row level security` anywhere in this
--            schema. A signed-in administrator could therefore PATCH a resolution to 'passed'
--            through PostgREST with no vote behind it, supplying decided_at in the same
--            payload to satisfy resolutions_decided_at_matches_status, and nothing compared
--            the stored outcome against the tally.
-- Affects:   public.resolution_outcome_supported (new),
--            public.assert_resolution_frozen (replaced -- gains EM014).
--
-- Forward-only, one transaction. No schema change: this adds an assertion, not a column.
--
-- ---------------------------------------------------------------------------
-- WHY THIS IS A DEFECT AND NOT A V1 RESIDUAL
-- ---------------------------------------------------------------------------
--
-- Reproduced before the fix, against the local stack inside a rolled-back transaction, as
-- role `authenticated`: a resolution with for_bps = 0 and for_missing_bps = 5001 accepted
-- `update public.resolutions set status = 'passed', decided_at = now()` -- UPDATE 1, no
-- error, and resolution_tally went on reporting that 5001 bps were still needed beside a
-- resolution now claiming it passed.
--
-- Two things put this outside the project's ordinary "PRD v1 has no roles model, so every
-- authenticated caller is an administrator" posture:
--
--   1. IT WAS IMPOSSIBLE THE DAY BEFORE. Until 20260804213630, EM007 refused every status
--      change except draft -> open. This is not an old gap that the roles model will get to;
--      it is one that S-05 introduced.
--   2. IT ALSO CLOSES THE VOTE. cast_vote joins `and r.status = 'open'`, so a forged flip
--      does not merely lie about the result -- it silently stops every owner who has not yet
--      voted, on the neutral zero-row path, with nothing said to any of them. A forged
--      outcome and a disenfranchised electorate are the same keystroke.
--
-- It is also out of step with the rest of this schema, which fences the administrator out of
-- a live vote at every other operation: EM006 (no content edit after open), EM009 (no delete
-- outside draft), EM010 (no vote updated or deleted), EM012 and EM013 (no link issued or
-- deleted outside draft). EM012/EM013 came out of S-03's implementation review for exactly
-- this class of hole -- an administrator reaching past the application to write a vote's
-- premises by hand -- and were fixed then rather than deferred to v2. This is the same class.
--
-- ---------------------------------------------------------------------------
-- WHY THE READ IS SECURITY DEFINER, WHEN resolution_tally IS NOT
-- ---------------------------------------------------------------------------
--
-- 20260804213630 argues at length that resolution_tally is INVOKER because it is a DISPLAY
-- read: showing a caller the rows they may see is right, and it should narrow when the v2
-- roles model scopes votes_select_authenticated. That argument does not survive being reused
-- here, and the reason is the one already recorded for assert_building_registry in
-- 20260802101500: AN ASSERTION THAT AGGREGATES ONLY THE CALLER'S VISIBLE ROWS PASSES BY NOT
-- SEEING THE PROBLEM.
--
-- Today votes_select_authenticated is `using (true)`, so an invoker read here would give the
-- same answer and this distinction would cost nothing. The moment that policy is scoped, an
-- invoker assertion would start reading a SUBSET of the votes and would approve a 'passed'
-- that the whole electorate does not support -- silently, and in the direction that lets a
-- forgery through rather than the direction that raises. So the assertion gets its own
-- definer wrapper and keeps calling resolution_tally for the arithmetic, which means the
-- threshold constant still appears exactly once in this schema.
--
-- Inside this definer wrapper current_user is the function owner, so the invoker
-- resolution_tally it calls sees every vote row regardless of RLS. That is the whole point,
-- and it is why the wrapper exists rather than a `set row_security = off` or a second copy of
-- the sum.
--
-- ---------------------------------------------------------------------------

begin;

create function public.resolution_outcome_supported(p_resolution_id uuid, p_status text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_status
           when 'passed' then t.for_missing_bps = 0
           when 'rejected' then t.against_missing_bps = 0
           -- Any other status is not an outcome, so there is nothing for the votes to
           -- support. Returning false rather than true is deliberate: the caller below only
           -- asks about the two terminal states, and a default of true would make a future
           -- third terminal state unguarded by omission.
           else false
         end
    from public.resolution_tally(p_resolution_id) t;
$$;

comment on function public.resolution_outcome_supported(uuid, text) is
  'Whether the votes actually cast support recording p_status as the outcome of this
   resolution -- true exactly when that side''s *_missing_bps has reached zero, which is the
   same FR-007 threshold apply_resolution_outcome decides on, read from the same function so
   there is no second copy to drift. SECURITY DEFINER, unlike resolution_tally which it calls:
   this is an ASSERTION, and an assertion that aggregates only the caller''s visible rows
   passes by not seeing the problem -- the reasoning recorded for assert_building_registry in
   20260802101500. Granted to authenticated because assert_resolution_frozen is an INVOKER
   trigger and must be able to call this when the caller is an administrator; it discloses
   nothing that resolution_tally does not already give the same role in full detail.';

revoke execute on function public.resolution_outcome_supported(uuid, text) from public, anon;
grant execute on function public.resolution_outcome_supported(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- EM014: the outcome must be one the votes produce
-- ---------------------------------------------------------------------------
--
-- Replaced whole rather than supplemented with a second trigger, so that the transition rules
-- for public.resolutions stay readable in one function. EM006 and EM007 are carried over
-- verbatim from 20260804213630; the only new text is the EM014 clause and this comment.
--
-- The new clause sits AFTER the EM007 test on purpose. EM007 answers "is this transition
-- permitted at all"; EM014 answers "is this permitted transition earned". A draft -> passed
-- attempt must be refused as EM007 (a resolution nobody could vote on), not as EM014, which
-- would describe it as merely lacking votes.
--
-- What this does NOT do, and should not be mistaken for: it does not stop an administrator
-- deciding WHEN a vote is closed, because there is no way to close a vote early in v1 at all.
-- It does not stop them setting decided_at to a time of their choosing on a legitimate flip
-- -- a lesser problem, and one S-06's audit trail is the right place to answer. And it does
-- not stop them from never opening a vote in the first place. It stops precisely one thing:
-- recording an outcome the electorate did not produce.
--
-- The honest path satisfies it by construction. apply_resolution_outcome only issues its
-- update after reading for_missing_bps = 0 (or against_missing_bps = 0) from the same
-- function this assertion calls, in the same transaction, so the assertion re-reads a tally
-- that already includes the deciding vote. If this ever raises EM014 from inside cast_vote,
-- the bug is in the snapshot assumption and not in the voter.
create or replace function public.assert_resolution_frozen()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.status <> 'draft'
     and (new.number is distinct from old.number
          or new.title is distinct from old.title
          or new.body is distinct from old.body
          or new.building_id is distinct from old.building_id) then
    raise exception
      'Resolution % is % and its content can no longer be changed', old.id, old.status
      using errcode = 'EM006';
  end if;

  -- A no-op update (status unchanged) is allowed, which is what lets the freeze check above
  -- be the one that speaks for content edits.
  if new.status is distinct from old.status
     and not (old.status = 'draft' and new.status = 'open')
     and not (old.status = 'open' and new.status in ('passed', 'rejected')) then
    raise exception
      'Resolution % cannot move from % to %', old.id, old.status, new.status
      using errcode = 'EM007';
  end if;

  -- The transition is permitted. Is it earned?
  if new.status is distinct from old.status
     and old.status = 'open'
     and new.status in ('passed', 'rejected')
     and not public.resolution_outcome_supported(new.id, new.status) then
    raise exception
      'Resolution % cannot be recorded as % -- the votes cast do not reach the threshold',
      old.id, new.status
      using errcode = 'EM014';
  end if;

  return new;
end;
$$;

comment on function public.assert_resolution_frozen() is
  'Raises EM006 when a resolution that has left draft has its number, title, body or building
   changed; EM007 on any status transition other than draft -> open, open -> passed and
   open -> rejected; and EM014 when one of those two outcome transitions is attempted without
   the votes to support it. EM014 exists because EM007 guards the TABLE, not one function: the
   S-05 widening that let apply_resolution_outcome record an outcome let every other writer do
   it too, and resolutions_update_authenticated is `using (true)` with no force row level
   security anywhere in this schema. Messages are English on purpose: this is not user-facing
   copy, the API route maps the codes to Polish, the same split as EM001-EM014.';

commit;
