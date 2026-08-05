-- Purpose: an owner must hold at least one lokal. Raises EM015 otherwise.
--
-- Why now: S-06 put the electorate of a settled uchwała on screen, one row per
-- owner, and an owner holding no lokale rendered as "— (0,00%)" among those whose
-- silence counted as a no. Nothing was wrong with the rendering; the row should
-- not have existed. `import_building_units` cannot produce one -- it derives
-- owners from the CSV's unit rows, so every owner it writes gets a lokal in the
-- same statement -- but that was a property of the one write path, not of the
-- schema, and `owners_insert_authenticated` is `with check (true)`. A row inserted
-- through PostgREST, psql, or the dashboard was accepted. One reached the local
-- database exactly that way.
--
-- What it costs: co-ownership and transfers, when they arrive, must write the
-- owner and their lokal in one transaction. That is already how the import works,
-- and the deferral below is what keeps it possible.
--
-- What it does NOT do: it does not validate rows that already exist. `create
-- constraint trigger` never does. A database predating this migration keeps any
-- unit-less owner it has until something updates that row -- which is why
-- src/lib/resolution-trail.ts also refuses to seat a zero-udział owner in the
-- electorate. Belt and braces, deliberately: the constraint stops new ones, the
-- assembler survives the old ones.

-- ---------------------------------------------------------------------------
-- The assertion
-- ---------------------------------------------------------------------------

