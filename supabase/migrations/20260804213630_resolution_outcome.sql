-- Migration: an uchwala resolves itself the moment one side crosses half the building.
-- Purpose:   Roadmap S-05, PRD FR-007 / FR-008. Until now a vote was recorded and nothing
--            read it back: status knew only 'draft' and 'open', and no code anywhere
--            compared a sum against the threshold. This adds the two terminal states, the
--            moment of decision, the rule that produces them, and the one read the screens
--            render from.
-- Affects:   public.resolutions (status check widened, decided_at added, one new check),
--            public.assert_resolution_frozen (replaced -- EM007 learns two transitions),
--            public.resolution_tally (new), public.apply_resolution_outcome (new),
--            trigger votes_outcome_check on public.votes (new).
--
-- Applies AFTER 20260803090500_create_votes, which created the rows this counts and the
-- `r.status = 'open'` gate in cast_vote that this migration turns into the close of voting.
--
-- Forward-only, one transaction.
--
-- ---------------------------------------------------------------------------
-- THE RULE, AND WHY IT IS EXACT
-- ---------------------------------------------------------------------------
--
-- PRD FR-007: podjeta when 'za' shares exceed 50% of ALL shares in the building; upadla
-- when 'przeciw' shares do. The denominator is every udzial in the property, NOT the
-- udzialy cast -- which is why silence acts as a no, and is the whole reason the product
-- exists (PRD ## Business Logic).
--
-- That denominator is a constant, not a query. Every building's units total exactly 10000
-- bps, asserted by assert_building_registry (EM003) at commit rather than merely intended,
-- so the comparison is `sum * 2 > 10000` in integers -- prescribed verbatim in
-- 20260802072737_create_units_and_owners.sql:71-74. No float appears anywhere in this file.
--
-- The two conditions cannot both hold: each owner votes at most once
-- (votes_resolution_owner_key) at their summed weight, and all owners' weights total 10000,
-- so for + against <= 10000 and both cannot exceed half of it.
--
-- The tally sums votes.share_bps -- the SNAPSHOT taken when the vote was cast, authoritative
-- over any recomputation (comment on table public.votes) -- while the denominator comes from
-- the registry. Two sources, and they agree by construction in v1 because the registry
-- cannot move (EM002 refuses re-import, no screen edits it). A release that lets udzialy
-- move must revisit this pairing before it revisits anything else.
--
-- ---------------------------------------------------------------------------
-- WHY THE OUTCOME IS STORED RATHER THAN COMPUTED WHEN ASKED
-- ---------------------------------------------------------------------------
--
-- Deriving it at read time would be less code here and worse everywhere else:
--
--   1. FR-007 says the resolution "zostaje oznaczona" -- the decision is an event, not a
--      view. S-06 has to show WHEN it happened; a derived outcome has no when.
--   2. cast_vote joins `and r.status = 'open'`. Storing the outcome therefore CLOSES THE
--      VOTE for free: the instant the status leaves 'open', a late vote takes the existing
--      `if not found then return; end if` path and gets the same zero rows an unknown token
--      gets. No new refusal, no new error code, and -- the part that matters -- no new
--      observable branch in the token space. A derived outcome would leave that gate open
--      forever and need a second, hand-written refusal that WOULD be observable.
--
-- ---------------------------------------------------------------------------

begin;

-- ---------------------------------------------------------------------------
-- The two terminal states
-- ---------------------------------------------------------------------------

-- Exactly the widening 20260802181500:43-45 said this migration would perform: "S-05 widens
-- this list with 'passed' and 'rejected', and widening a check constraint is ordinary DDL
-- inside this migration." English values, like every other stored enumeration in this
-- schema; the Polish "Podjeta" / "Upadla" is presentation and lives in src/lib/resolutions.ts.
alter table public.resolutions
  drop constraint resolutions_status_known,
  add constraint resolutions_status_known
    check (status in ('draft', 'open', 'passed', 'rejected'));

-- The DATABASE's clock (now()), unlike opened_at, which carries the WORKER's -- open.ts
-- posts new Date().toISOString(), because supabase-js sends values rather than SQL
-- expressions (S-02 implementation review, finding F5). That difference was flagged as an
-- open question for this slice; it is resolved by not asking it. This column is on the same
-- clock as votes.created_at, which is the value it is ever likely to be compared against.
alter table public.resolutions
  add column decided_at timestamptz;

comment on column public.resolutions.decided_at is
  'When the resolution was decided, from the DATABASE clock -- set by apply_resolution_outcome
   and by nothing else. Null exactly while status is draft or open (see
   resolutions_decided_at_matches_status). NEVER DIFFERENCE THIS AGAINST opened_at: that
   column is written from the Worker''s clock, so the interval between them is the sum of a
   real duration and an unknown clock skew. Comparing it against votes.created_at is safe --
   same clock.';

-- Same shape as resolutions_opened_at_matches_status above it: the timestamp and the status
-- cannot disagree, in either direction, whoever writes them.
alter table public.resolutions
  add constraint resolutions_decided_at_matches_status check (
    (status in ('passed', 'rejected') and decided_at is not null)
    or (status not in ('passed', 'rejected') and decided_at is null)
  );

-- ---------------------------------------------------------------------------
-- EM007 learns the two transitions this slice introduces
-- ---------------------------------------------------------------------------

-- Replaced, not supplemented: this is the function 20260802181500:292-293 predicted would be
-- visited -- "Fires on every update of public.resolutions, so it also guards paths that do
-- not exist yet -- S-05's outcome flip will pass through here." The outcome update below
-- goes through this trigger like any other, which is the point: the flip is not privileged.
--
-- The EM006 content freeze is UNCHANGED and needs no change -- it keys on
-- `old.status <> 'draft'`, so a passed or rejected resolution is frozen by the same clause
-- that froze an open one. The same is true of every other guard in the schema: EM009 (no
-- delete outside draft), EM012 and EM013 (no link issued or deleted outside draft) and
-- resolutions_opened_at_matches_status all key on `<> 'draft'` rather than on `= 'open'`,
-- and so cover the two new states without being touched. That was a choice made in S-02 and
-- it pays here.
--
-- What is permitted after this migration, exhaustively:
--
--   draft -> open              the vote opens          (S-02)
--   open  -> passed            'za' crossed the bar    (this migration)
--   open  -> rejected          'przeciw' crossed it    (this migration)
--
-- Everything else still raises EM007. Note what stays refused and why it matters:
-- passed -> open and rejected -> open would re-open a settled uchwala and let cast_vote
-- write again; passed -> rejected would flip a result with no vote behind it; draft ->
-- passed would decide a resolution nobody could vote on, since links are issued at open.
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

  return new;
end;
$$;

comment on function public.assert_resolution_frozen() is
  'Raises EM006 when a resolution that has left draft has its number, title, body or building
   changed, and EM007 on any status transition other than draft -> open, open -> passed and
   open -> rejected. Widened by S-05; the EM006 clause is untouched because it keys on
   `<> ''draft''` and so already covered the two terminal states. Messages are English on
   purpose: this is not user-facing copy, the API route maps the codes to Polish, the same
   split as EM001-EM013.';

-- ---------------------------------------------------------------------------
-- The one place the threshold is expressed
-- ---------------------------------------------------------------------------

-- Every number the administrator's screen shows comes from here, and so does the decision
-- itself -- apply_resolution_outcome below calls this function rather than repeating the
-- comparison. That is deliberate: the constant 10000 and the `+ 1` that turns "half" into
-- "more than half" appear ONCE in this schema's vote path, so there is no second copy to
-- drift. The application layer renders these figures and computes none of them.
--
-- security INVOKER, and the contrast with assert_building_registry is worth stating because
-- that function was deliberately flipped the other way in 20260802101500. An ASSERTION that
-- aggregates only the caller's visible rows is silently wrong -- it passes by not seeing the
-- problem. A DISPLAY read is the opposite: showing a caller the rows they may see is exactly
-- right, and when the v2 roles model scopes votes_select_authenticated this function should
-- narrow with it. The authoritative decision is not taken here anyway; it is taken by
-- apply_resolution_outcome, which runs inside cast_vote's definer context and sees everything.
--
-- No index needed: votes_resolution_owner_key is unique (resolution_id, owner_id), whose
-- leading column is the one filtered here.
create function public.resolution_tally(p_resolution_id uuid)
returns table (
  total_bps integer,
  for_bps integer,
  against_bps integer,
  not_cast_bps integer,
  for_missing_bps integer,
  against_missing_bps integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  with cast_so_far as (
    select
      coalesce(sum(v.share_bps) filter (where v.choice = 'for'), 0)::integer as for_bps,
      coalesce(sum(v.share_bps) filter (where v.choice = 'against'), 0)::integer as against_bps
    from public.votes v
    where v.resolution_id = p_resolution_id
  )
  select
    10000,
    c.for_bps,
    c.against_bps,
    -- What has not spoken. Counts owners with no e-mail and owners who simply have not
    -- voted alike: the threshold denominator is the whole building, so from the rule's point
    -- of view they are the same thing, and both act as a no.
    10000 - c.for_bps - c.against_bps,
    -- The smallest total that satisfies `sum * 2 > 10000` is 10000 / 2 + 1. Stated as
    -- integer division of the constant rather than as the literal 5001 so that the
    -- relationship to the denominator survives someone changing one of them.
    greatest(0, (10000 / 2 + 1) - c.for_bps),
    greatest(0, (10000 / 2 + 1) - c.against_bps)
  from cast_so_far c;
$$;

comment on function public.resolution_tally(uuid) is
  'The share balance of one resolution, and the only expression of the FR-007 threshold in
   the schema. total_bps is the constant 10000 -- every building''s units total exactly that,
   asserted by EM003 -- not a re-sum of the registry. for_bps / against_bps sum the SNAPSHOT
   weights on the vote rows. not_cast_bps is what has not spoken and counts towards the
   denominator. The two *_missing_bps figures are how many more basis points that side needs
   to cross the bar, floored at zero -- so a side has won exactly when its missing figure
   reaches zero, which is how apply_resolution_outcome decides. Aggregate only: this function
   cannot report how any individual owner voted, which is S-06''s question and not answerable
   here. security INVOKER on purpose -- it is a display read, not an assertion; see the note
   above the function for why that differs from assert_building_registry.';

revoke execute on function public.resolution_tally(uuid) from public, anon;
grant execute on function public.resolution_tally(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The decision, taken by the vote that causes it
-- ---------------------------------------------------------------------------

-- An AFTER INSERT trigger on public.votes rather than a branch inside cast_vote. Both would
-- run in the same transaction as the vote; the trigger binds any FUTURE writer of votes as
-- well, and keeps cast_vote about casting a vote. Today cast_vote is the only writer -- that
-- is what the six `false` policies and EM010 are for -- so this is insurance, not a live
-- second path.
--
-- ---------------------------------------------------------------------------
-- THE ROW LOCK IS LOAD-BEARING, AND IT IS TAKEN BEFORE THE INSERT ON PURPOSE.
-- ---------------------------------------------------------------------------
--
-- Without a lock at all, the outcome is wrong under READ COMMITTED -- Postgres's default,
-- and therefore what runs. Two owners commit at the same instant, each holding 30% of the
-- building, on a resolution at 0%:
--
--   tx A: insert vote (30%)      tx B: insert vote (30%)
--   tx A: sum -> 30%             tx B: sum -> 30%        <- neither sees the other's
--   tx A: no flip                tx B: no flip              uncommitted row
--
-- Committed state is 60% 'za' on a resolution still open, with a majority already cast and
-- nothing left to trigger a re-check -- it would sit there until some later voter happened
-- to push it over again. votes_resolution_owner_key does not help: it serialises one OWNER,
-- not one RESOLUTION.
--
-- So the resolution row is locked. But WHERE that lock is taken decides whether this works,
-- and the first version of this migration got it wrong. Locking inside the AFTER INSERT
-- trigger deadlocks, because public.votes carries a composite foreign key to
-- public.resolutions, and every insert therefore takes FOR KEY SHARE on the parent row on
-- its way in:
--
--   tx A: insert -> FK takes KEY SHARE      tx B: insert -> FK takes KEY SHARE
--                                                  (compatible with A's -- both proceed)
--   tx A: AFTER trigger wants FOR UPDATE    tx B: AFTER trigger wants FOR UPDATE
--         waits for B's KEY SHARE                 waits for A's KEY SHARE
--                          -> deadlock, one voter is killed
--
-- Not theoretical: reproduced on the first attempt with two unstaggered sessions against the
-- local stack (40P01, "deadlock detected"). The loser's vote is not recorded and the endpoint
-- shows them "Nie udalo sie zapisac glosu" -- an owner turned away for having pressed at the
-- same moment as a neighbour.
--
-- The fix is lock ORDER, not lock strength: take FOR UPDATE in a BEFORE INSERT trigger, so
-- every transaction acquires the strongest lock first and the FK's KEY SHARE second. A
-- second voter then simply queues at the before-trigger and proceeds once the first commits,
-- seeing its row. Deleting this trigger and moving the lock back into the after-trigger
-- restores the deadlock; that is the one edit this pair must not receive.
--
-- security invoker: it decides nothing about visibility. Reached only from inside cast_vote,
-- which is SECURITY DEFINER, so it runs as the function owner and sees the whole table
-- regardless of RLS -- required, since the decision must be taken over every vote, not over
-- some caller's visible subset.
create function public.lock_resolution_for_outcome()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform 1
    from public.resolutions r
   where r.id = new.resolution_id
     for update;

  return new;
end;
$$;

comment on function public.lock_resolution_for_outcome() is
  'Takes FOR UPDATE on the resolution a vote is about to join, BEFORE the insert -- so that
   every transaction locks the parent row before the composite foreign key takes its own
   FOR KEY SHARE on it. Exists solely to fix the lock ORDER. Locking in the after-trigger
   instead lets two concurrent inserts both hold KEY SHARE and then wait on each other for
   FOR UPDATE, which deadlocks and turns one voter away; that was reproduced before this
   trigger existed. It also serialises the tally, which is what makes
   apply_resolution_outcome correct under READ COMMITTED.';

create trigger votes_lock_resolution
  before insert on public.votes
  for each row execute function public.lock_resolution_for_outcome();

create function public.apply_resolution_outcome()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_status text;
  v_for_missing integer;
  v_against_missing integer;
begin
  -- No FOR UPDATE here: votes_lock_resolution already took it before this row was inserted,
  -- and re-requesting it in the after-trigger is what caused the deadlock described above.
  select r.status
    into v_status
    from public.resolutions r
   where r.id = new.resolution_id;

  -- Already decided, or not open. cast_vote cannot produce this -- it refuses to resolve a
  -- link whose resolution is not open -- so this is the backstop for a future writer, and
  -- the reason it is a silent return rather than an exception: re-deciding a settled
  -- uchwala is the error, and refusing to is the whole job.
  if v_status is distinct from 'open' then
    return null;
  end if;

  -- One source for the arithmetic, including the just-inserted row: an AFTER ROW trigger
  -- sees the changes its own transaction has made.
  select t.for_missing_bps, t.against_missing_bps
    into v_for_missing, v_against_missing
    from public.resolution_tally(new.resolution_id) t;

  -- A side has crossed exactly when it needs nothing more. Both cannot be zero: the two
  -- sides sum to at most 10000, so at most one of them can exceed half of it.
  if v_for_missing = 0 then
    update public.resolutions
       set status = 'passed',
           decided_at = now()
     where id = new.resolution_id;
  elsif v_against_missing = 0 then
    update public.resolutions
       set status = 'rejected',
           decided_at = now()
     where id = new.resolution_id;
  end if;

  -- AFTER trigger: the return value is discarded.
  return null;
end;
$$;

comment on function public.apply_resolution_outcome() is
  'Decides a resolution at the vote that decides it. Runs AFTER INSERT on public.votes, in
   the same transaction as the vote, and flips status to passed or rejected -- stamping
   decided_at from the database clock -- the moment one side''s share of the WHOLE building
   passes half. Correct under concurrency only because votes_lock_resolution has already
   locked the resolution row FOR UPDATE before the insert -- without that serialisation two
   votes committing at once each read a pre-threshold total and neither flips, leaving a
   majority cast on an open resolution, and taking the lock here instead deadlocks against
   the foreign key''s KEY SHARE. Does nothing when the resolution is not open, so a settled
   uchwala is
   never re-decided. The flip passes through assert_resolution_frozen like any other update,
   which is why EM007 had to learn open -> passed and open -> rejected. Its effect on the
   unauthenticated path is the point of the whole design: cast_vote requires
   status = ''open'', so every later vote falls onto the existing zero-row neutral answer
   with no new branch anyone can observe.';

create trigger votes_outcome_check
  after insert on public.votes
  for each row execute function public.apply_resolution_outcome();

commit;
