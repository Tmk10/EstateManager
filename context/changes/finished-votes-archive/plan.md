# Audit trail of a settled uchwała (S-06) — Implementation Plan

## Overview

An administrator opens a settled uchwała from the shared list and reconstructs **which udziały
produced the result**: one row per owner who voted, in the order the votes arrived, carrying the
weight that vote was worth when it was cast — followed by the owners who never voted, whose
silence is what the threshold counted as a no.

This is roadmap item `S-06`, the last piece of stream B and the smallest one left. The trail's
data has existed and been immutable since `S-03`; what is missing is the reading surface and the
decision about its depth, which this plan settles: **per-owner, named, settled uchwały only**.

## Current State Analysis

**The data is already complete, immutable, and readable.**

- `public.votes` (`supabase/migrations/20260803090500_create_votes.sql:27`) stores `owner_id`,
  `choice` (`for` / `against`), `share_bps` **snapshotted at cast time**, `created_at` on the
  **database** clock, and `voting_link_id`. `votes_resolution_owner_key` makes one vote per owner
  per resolution the identity of a row.
- `assert_vote_immutable` (`EM010`) refuses every update and every delete, and the six `false`
  policies plus the unique constraint bind the other callers. Nothing in the trail can drift.
- `votes_select_authenticated` (`:151`) is `using (true)`, and no migration has ever revoked
  column-level `select` on this table. **A signed-in administrator can already read per-owner vote
  rows through PostgREST** — so this slice needs no migration, no new grant, and no new function.
  That makes it the first slice in this project whose entire delta is application code.

**The page already refuses to show it, deliberately and in writing.**

`src/pages/buildings/[id]/resolutions/[resolutionId].astro` reads votes with
`select("id", { count: "exact", head: true })` (`:152`) — a bare count, no rows. Three separate
comments record the refusal as scoped to this slice, and all three are now out of date:

- `:79–86` — the `voteCount` doc comment: *"Deliberately a bare count: no per-owner marker, no
  choice, no percentage — those carry the question of whether an administrator may see how someone
  voted, which S-06 is scoped to answer and this slice is not."*
- `:153–158` — the `resolution_tally` call site: *"there is no shape of this page that can say how
  anyone voted — that is S-06's question, and until it is answered the answer is no."*
- `resolution_tally`'s own `comment on function` (`20260804213630_resolution_outcome.sql:220`):
  *"Aggregate only: this function cannot report how any individual owner voted, which is S-06's
  question and not answerable here."*

**The page's established read shape is five parallel selects joined in memory** (`:126–159`),
with a comment explaining why: the registry is at most ~70 owners, and the alternative is a
projection string deep enough that a wrong column would go unnoticed — `supabase-js` in this
version does not type-check the contents of `.select()`. This plan follows that shape rather than
arguing with it.

**Fixtures for this exist and cannot be manufactured again.** The local database carries two
decided uchwały, settled through the application on 2026-08-05 (`live-tally-and-outcome/change.md`):
`7/2026` **passed at exactly 5001 bps** — the narrowest possible crossing — and `6/2026`
**rejected at 7499 bps**. `EM007` and `EM010` make both irreversible, which is precisely why they
are the fixtures this slice is verified against.

**Test infrastructure exists and asserts nothing about the domain.** `src/lib/smoke.test.ts` (3
assertions) and `supabase/tests/database/smoke.test.sql` (4) prove the harnesses run. Both gates
are wired in `ci.yml`. `context/foundation/test-plan.md` §2 lists eight risks; none is covered.

## Desired End State

A signed-in administrator opening a `passed` or `rejected` uchwała at
`/buildings/<id>/resolutions/<resolutionId>` sees, below the existing *Bilans udziałów*:

1. **Jak zagłosowano** — one row per vote, oldest first: właściciel, lokale, udział, `Za` / `Przeciw`,
   and the moment it was cast. The udział shown is the vote's snapshot, not a live re-sum of the
   registry.
2. **Kto nie oddał głosu** — the owners with no vote, with their udziały, labelled as counting
   toward the threshold in effect as a no.
3. **A reconciliation line** proving the trail is complete: `za + przeciw + nieoddane = 100,00%`,
   and the same `for_bps` / `against_bps` figures the *Bilans udziałów* panel above already shows
   from `resolution_tally`.

A `draft` or `open` uchwała is **unchanged** — no trail, no per-owner choices, exactly today's
page. `/vote/<token>` is untouched.

