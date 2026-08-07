# Phase 2 — Database contract tests

## Overview

Five pgTAP suites in `supabase/tests/database/`, pinning the five properties
`context/foundation/test-plan.md` §3 Phase 2 exists to buy: the electorate guards (#3), vote
finality (#4), own-data-only on the unauthenticated surface (#6), the outcome threshold
measured against the whole building rather than udziały cast (#2, threshold half), and
registry-import atomicity (#8, atomicity half).

Research was skipped by user direction. This plan's grounding is a direct read of every
migration in `supabase/migrations/` (2026-08-07) rather than a separate `research.md` — the
file:line anchors below stand in for what `/10x-research` would normally supply.

## Current State Analysis

**The harness works and nothing built on it yet.** `supabase/tests/database/smoke.test.sql`
proves pgTAP evaluates, distinguishes pass from fail, runs against a migrated schema, and can
assert as a named role (`set local role anon`). `owner_holds_units.test.sql` is the one real
precedent — deferred-constraint testing via `set constraints all immediate`, a fresh building
per file so nothing here depends on the demo building's state, and manual cleanup of any row
inserted outside the property under test.

**Nine error codes already exist and are the oracle.** EM001–EM014 (skipping none currently
unused) are raised across five migrations with a comment at each site stating exactly what it
protects. The tests below assert against those codes and the FR lines the migrations
themselves cite — not against current behaviour with no named rule behind it.

**One structural fact shapes the concurrency test.** `20260804213630_resolution_outcome.sql`
lines 1189–1259 document, at length, a deadlock that was reproduced and fixed by moving
`votes_lock_resolution` from an `AFTER INSERT` trigger to `BEFORE INSERT` — lock order, not
lock strength. `dblink` is available on the local stack (checked 2026-08-07:
`pg_available_extensions` lists it), which would let a pgTAP file open a second real
connection — but every pgTAP file in this project runs inside `begin; ... rollback;`
(`supabase/tests/database/smoke.test.sql`, `owner_holds_units.test.sql`, and the mechanics
`test-plan.md` §6.2 fixes), and a second `dblink` session cannot see the first session's
**uncommitted** fixture rows under READ COMMITTED — the two sessions would need real commits
and real cleanup to interleave at all, which breaks the "every file is self-contained and
rolls back" guarantee the project has held since the harness landed. See "What We're NOT
Doing".

## Desired End State

`npm run test:db` runs five new suites, green, against the local stack. Each suite asserts a
named error code or a named property, cites the migration line that raises it, and — for the
guards with an independent-mechanism risk (#3, #4) — exercises more than one of the mechanisms
that are supposed to bind independently, per the risk guidance's own anti-pattern warning.

Verified by: `npm run test:db` (needs Docker + local stack, already up), plus for the highest-
risk assertions, breaking the migration under it by hand on the local stack, confirming the
test goes red, and reverting — the same bar `tests-phase1-shares-and-registry/mutations.md`
set for Phase 1.

### Key Discoveries

- `supabase/migrations/20260803090000_harden_voting_links_and_resolutions.sql:98-298` — EM008
  (link repoint refused), EM009 (delete on non-draft resolution refused), EM012 (new link
  issued on non-draft resolution refused unless the owner already holds one), EM013 (link
  delete on non-draft resolution refused). Lines 181–206 narrate the exact bypass this phase
  must reproduce and confirm closed: PATCH → EM008, DELETE → 201/204, POST for a different
  owner → vote cast at the wrong person's weight.
- `supabase/migrations/20260803090500_create_votes.sql:416-503` — eight policies on
  `public.votes`; insert/update/delete are `false` for **both** `anon` and `authenticated`,
  the one deliberate deviation from every other table's `authenticated`-unconditional shape.
  Lines 518-540 — `assert_vote_immutable` (EM010), a trigger rather than a policy, because
  `cast_vote` is `security definer` and bypasses RLS entirely; this is the only thing that
  binds that path.
- `supabase/migrations/20260803090500_create_votes.sql:581-668` — `cast_vote`, `on conflict do
  nothing` at line 635, `found` at 642 distinguishing "this call recorded it" from "already
  there" without ever changing what is stored.
- `supabase/migrations/20260802214500_restrict_voting_link_token_select.sql:41-50` — table-
  level `select` on `voting_links` revoked from `authenticated, anon`, re-granted column-by-
  column excluding `token`. `select *` must fail `42501` for both roles.
- `supabase/migrations/20260803090500_create_votes.sql:681-748` — `resolve_voting_link`, the
  entire unauthenticated visibility contract in one return list; comment states "NO OTHER
  OWNER'S VOTE MAY EVER JOIN THIS LIST".
- `supabase/migrations/20260804213630_resolution_outcome.sql:1126-1176` —
  `resolution_tally`, the one place `10000` and `10000/2+1` appear; `1261-1330` —
  `apply_resolution_outcome`, decides `passed`/`rejected` from `for_missing_bps = 0` /
  `against_missing_bps = 0`.
- `supabase/migrations/20260804213630_resolution_outcome.sql:1232-1259` —
  `lock_resolution_for_outcome` / `votes_lock_resolution`, `before insert`, and the comment
  block above it is the load-bearing fact this phase's concurrency test protects structurally
  (see Current State Analysis).
- `supabase/migrations/20260805084000_assert_outcome_matches_tally.sql:1408-1519` — EM014,
  `resolution_outcome_supported`, folded into `assert_resolution_frozen`; closes the direct-
  PATCH forgery reproduced in that migration's own header comment.
- `supabase/migrations/20260802072737_create_units_and_owners.sql:592-679` (superseded body at
  `20260802101500...`:956-1076) — `import_building_units`, one `WITH` statement combining the
  owners insert and the units insert, so a mid-statement failure on either aborts both. EM001
  (building not visible), EM002 (already imported), EM005 (one e-mail, two names).
  `units_building_id_unit_number_key` (`20260802072737...`:266) is the unique constraint this
  phase uses to force a mid-statement failure without tripping an early-return guard.
- `context/changes/tests-phase1-shares-and-registry/mutations.md` — the mutation-testing
  convention this phase's manual verification follows.

## What We're NOT Doing

- **A literal two-transaction concurrency reproduction.** See Current State Analysis. The
  property is pinned structurally instead: `votes_lock_resolution` is asserted to be a
  `BEFORE INSERT` trigger (not `AFTER`) invoking `lock_resolution_for_outcome`, which is
  exactly the fact whose violation the migration's own comment shows causes the deadlock. A
  future contributor with a safe way to interleave two committed sessions against ephemeral,
  fully-cleaned-up fixture rows may replace this with the real thing; until then this is
  recorded as a known limit, not a silent gap.
- **Re-testing the allocation, the parse, or `EM003`/`EM004`/`EM015`.** Phase 1's suite and
  `owner_holds_units.test.sql` already pin those. This phase covers only what §3 assigns it:
  the threshold half of #2, and the atomicity half of #8.
- **Risk #1 (fanout), #5 and #7 (vote round-trip, hit/miss indistinguishability), #9 (token
  emission).** Phases 3 and 4's, per §3.
- **The v1 non-restriction on `authenticated` reading across buildings.** §2's "Not modelled
  as a risk, deliberately" note — `using (true)` there is a decision, not a gap, until the v2
  roles model.
- **New CI wiring.** `db-contract` already runs `npm run test:db`; these files are collected
  by the existing `supabase/tests/database/*.test.sql` glob with no config change.

## Implementation Approach

Independent files, ordered by how directly each protects the property named highest in §2's
risk order: electorate (#3, the second hot-spot directory's central guard) first, then
finality (#4), own-data-only (#6), the threshold (#2), atomicity (#8) last because it is the
one requiring the most fixture setup (a full registry summing to 10000 bps). Each file is
self-contained per `test-plan.md` §6.2 mechanics: its own `begin` / `create extension if not
exists pgtap` / `rollback`, its own building, so no file's fixtures depend on another's or on
the demo building.

## Critical Implementation Details

**Every fixture building is its own, named after the file.** Following
`owner_holds_units.test.sql`'s precedent (`'Testowa 1'`), so two suites run back-to-back never
collide on `buildings_name_city_street_lower_key`.

**Casting a role requires `set local role <role>; ... reset role;`**, verified working for
`anon` by the smoke test. `authenticated` is exercised the same way — every table's grants
already apply to the role, not to a Supabase JWT claim, so no auth token is needed to test
policy shape.

**The deferred-constraint pattern from `owner_holds_units.test.sql` is reused for EM003 during
the atomicity test**: `set constraints all immediate` inside `throws_ok`, then `set
constraints all deferred` before the next assertion, with any leftover rows from that specific
sub-test left for the file's closing `rollback` rather than manually deleted, since no later
assertion in that file depends on their absence.

**`cast_vote` and `resolve_voting_link` are called as `anon`** (`set local role anon`), never
as `authenticated` — that is the caller PRD FR-005/US-03 describes, and it is also what
exercises the `security definer` boundary the own-data-only guarantee depends on.

---

## Phase 1: Electorate guards (Risk #3)

### Overview

Every route to changing who may vote on an open resolution fails, including the
delete-then-recreate shape review already found live once.

### Changes Required

#### 1. Electorate guard suite

**File**: `supabase/tests/database/electorate_guards.test.sql`

**Intent**: Prove EM008, EM009, EM012 and EM013 hold independently and together, as
`authenticated` — the role every one of them binds, since `anon` has no write policy on
either table to begin with.

**Contract**: One building, one resolution moved to `open`, two owners each with a link.

- EM008 — `update voting_links set owner_id = <other owner>` on a live link, as
  `authenticated`, throws EM008.
- EM009 — `delete from resolutions` on the open resolution, as `authenticated`, throws EM009.
  Positive control: the same delete on a **draft** resolution (a second resolution in the same
  building) succeeds.
- EM012 — `insert into voting_links` for a **third** owner (no existing link) on the open
  resolution, as `authenticated`, throws EM012. Positive control: re-inserting for an owner who
  already holds a link is refused by the unique constraint (`23505`), not EM012 — proving the
  idempotent-second-press path (`on conflict do nothing` in application code) stays open while
  a genuinely new voter does not.
- EM013 — `delete from voting_links` for an existing link on the open resolution, as
  `authenticated`, throws EM013.
- **The bypass shape**, reproduced from `20260803090000...`:181-206 and confirmed closed: as
  `authenticated`, attempt `UPDATE` (EM008, refused) — this alone already stops the shape, so
  the sequence is not reachable past its first step, and the test says so rather than pretending
  the DELETE step is still worth attempting once the UPDATE step already raised.
- `anon` denied on all four operations on both `resolutions` and `voting_links` — one row each,
  matching the eight-and-eight shape every table since `buildings` carries.

### Success Criteria

#### Automated Verification

- `npm run test:db` passes with this file included

#### Manual Verification

- Every `throws_ok` names the specific error code, not a bare SQLSTATE
- The EM012 positive control (existing owner, idempotent re-insert) is present and distinct
  from the EM012 negative control

---

## Phase 2: Vote finality (Risk #4)

### Overview

A second vote by the same właściciel on the same resolution fails at every layer
independently, and the finality guarantee holds even at the one caller RLS does not reach.

### Changes Required

#### 1. Vote finality suite

**File**: `supabase/tests/database/vote_finality.test.sql`

**Intent**: Exercise three independent mechanisms — the RLS policies (bind PostgREST roles),
`assert_vote_immutable` (binds `cast_vote`'s `security definer` context, which policies do
not reach), and `votes_resolution_owner_key` (binds any writer) — so a test that would still
pass if any one were quietly reopened does not exist here.

**Contract**: One building, one open resolution, one owner with a link.

- RLS: as `anon`, insert/update/delete on `votes` each throw (policy denial). As
  `authenticated`, insert/update/delete on `votes` each throw likewise — the one table in the
  schema where `authenticated` is not unconditional.
- EM010: insert one vote row **directly as the table owner** (bypassing `cast_vote`, the way
  the comment at `20260803090500...`:509-517 says only a trigger can bind), then `update` and
  `delete` that row each throw EM010. This is the assertion that would catch the RLS policies
  being satisfied while the trigger was quietly dropped.
- `cast_vote` finality: as `anon`, call `cast_vote(token, 'for')` — `vote_recorded = true`,
  `vote_choice = 'for'`. Call it again with the **same token but `'against'`** —
  `vote_recorded = false`, and `vote_choice` is still `'for'` — the stored choice is the first
  one, never the second, proving the conflict path does not silently overwrite.
- `votes_resolution_owner_key`: insert one vote directly (as table owner, bypassing
  `cast_vote`), then attempt a second direct insert for the same `(resolution_id, owner_id)`
  with a different `voting_link_id` — throws `23505`. This is the mechanism that binds a
  future writer other than `cast_vote`, independent of EM010.

### Success Criteria

#### Automated Verification

- `npm run test:db` passes with this file included

#### Manual Verification

- At least one assertion inserts a vote by a route other than `cast_vote`, so EM010 and the
  unique constraint are tested as the writer-independent guarantees the risk guidance asks for
- The double-`cast_vote` assertion checks the **stored choice**, not just `vote_recorded`

---

## Phase 3: Own-data-only (Risk #6)

### Overview

The unauthenticated surface returns the reader's own data and nothing about any other
właściciel, across every column it exposes and every grant that could leak one outside it.

### Changes Required

#### 1. Own-data-only suite

**File**: `supabase/tests/database/own_data_only.test.sql`

**Intent**: Prove the return list of `resolve_voting_link` carries exactly one owner's data
even when a second owner's vote exists to leak, and prove the column-grant containment
`20260802214500...` put in place still holds.

**Contract**: One building, two owners (A, B), one open resolution, both linked, both voted
with different choices.

- `select *` on `voting_links` throws `42501` for both `anon` and `authenticated`.
  `has_column_privilege(<role>, 'public.voting_links', 'token', 'select')` is `false` for both.
- As `anon`, `resolve_voting_link(<A's token>)` returns `own_vote_choice` equal to A's choice
  and `owner_full_name` equal to A's name — never B's, on either column. Oracle: the two rows
  inserted by the test itself, not the function's own behaviour.
- Same call's `owner_share_bps` equals the sum of A's own units only (a fixture where A holds
  two lokale makes this distinguishable from "the whole building's total" or "B's share").

### Success Criteria

#### Automated Verification

- `npm run test:db` passes with this file included

#### Manual Verification

- The fixture gives A and B different names, different choices and different share totals, so
  a test that accidentally read B's row would fail visibly rather than by coincidence matching

---

## Phase 4: Outcome threshold (Risk #2, threshold half)

### Overview

The outcome is measured against the whole building, the near-threshold case resolves exactly
where FR-007 says it must, no writer can forge an outcome the votes do not support, and the
lock-ordering property that makes the threshold correct under concurrency is pinned
structurally.

### Changes Required

#### 1. Outcome threshold suite

**File**: `supabase/tests/database/outcome_threshold.test.sql`

**Intent**: `resolution_tally` never re-sums the registry as a percentage and never uses a
denominator other than 10000; the resolution flips at `> 5000`, not `>= 5000`; EM014 refuses a
forged flip; the lock is taken before the insert, not after.

**Contract**: One building at exactly 10000 bps across a few owners, one open resolution.

- `resolution_tally` on zero votes: `total_bps = 10000`, `for_bps = against_bps = 0`,
  `not_cast_bps = 10000`, both `*_missing_bps = 5001`. Oracle: FR-007's own arithmetic,
  computed in the test, not read from the function.
- Knife-edge, exactly at the line: an owner (or sum of owners) voting **exactly 5000** bps
  `for` leaves the resolution `open` — `for_missing_bps = 1`. A further vote crossing to
  **5001** flips it to `passed`, `decided_at` set. Symmetric case for `against` → `rejected`.
  This is the single assertion the risk guidance names by name ("the near-threshold uchwała
  where one rounding decision changes the result").
- EM014: as `authenticated`, `update resolutions set status = 'passed', decided_at = now()` on
  an open resolution with `for_missing_bps > 0` throws EM014. Reproduces
  `20260805084000...`'s own header repro.
- Structural lock-ordering pin: `trigger_is('public', 'votes', 'votes_lock_resolution',
  'lock_resolution_for_outcome')` and the trigger's timing is `BEFORE` — the fact
  `20260804213630...`:1205-1226 documents as the one that must never move to `AFTER`.

### Success Criteria

#### Automated Verification

- `npm run test:db` passes with this file included
- By hand, on the local stack: temporarily change `votes_lock_resolution` from `before insert`
  to `after insert`, confirm the structural test goes red, revert. Recorded in this change
  folder's mutation notes, not left as a claim.

#### Manual Verification

- The knife-edge assertion states the exact bps values used and why they sit either side of
  5000, not just "a large vote" and "a small vote"
- No assertion recomputes the 10000 constant from the registry — it is asserted as a literal,
  matching `resolution_tally`'s own comment that it is a constant, not a re-sum

---

## Phase 5: Registry-import atomicity (Risk #8, atomicity half)

### Overview

A refused import leaves the building importable again — no owners, no units, no total_area_m2
— for both an immediate failure and a deferred one.

### Changes Required

#### 1. Import atomicity suite

**File**: `supabase/tests/database/import_atomicity.test.sql`

**Intent**: Prove `import_building_units` either writes everything or writes nothing, for a
failure that happens mid-statement (not one of the early-return guards EM001/EM002/EM005,
which never reach the insert at all).

**Contract**: One empty building per case.

- Mid-statement unique violation: `p_rows` with two entries sharing `unit_number`. The call
  throws `23505` (`units_building_id_unit_number_key`). After the throw, `count(*)` on both
  `units` and `owners` for the building is `0`, and `buildings.total_area_m2` is still `null`
  — the building is importable again, per PRD Non-Goals' "no re-import, no edit" making this
  the only recovery path there is.
- Deferred share-total failure: `p_rows` summing to 9000 bps (not 10000). The call itself
  returns normally (the check is deferred); `set constraints all immediate` then throws EM003,
  following the `owner_holds_units.test.sql` pattern. Recorded explicitly: this case's rows
  are NOT asserted absent afterward, because the deferred trigger — by design — only enforces
  at commit or at an explicit immediate check, matching what a real PostgREST request (one
  transaction per call) does at its own commit.
- Positive control: `p_rows` that import cleanly leaves `count(*)` matching the row count
  returned and `total_area_m2` equal to the sum of the fixture's `area_m2` values — so the
  suite does not only know how to detect failure.

### Success Criteria

#### Automated Verification

- `npm run test:db` passes with this file included
- By hand: verified. The plain split into two top-level `insert` statements turned out to be a
  **null mutation** — a plpgsql function with no internal `exception` block gets no free
  savepoint between statements, so an unhandled error still rolls back the whole call. The
  mutation that actually breaks atomicity, and the one applied: owners inserted as their own
  statement, units insert wrapped in `exception when unique_violation then null` (a plausible
  "skip the bad row" instinct). Confirmed red (owner rows survived), reverted. Full account in
  `context/changes/testing-database-contract-tests/mutations.md`.

#### Manual Verification

- The mid-statement case's two rows genuinely reach the units insert (i.e., pass EM001/EM002/
  EM005 first) — asserted by using a single, otherwise-valid `p_rows` payload with only the
  duplicate `unit_number` wrong
- The deferred case's scope note is present in the file, not only in this plan

---

## Testing Strategy

### Contract tests (pgTAP)

- Electorate: EM008, EM009 (+ draft positive control), EM012 (+ idempotent positive control),
  EM013, the bypass sequence, anon denial on both tables
- Finality: RLS both roles, EM010 via a non-`cast_vote` writer, `cast_vote` double-call (stored
  choice), unique constraint via a non-`cast_vote` writer
- Own-data-only: column grant `42501` + `has_column_privilege` both roles, `resolve_voting_link`
  cross-owner isolation on vote choice, name and share
- Threshold: zero-vote tally, knife-edge both directions, EM014, lock-trigger timing
- Atomicity: mid-statement unique violation (immediate), share mismatch (deferred), positive
  control

### Manual Testing Steps

Mutation pass run after all five files were green, against the local stack, one mutation at a
time. Full account, including the two attempts that did not go as first hypothesised, in
`context/changes/testing-database-contract-tests/mutations.md`:

1. `votes_lock_resolution`: `before insert` → `after insert`. Phase 4's structural test went
   red, nothing else did. Reverted.
2. `assert_vote_immutable`: trigger dropped. Phase 2's two direct EM010 assertions went red —
   and so did the unique-constraint assertion after them, as a cascading consequence (the
   no-longer-refused UPDATE and DELETE corrupted the fixture row the later assertion depended
   on), not because the constraint itself weakened. Reverted.
3. `import_building_units`: the hypothesised split into two top-level `insert` statements
   turned out to be a **null mutation** — no free savepoint between two statements in one
   plpgsql call without its own exception handling. The mutation that actually breaks
   atomicity — owners insert as its own statement, units insert wrapped in `exception when
   unique_violation then null` — was applied instead and confirmed red (owner rows survived a
   swallowed units failure). Reverted.
4. `resolution_outcome_supported`'s `'passed'` branch: the hypothesised `for_missing_bps = 0`
   → `<= 0` was also a **null mutation** (the value is `greatest(0, ...)`-floored and can never
   go negative, so the two are equivalent over its whole range). A second variant — re-deriving
   the condition as `for_bps >= 5000` instead of reusing `resolution_tally`'s figure — is the
   off-by-one a real re-derivation would plausibly introduce, and it was caught, but only by a
   **new near-boundary EM014 case added to `outcome_threshold.test.sql` during this pass**
   (Progress 4.1 now covers 9 assertions, not 8) — the file's original zero-vote EM014 case
   stayed green throughout. Reverted.

Two of the four hypothesised mutations killed nothing as originally stated, and both are
recorded as findings rather than discarded, matching Phase 1's precedent. One of them (#4)
directly produced a new test rather than only a note.

### What these tests do not cover

Risks #1, #5, #7, #9 (Phases 3 and 4 of the rollout); a literal two-transaction concurrency
race (see What We're NOT Doing); anything at the application/route layer — these are pure
database-layer assertions, run as roles, never through an HTTP request.

## References

- Test plan: `context/foundation/test-plan.md` §2 (Risks #2, #3, #4, #6, #8), §3 Phase 2, §6.2,
  §6.5
- Migrations read directly (no `research.md` for this change):
  `supabase/migrations/20260802072737_create_units_and_owners.sql`,
  `20260802101500_registry_assertion_security_definer.sql`,
  `20260802181500_create_resolutions_and_voting_links.sql`,
  `20260802214500_restrict_voting_link_token_select.sql`,
  `20260803090000_harden_voting_links_and_resolutions.sql`,
  `20260803090500_create_votes.sql`, `20260804212500_voting_links_send_state.sql`,
  `20260804213630_resolution_outcome.sql`, `20260805084000_assert_outcome_matches_tally.sql`
- Convention to follow: `supabase/tests/database/owner_holds_units.test.sql`,
  `supabase/tests/database/smoke.test.sql`
- Mutation-log precedent: `context/changes/tests-phase1-shares-and-registry/mutations.md`

## Open Risks & Assumptions

- **The concurrency property is pinned structurally, not by reproduction.** See What We're NOT
  Doing. If `dblink` interleaving against committed-then-cleaned-up fixtures is ever judged
  worth the added fragility, it replaces Phase 4's structural trigger check rather than
  supplementing it.
- **Phase 5's deferred-failure case does not assert post-failure row absence.** That is a
  deliberate scope note, not an oversight — see Phase 5's contract.
- **Every suite creates and never explicitly drops its building.** `rollback` at file end
  handles it, matching every existing pgTAP file in this project; no suite here changes that
  convention.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands.

### Phase 1: Electorate guards (Risk #3)

#### Automated

- [x] 1.1 `npm run test:db` passes with `electorate_guards.test.sql` included

#### Manual

- [x] 1.2 Every `throws_ok` names a specific error code
- [x] 1.3 EM012 positive and negative controls both present

### Phase 2: Vote finality (Risk #4)

#### Automated

- [x] 2.1 `npm run test:db` passes with `vote_finality.test.sql` included

#### Manual

- [x] 2.2 EM010 and the unique constraint are each tested via a non-`cast_vote` writer
- [x] 2.3 Double-`cast_vote` assertion checks the stored choice

### Phase 3: Own-data-only (Risk #6)

#### Automated

- [x] 3.1 `npm run test:db` passes with `own_data_only.test.sql` included

#### Manual

- [x] 3.2 Fixture gives A and B distinguishable name/choice/share so a cross-read fails
      visibly

### Phase 4: Outcome threshold (Risk #2, threshold half)

#### Automated

- [x] 4.1 `npm run test:db` passes with `outcome_threshold.test.sql` included (9 assertions —
      grew by one during the mutation pass, see mutations.md)
- [x] 4.2 Mutation 1 (trigger timing) confirmed red, reverted

#### Manual

- [x] 4.3 Knife-edge assertion states exact bps values and why
- [x] 4.4 No assertion recomputes 10000 from the registry

### Phase 5: Registry-import atomicity (Risk #8, atomicity half)

#### Automated

- [x] 5.1 `npm run test:db` passes with `import_atomicity.test.sql` included
- [x] 5.2 Atomicity-breaking mutation (units insert swallowing a unique violation) confirmed
      red, reverted — the originally hypothesised plain split was a null mutation, see
      mutations.md

#### Manual

- [x] 5.3 Mid-statement fixture passes EM001/EM002/EM005 before reaching the unique violation
- [x] 5.4 Deferred-case scope note present in the file itself

### Phase 6: Test-plan bookkeeping

#### Automated

- [x] 6.1 `context/foundation/test-plan.md` §3 Phase 2 Status → `complete`
- [x] 6.2 §6.2 substance filled in, §6.5 filled in