-- `security definer`, on the argument 20260802101500 settled for
-- assert_building_registry: an *assertion* that aggregates only the rows the
-- caller can see passes by not seeing the problem. Today owners_select_authenticated
-- is `using (true)` so it makes no difference; the moment a roles model scopes that
-- policy, an invoker check would start approving registries whose gaps it simply
-- could not read. A *write* path stays invoker for the opposite reason, which is
-- why import_building_units still is one.
create function public.assert_owner_holds_units(p_owner_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_exists boolean;
  v_unit_count integer;
  v_full_name text;
begin
  -- Leaves v_owner_exists false when the owner is gone, which is what a cascade
  -- delete looks like from in here: no owner, nothing to assert. Deleting an owner
  -- is not what this constraint is about.
  select true, o.full_name
    into v_owner_exists, v_full_name
    from public.owners o
   where o.id = p_owner_id;

  if not coalesce(v_owner_exists, false) then
    return;
  end if;

  select count(*)
    into v_unit_count
    from public.units u
   where u.owner_id = p_owner_id;

  if v_unit_count = 0 then
    raise exception
      'Owner % (%) holds no units', p_owner_id, v_full_name
      using errcode = 'EM015';
  end if;
end;
$$;

comment on function public.assert_owner_holds_units(uuid) is
  'Raises EM015 when an owner holds no rows in public.units. An owner is someone who
   owns something: a row with no lokal carries no udziały, cannot vote to any weight,
   and yet joins the electorate S-06 reports on. Returns silently when the owner does
   not exist, so a cascade delete is not an error. Message is English on purpose --
   this is not user-facing copy, the API route maps the code to Polish.';

revoke execute on function public.assert_owner_holds_units(uuid) from public;
revoke execute on function public.assert_owner_holds_units(uuid) from anon;
grant execute on function public.assert_owner_holds_units(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The two sides of the relationship
-- ---------------------------------------------------------------------------

-- Two thin wrappers, because the owner id lives under a different column name on
-- each side -- new.id on owners, owner_id on units -- exactly as the registry
-- checks are split. Both resolve it and delegate, and both stay `invoker`: the
-- definer boundary belongs at the assertion, not at the trigger.

create function public.assert_owners_hold_units()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform public.assert_owner_holds_units(new.id);
  return null;
end;
$$;

create function public.assert_unit_owners_hold_units()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Only update and delete can strip an owner of their last lokal; an insert can
  -- only ever add one. On an update that moves a lokal between owners it is the
  -- owner it *left* who may now hold nothing, which is the case a check on
  -- new.owner_id alone would miss entirely.
  perform public.assert_owner_holds_units(old.owner_id);
  return null;
end;
$$;

-- `deferrable initially deferred` is load-bearing for the same reason it is on
-- units_registry_check, and more sharply here: import_building_units inserts the
-- owner and the lokal as two data-modifying CTEs, and an immediate check would
-- refuse every import at the owner that does not hold a lokal *yet*. Deferred, the
-- state is judged once, at commit, when both have landed.
create constraint trigger owners_hold_units_check
  after insert or update on public.owners
  deferrable initially deferred
  for each row execute function public.assert_owners_hold_units();

create constraint trigger units_owner_holds_units_check
  after update or delete on public.units
  deferrable initially deferred
  for each row execute function public.assert_unit_owners_hold_units();

-- ---------------------------------------------------------------------------
-- Two comments S-06 made false
-- ---------------------------------------------------------------------------

-- These ride along here rather than in a migration of their own. A migration whose
-- entire content is a comment must not be created -- migrations reach production by
-- hand and are forward-only, so it would buy a second manual production step and no
-- behaviour. This file is being hand-applied anyway, which is exactly the condition
-- the S-06 plan set for correcting them.
--
-- Neither function changes. `comment on function` replaces the whole text, so both
-- are restated in full with only the S-06 sentence rewritten.

-- Was: "cannot report how any individual owner voted, which is S-06's question and
-- not answerable here". The first half is still true of this function and always will
-- be; the second half implied the question was open. It is closed.
comment on function public.resolution_tally(uuid) is
  'The share balance of one resolution, and the only expression of the FR-007 threshold in
   the schema. total_bps is the constant 10000 -- every building''s units total exactly that,
   asserted by EM003 -- not a re-sum of the registry. for_bps / against_bps sum the SNAPSHOT
   weights on the vote rows. not_cast_bps is what has not spoken and counts towards the
   denominator. The two *_missing_bps figures are how many more basis points that side needs
   to cross the bar, floored at zero -- so a side has won exactly when its missing figure
   reaches zero, which is how apply_resolution_outcome decides. Aggregate only: this function
   cannot report how any individual owner voted. That is a permanent property, not a gap
   waiting on S-06 -- S-06 shipped on 2026-08-05 and answered the question somewhere else,
   by reading public.votes directly for a settled uchwala. Keeping this one sums-only is what
   lets the audit trail beside it be assembled independently, so that the two can visibly
   disagree instead of agreeing by construction. security INVOKER on purpose -- it is a
   display read, not an assertion; see the note above the function for why that differs from
   assert_building_registry.';

-- Was: "how someone else voted is the question S-06 is scoped to answer, and until it
-- does the answer is no". S-06 has answered it, and the answer did NOT widen this
-- function -- but a reader who knew only that S-06 landed could have read the old
-- sentence as an expiry date on the guardrail. There is none.
comment on function public.resolve_voting_link(text) is
  'Turns one voting token into the reader''s own view of a resolution. THIS RETURN LIST IS
   THE ENTIRE VISIBILITY CONTRACT FOR A CALLER WITH NO SESSION: no e-mail address, no other
   owner, no per-unit area, no other owner''s vote, no building address. Adding a column
   here widens what the internet can read, so it is a security change, not a convenience.
   owner_share_bps is the SUM of that owner''s units (per-owner voting, 2026-08-02) and
   owner_unit_numbers names them, so the reader can tell which units the weight covers.
   own_vote_choice and own_voted_at were added by S-03 and meet the same standard the rest
   of the list does -- they are the reader''s OWN vote, the confirmation PRD FR-005
   promises, and what a second visit to the link renders. They are null until that reader
   votes. NO OTHER OWNER''S VOTE MAY EVER JOIN THIS LIST. S-06 settled who may see how an
   owner voted and did not widen this list by one column: an administrator may, on a settled
   uchwala, through the audit trail on the resolution page; an owner never, on any uchwala,
   through any surface. That is a PRD guardrail -- wlasciciel nie poznaje glosow innych
   wlascicieli -- and not a provisional state awaiting a decision, so there is no later slice
   that reopens it. Returns zero rows for an unknown token and for a token whose resolution
   is still a draft, indistinguishably, which is the whole error model.';