Verified by: the two local fixtures rendering correctly, the reconciliation summing to 100,00% on
both, and a Vitest suite that fails if the assembler stops reconciling.

### Key Discoveries

- `votes_select_authenticated` is `using (true)` with no column revoke — no migration needed
  (`20260803090500_create_votes.sql:151`).
- `votes.share_bps` is authoritative over any recomputation, by the table's own comment (`:97`) —
  the trail must read it, never re-sum `units`.
- `votes.created_at` is the **database** clock; `resolutions.opened_at` is the **Worker's**. The
  two must never be differenced (CLAUDE.md, and the `decided_at` note). Chronological ordering
  within `votes` is safe because it compares one clock against itself.
- The page loads five reads in parallel and joins in memory (`:130`), for stated reasons.
- `formatShareBps` (`src/lib/shares.ts:110`) and `formatResolutionDate`
  (`src/lib/resolutions.ts:77`) already exist and are what the trail formats with.
- `isResolutionDecided` (`src/lib/resolutions.ts:140`) is the existing gate for "settled".

## What We're NOT Doing

- **No migration.** No new table, function, policy, grant, or column. If the implementation finds
  it needs one, that is a signal the plan was wrong — stop and re-plan rather than adding it.
  - **OVERRIDDEN 2026-08-05, by the product owner, during Phase 3.** The trail rendered an owner
    holding no lokale as `— (0,00%)`, seated in the electorate of a settled uchwała. The rule
    above worked exactly as intended: implementation stopped and surfaced it rather than quietly
    adding a migration. The decision was to add one anyway — `20260805192000_owner_holds_units.sql`,
    raising **EM015** — because the invariant "an owner is someone who owns something" was never
    written down and only `import_building_units` happened to honour it. Consequences: this slice
    is **no longer** a plain code deploy (see Migration Notes), and criterion 2.4 no longer holds.
- **Nothing on `/vote/<token>`.** An owner still never learns another owner's vote. That is a PRD
  guardrail, not a scope decision, and this slice does not reopen it.
- **Nothing on a `draft` or `open` uchwała.** No live per-owner attribution, no "kto już
  zagłosował" list. FR-009 is scoped to *zakończone* głosowania; FR-008's live tracking is already
  built and stays as it is.
- **No export.** No CSV, no print stylesheet, no PDF. The trail is a screen in v1.
- **No separate archive route.** Settled by roadmap.md:245 — the uchwała stays on the shared list.
- **No pgTAP test.** Decided in planning: the policies this slice relies on already exist, so a
  contract test could only be written after the fact and would not be TDD. It belongs to
  test-plan §3 Phase 2, not here.
  - **Partially overtaken 2026-08-05, and the reasoning survives intact.** The rule was about
    testing *existing* policies after the fact. `EM015` is a **new** constraint, so it could be —
    and was — driven red-before-green: `supabase/tests/database/owner_holds_units.test.sql` failed
    with `caught: no exception, wanted: EM015` before the migration existed. What the plan ruled
    out is still ruled out: nothing here tests `votes`' pre-existing policies or what `anon` may
    read, and that remains test-plan §3 Phase 2's job.
- **No per-lokal attribution.** Votes carry a summed per-owner weight by design (`S-02`); breaking
  it back down would re-derive from the registry the snapshot exists to be independent of.

## Implementation Approach

Three phases, in dependency order: the logic first with tests leading it, then the page that
renders what the logic returns, then verification against the irreproducible fixtures and the
records that keep the project's state honest.

The load-bearing structural choice is that **all the arithmetic lives in one dependency-free pure
function**, `src/lib/resolution-trail.ts`, taking plain arrays and returning plain data. The page
does no folding, no summing and no sorting of its own — it renders. This is what makes the slice
TDD'able at all, and it follows `src/lib/shares.ts` and `src/lib/units-csv.ts`, which are
dependency-free for the same reason.

## Critical Implementation Details

**The trail's udział must come from `votes.share_bps`, never from summing the owner's units.**
Today the two agree — the registry is static in v1 — so a wrong implementation passes every manual
check and is invisible. The vote's snapshot is authoritative by the table's own comment, and the
assembler's contract is what pins it: a test supplies a vote whose `share_bps` disagrees with the
owner's units and asserts the trail reports the snapshot. This is the single most important
assertion in the slice.

