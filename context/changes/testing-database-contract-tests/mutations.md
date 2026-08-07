# Mutation log — Phase 2 database contract tests

Run after all five suites were green, per the bar `tests-phase1-shares-and-registry/mutations.md`
set for Phase 1: break the migration under a key assertion by hand on the local stack, confirm
the specific test goes red, revert, confirm green again. All four mutations below were applied
directly against the running local Postgres container (`docker exec ... psql`), never against a
migration file — nothing here touched `supabase/migrations/`.

## 1. Lock-ordering: `votes_lock_resolution` moved from `BEFORE INSERT` to `AFTER INSERT`

The exact edit `20260804213630_resolution_outcome.sql:1205-1226` documents as the one that
deadlocks two concurrent voters.

- **Mutated**: dropped and recreated the trigger as `after insert`.
- **Result**: `outcome_threshold.test.sql` test 2 (the structural timing assertion) went red —
  `have: AFTER / want: BEFORE`. All other tests in that file stayed green, as expected: nothing
  else in a single-session pgTAP run can observe the deadlock itself.
- **Reverted**: recreated as `before insert`. Suite green again (8/8, later 9/9 after the EM014
  addition below).
- **What this confirms**: the structural pin is not decorative — it is the only layer in this
  suite that would catch this specific regression, since the real deadlock needs two concurrent
  transactions, which this project's pgTAP convention (self-contained, rollback-only files)
  cannot reproduce. See `plan.md`, "What We're NOT Doing".

## 2. `assert_vote_immutable` (EM010) dropped

- **Mutated**: `drop trigger votes_immutable_check on public.votes;`
- **Result**: `vote_finality.test.sql` tests 6 and 7 (the direct UPDATE/DELETE EM010 assertions)
  went red — both "caught: no exception". Test 8 (the unique-constraint assertion) *also* went
  red, but not because the unique constraint itself weakened: test 6's UPDATE, no longer
  refused, silently changed the fixture row's choice; test 7's DELETE, also no longer refused,
  then removed that row entirely — so test 8's later INSERT for the same `(resolution, owner)`
  had nothing left to conflict with. **This is a real finding, not a bug in the test file**: it
  shows that losing EM010 does not fail quietly in isolation — it corrupts the state later
  assertions in the same file depend on, which is a stronger argument for EM010's necessity
  than a clean single-assertion failure would have been.
- **Reverted**: recreated `votes_immutable_check before update or delete on public.votes for
  each row execute function public.assert_vote_immutable();`. Suite green again (8/8).

## 3. `import_building_units` rewritten to swallow a mid-import unique violation

The plan's original hypothesis — splitting the owners/units CTE into two sequential top-level
`insert` statements — turned out to be a **null mutation**: a plpgsql function with no internal
`exception` block gets no free savepoint between its statements, so an unhandled error on the
second `insert` still rolls back everything back to whatever savepoint enclosed the whole call
(here, pgTAP's own `throws_ok` wrapper). Atomicity in this specific case comes from "nothing
caught the exception," not specifically from using one `WITH` statement. That version was not
applied as a mutation for this reason — recorded here so the next reader does not re-attempt it
expecting a different result.

A mutation that *does* break atomicity, and a materially more realistic one — a well-intentioned
"skip the conflicting row instead of failing the whole import" instinct — was applied instead:

- **Mutated**: rewrote `import_building_units` so the owners insert is its own statement (no
  longer sharing a CTE with the units insert), and wrapped the units insert in its own
  `begin ... exception when unique_violation then null; end;` block.
- **Result**: `import_atomicity.test.sql` test 1 went red (`caught: no exception / wanted:
  23505` — the whole call now succeeds instead of raising), and test 3 went red (`have: 2 / want:
  0` — both owner rows survived the swallowed units failure, exactly the "budynek permanently
  half-populated" failure mode Risk #8 names). Test 6 (the unrelated deferred-EM003 case in a
  different building) also failed, for a cascading reason specific to this hand-written mutation
  (an owner from a different insert path ended up holding no units, tripping EM015) — not a
  defect in the real suite, a side effect of the quick mutated rewrite.
- **Reverted**: restored the original function body from
  `20260802101500_registry_assertion_security_definer.sql` verbatim. Suite green again (9/9).

## 4. `resolution_outcome_supported`'s `'passed'` branch re-derived with an off-by-one

Two variants tried, because the first was itself a null mutation:

- **First attempt** (`for_missing_bps = 0` → `for_missing_bps <= 0`): killed nothing, against
  either EM014 fixture (the zero-vote case at 5001 missing, and a new near-boundary case at 1
  missing added specifically to probe this). `resolution_tally`'s `for_missing_bps` is computed
  as `greatest(0, ...)` and can never go negative, so `<= 0` and `= 0` are exactly equivalent
  over its whole range — this mutation could never have been caught by anything, and is recorded
  here rather than silently dropped, matching Phase 1's precedent for mutations that kill
  nothing.
- **Second attempt** (re-derive the condition independently instead of reusing
  `resolution_tally`'s figure: `t.for_bps >= 5000` instead of `t.for_missing_bps = 0`): this is
  the off-by-one a re-derivation would plausibly introduce — `>=` instead of the strict `>` the
  threshold rule requires. **Killed by the near-boundary EM014 case added to
  `outcome_threshold.test.sql` during this pass** (test 5: "one basis point short of the
  threshold is still refused") — `5000 >= 5000` let the forged `passed` update through. The
  file's other, zero-vote EM014 case stayed green throughout, confirming it alone would have
  missed this regression — which is why the near-boundary case was added rather than treated as
  redundant.
- **Reverted**: restored `t.for_missing_bps = 0`. Suite green again (9/9).

## Net effect on the suite

One test added during this pass as a direct result of mutation 4 (`outcome_threshold.test.sql`
went from 8 to 9 assertions). No other file changed. Full suite after all reverts: `npm run
test:db` — 7 files, 53 assertions, all green; `npm run lint && npm test && npm run build` — all
green.