**The reconciliation must be computed from the trail's own rows, not copied from
`resolution_tally`.** If the assembler simply echoed the tally's figures, the reconciliation would
be a tautology and could never catch a missing or double-counted owner. It sums what it actually
assembled; the page then displays that beside the tally's independent figures, and a discrepancy
is visible rather than smoothed over.

## Phase 1: The trail assembler (test-first)

### Overview

Build `src/lib/resolution-trail.ts` — a pure, dependency-free module that turns the page's raw
reads into the trail's rows and totals — driven by Vitest, red before green.

### Changes Required:

#### 1. The assembler module

**File**: `src/lib/resolution-trail.ts` (new)

**Intent**: Fold owners, units and vote rows into the trail the page renders: the cast votes in
chronological order, the owners who did not vote, and a reconciliation of the three figures
against the building total. Pure and dependency-free — no Supabase import, no Astro import — so it
can be driven by Vitest and, like `shares.ts`, executed directly.

**Contract**: One exported function taking three plain arrays (owners with `id` / `full_name`,
units with `owner_id` / `unit_number` / `share_bps`, votes with `owner_id` / `choice` /
`share_bps` / `created_at`) and returning an object with: the cast rows sorted by `created_at`
ascending, each carrying the owner's name, their unit numbers, the **vote's** `share_bps`, the
choice and the timestamp; the non-voting owners with their summed registry `share_bps`; and totals
for `for` / `against` / `notCast` summed from those rows. Unit numbers sort with `localeCompare(…,
"pl", { numeric: true })`, matching the two tables already on the page. A vote whose `owner_id`
matches no owner must not be silently dropped — it is a broken invariant, and the contract says
what happens to it (surfaced, not swallowed).

### Success Criteria:

#### Automated Verification:

- `npm test` passes with the new suite green
- The assembler reports the **vote's** `share_bps`, not the owner's live unit sum, when the two disagree
- Trail totals reconcile: `for + against + notCast === TOTAL_BPS` on a full registry
- Cast rows come back in `created_at` ascending order regardless of input order
- The 5001-bps boundary case assembles correctly (one vote crossing by a single basis point)
- `npx astro sync && npm run lint` passes
- `npm run build` completes

#### Manual Verification:

- The test names describe outcomes, not mechanism — readable as a statement of the domain rule

---

## Phase 2: The read and the trail section

### Overview

Add the votes read to the page's existing parallel batch, render the trail for settled uchwały
only, and correct the three comments that record the no-attribution decision this slice reverses.

### Changes Required:

#### 1. The page read

**File**: `src/pages/buildings/[id]/resolutions/[resolutionId].astro`

**Intent**: Replace the head-only vote count with a real projection, so the page has the rows the
trail needs, and hand them to the Phase 1 assembler. The existing `voteCount` display keeps
working — it becomes a length rather than a PostgREST count.

**Contract**: The `votes` entry in the `Promise.all` batch (`:152`) projects
`owner_id, choice, share_bps, created_at`, named explicitly rather than `*` for the reason the
neighbouring `voting_links` read already gives. The batch stays five reads in parallel; nothing
becomes sequential. The assembler is called once, after the reads resolve, and only when
`isResolutionDecided(resolution.status)` — an open uchwała must not pay for a read it does not
render.

#### 2. The trail section

**File**: `src/pages/buildings/[id]/resolutions/[resolutionId].astro`

**Intent**: Render *Jak zagłosowano* and *Kto nie oddał głosu* below the *Bilans udziałów* panel,
for settled uchwały only, plus the reconciliation line. Reuses the page's existing table and
amber-block vocabulary rather than inventing a new one.

**Contract**: A section rendered only when `isResolutionDecided(...)` is true. The cast table's
columns are Właściciel / Lokale / Udział / Głos / Kiedy, in the assembler's order. Choice renders
as `Za` / `Przeciw` using the same green/rose vocabulary `describeResolutionStatus` established for
`passed` / `rejected`. Non-voters get their own block, in the shape the page already uses for
*Właściciele bez linku*, stating that their udziały counted toward the threshold. The
reconciliation line prints the assembler's own three figures with `formatShareBps` and states they
total 100,00%. Timestamps use `formatResolutionDate`. Nothing on this page differences
`created_at` against `opened_at`.

#### 3. The three superseded comments

**Files**: `src/pages/buildings/[id]/resolutions/[resolutionId].astro`,
`supabase/migrations/20260804213630_resolution_outcome.sql`

**Intent**: Three comments state that per-owner attribution is unanswered and that "the answer is
no" until `S-06` answers it. It is now answered; leaving them would make the codebase argue against
its own behaviour. Each is rewritten to record **what was decided and why** — administrator only,
settled uchwały only, owners never — so the boundary that still holds is stated as clearly as the
one that fell.

**Contract**: `[resolutionId].astro:79–86` and `:153–158` updated in place.
`resolution_tally`'s `comment on function` sentence about `S-06` is corrected — **by a comment
edit only if a migration is being written for another reason, otherwise left with a note in the
page instead**. A migration whose entire content is a comment change must not be created: migrations
reach production by hand and are forward-only, and this plan is otherwise migration-free.

### Success Criteria:

#### Automated Verification:

- `npx astro sync && npm run lint` passes
- `npm run build` completes
- `npm test` still passes
- No new migration file exists in `supabase/migrations/`
- The rendered HTML of a settled uchwała contains no 43-character voting token

#### Manual Verification:

- A settled uchwała shows the trail; a `draft` and an `open` one are visually unchanged
- The trail's figures agree with the *Bilans udziałów* panel above it
- The non-voter block names the owners the balance says have not voted

---

## Phase 3: Verification against the fixtures, and the records

### Overview

Walk the slice against the two irreproducible local fixtures, then update the documents that carry
this project's state.

### Changes Required:

#### 1. The walkthrough

**File**: none — this is verification, recorded in `change.md`

**Intent**: Prove the trail against `7/2026` (passed at 5001 bps, the one-basis-point crossing) and
`6/2026` (rejected at 7499 bps), plus a still-open uchwała as the negative control. Run against a
local Worker with `npm run dev`, signed in, as the `S-09` and `S-05` records set the standard.

**Contract**: Each of the four states (passed, rejected, open, draft) is loaded and the result
recorded in `change.md` as a table. For `7/2026` specifically, the trail's `za` figure must read
50,01% and the reconciliation must close at 100,00% — the boundary is the point of that fixture.

#### 2. The records

**Files**: `context/foundation/roadmap.md`, `CLAUDE.md`, `context/changes/finished-votes-archive/change.md`

**Intent**: Record the depth decision where the question was asked, and the built state where this
project keeps it. The roadmap's S-06 Unknowns carry the open question this plan answered; leaving
it open after shipping would send the next reader looking for a decision that has already been
made.

**Contract**: roadmap.md §S-06 gains a `ROZSTRZYGNIĘTE 2026-08-05` entry stating per-owner, named,
settled-only, administrator-only, and its Status moves `proposed` → `done`. The slice table row for
S-06 moves likewise. CLAUDE.md's "Current state" gains the S-06 bullet and its opening sentence
("Six slices…") is corrected — the count and the list of what remains unbuilt both change.
`change.md` records the walkthrough and anything the implementation learned.

### Success Criteria:

#### Automated Verification:

- `npx astro sync && npm run lint && npm test && npm run build` all pass
- `git status` shows no unintended files

#### Manual Verification:

- `7/2026` renders the trail with `za` at 50,01% and reconciliation at 100,00%
- `6/2026` renders the trail with `przeciw` at 74,99%
- An open uchwała shows no trail
- roadmap.md S-06 status reads `done` and its Unknowns record the decision
- CLAUDE.md "Current state" describes what is now built, with the slice count corrected

---

## Testing Strategy

### Unit Tests (Vitest, `src/lib/resolution-trail.test.ts`)

Focused, 4–5 tests — the behaviours that would catch a real regression:

- The trail reports the **vote's** snapshot weight when it disagrees with the owner's live units.
  This is the assertion that protects the `S-06` guarantee against a future registry-edit path.
- The three totals reconcile to `TOTAL_BPS` across a full registry with a partial turnout.
- Cast rows come back oldest-first regardless of input order.
- Owners with no vote appear in the non-voter block with their registry share.
- The 5001-bps boundary: one vote crossing by a single basis point assembles and reconciles.

### Not tested here

Database-side access (what `anon` may read of `votes`) — that is test-plan §3 Phase 2 and is
explicitly out of this slice's scope. Saying so is the point: a green `npm test` after this slice
means the assembler is correct, not that the trail is authorised correctly.

### Manual Testing Steps

1. `npm run dev`, sign in as `test@test.com`.
2. Open `7/2026` — confirm the trail, the 50,01% figure, and the reconciliation at 100,00%.
3. Open `6/2026` — confirm the rejected trail at 74,99% przeciw.
4. Open `1/2026` or `2/2026` (still open) — confirm no trail, page unchanged.
5. Open a draft uchwała — confirm the edit form is unchanged.
6. Search the settled page's HTML for a 43-character token — expect zero matches.

## Performance Considerations

The votes read moves from a `head: true` count to a row projection. The registry is at most ~70
owners and one vote per owner, so this is bounded at ~70 rows of four columns. It stays inside the
existing parallel batch — one more column set, not one more round trip.

## Migration Notes

~~None. This slice adds no migration, and that is a deliberate constraint of the plan rather than an
omission — see "What We're NOT Doing". Nothing needs applying to production before the code lands,
which makes this the first slice in the project that deploys as a plain code change.~~

**Superseded 2026-08-05.** One migration, added under the override recorded in "What We're NOT
Doing": `20260805192000_owner_holds_units.sql` (EM015 — an owner must hold at least one lokal).

It must be applied **before** the code that ships with it, by the standing hand-applied procedure
(`npx supabase db push` from a linked checkout; CLAUDE.md, deployment residual G14). The ordering is
softer than usual here — the application code does not call anything the migration adds, so code
deployed first would run correctly against an unconstrained database — but the order still holds,
because reversed it leaves a window in which a unit-less owner can be created and then outlives the
constraint that would have refused it. `create constraint trigger` validates nothing that already
exists.

The migration is safe against existing data for the same reason: it cannot fail on rows already in
the table. It also cannot be rolled back by `wrangler rollback`, which reverts code and never schema.

## References

- Roadmap slice: `context/foundation/roadmap.md` §S-06
- Trail data and its immutability: `supabase/migrations/20260803090500_create_votes.sql:27,97,151`
- The aggregate this sits beside: `supabase/migrations/20260804213630_resolution_outcome.sql:183`
- The page being extended: `src/pages/buildings/[id]/resolutions/[resolutionId].astro:79,126,152`
- Fixture provenance: `context/changes/live-tally-and-outcome/change.md`
- Test harness state: `context/foundation/test-plan.md` §2, §3

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: The trail assembler (test-first)

#### Automated

- [x] 1.1 `npm test` passes with the new suite green — 5a2be8a
- [x] 1.2 The assembler reports the vote's `share_bps`, not the owner's live unit sum, when the two disagree — 5a2be8a
- [x] 1.3 Trail totals reconcile: `for + against + notCast === TOTAL_BPS` on a full registry — 5a2be8a
- [x] 1.4 Cast rows come back in `created_at` ascending order regardless of input order — 5a2be8a
- [x] 1.5 The 5001-bps boundary case assembles correctly — 5a2be8a
- [x] 1.6 `npx astro sync && npm run lint` passes — 5a2be8a
- [x] 1.7 `npm run build` completes — 5a2be8a

#### Manual

- [x] 1.8 The test names describe outcomes, not mechanism — 5a2be8a

### Phase 2: The read and the trail section

#### Automated

- [x] 2.1 `npx astro sync && npm run lint` passes — 24a3b0c
- [x] 2.2 `npm run build` completes — 24a3b0c
- [x] 2.3 `npm test` still passes — 24a3b0c
- [x] 2.4 No new migration file exists in `supabase/migrations/` — 24a3b0c (true as of that commit; **superseded** — see the EM015 override below)
- [x] 2.5 The rendered HTML of a settled uchwała contains no 43-character voting token — 24a3b0c

#### Manual

- [x] 2.6 A settled uchwała shows the trail; `draft` and `open` are visually unchanged — 24a3b0c
- [x] 2.7 The trail's figures agree with the Bilans udziałów panel above it — 24a3b0c
- [x] 2.8 The non-voter block names the owners the balance says have not voted — 24a3b0c

### Phase 3: Verification against the fixtures, and the records

#### Automated

- [x] 3.1 `npx astro sync && npm run lint && npm test && npm run build` all pass — 14bbcd1
- [x] 3.2 `git status` shows no unintended files — 14bbcd1

#### Manual

- [x] 3.3 `7/2026` renders the trail with `za` at 50,01% and reconciliation at 100,00% — 14bbcd1
- [x] 3.4 `6/2026` renders the trail with `przeciw` at 74,99% — 14bbcd1
- [x] 3.5 An open uchwała shows no trail — 14bbcd1
- [x] 3.6 roadmap.md S-06 status reads `done` and its Unknowns record the decision — 14bbcd1
- [x] 3.7 CLAUDE.md "Current state" describes what is now built, with the slice count corrected — 14bbcd1
