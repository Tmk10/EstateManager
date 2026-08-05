# S-05: Live share tally and resolution outcome — Implementation Plan

## Overview

An administrator watches a resolution's share balance move in real time and sees exactly how
much either side still needs; the resolution then decides itself — **podjęta** the moment `za`
shares pass half the building, **upadła** the moment `przeciw` shares do. All of a building's
resolutions, running and finished, stand on one list under its own route.

This is `S-05` from `context/foundation/roadmap.md`, delivering `FR-007` and `FR-008`.

## Current State Analysis

`S-03` left the vote path complete and the outcome path empty. What exists:

- `public.votes` holds one row per owner per resolution with `share_bps` snapshotted at the
  moment of casting, written **only** by `public.cast_vote` (`security definer`).
- `public.resolutions.status` is `text` with `check (status in ('draft', 'open'))`.
- `public.assert_resolution_frozen` (`EM006` / `EM007`) permits exactly one transition:
  `draft → open`.
- The administrator's resolution page shows a **head-count** of voters — "Zagłosowało N z M
  właścicieli" — with copy stating plainly that it decides nothing.
- The resolutions list is a section inside `src/pages/buildings/[id]/index.astro`, nested in
  the `units.length > 0` branch.
- `src/pages/vote/[token].astro` branches on whether the reader has voted, and never reads
  `resolution_status`.

Three constraints discovered during research shape everything below:

1. **The denominator is a constant.** Every building's `units.share_bps` totals exactly
   `10000`, asserted by `EM003` rather than merely intended, so the rule is
   `sum * 2 > 10000` in integers — prescribed verbatim in
   `supabase/migrations/20260802072737_create_units_and_owners.sql:71-74` and restated in
   `src/lib/shares.ts:10-14`.
2. **Every existing guard is keyed on `<> 'draft'`, not on `= 'open'`.** `EM006`, `EM009`,
   `EM012`, `EM013` and `resolutions_opened_at_matches_status` all cover the new statuses
   without modification. Only the check constraint and `EM007` need widening.
3. **`cast_vote` gates on `r.status = 'open'`.** The moment the status leaves `open`, a late
   vote falls onto the existing zero-row neutral path. Voting closes with no new code and no
   new observable branch in the token space.

## Desired End State

An administrator opens `/buildings/<id>/resolutions`, sees every resolution of that building
with a status badge that distinguishes four states, and opens one to find the live balance:
shares for, shares against, shares not yet cast, and — for each side — how much more it needs
to cross the threshold. When a vote crosses it, the resolution's status changes in the same
database transaction as the vote that caused it, `decided_at` is stamped from the database
clock, and every subsequent vote on that link is refused on the existing neutral path. An owner
opening their link afterwards reads the outcome and their own receipt, not a pair of buttons
that do nothing.

Verified by: casting votes against the local stack until the threshold is crossed, and
confirming the flip, the refusal of later votes, and the three screens.

### Key Discoveries:

- The threshold expression is already prescribed in the schema
  (`20260802072737_create_units_and_owners.sql:71-74`).
- `resolutions_status_known`'s own comment says *"S-05 widens this list with 'passed' and
  'rejected'"* (`20260802181500_create_resolutions_and_voting_links.sql:43-45`).
- `assert_resolution_frozen`'s header says *"S-05's outcome flip will pass through here"*
  (`…:292-293`).
- `resolve_voting_link` already returns `resolution_status` (`20260803090500:379-391`), so the
  owner's page needs no schema change to render the outcome.
- **No `PROTECTED_ROUTES` change is needed** — `src/middleware.ts:26` already lists
  `/buildings` and `:38` matches with `startsWith`.
- `src/lib/resolutions.ts` exists precisely to hold rules with more than one caller; the
  status label is the second such rule.

## What We're NOT Doing

- **No notification to the administrator** on decision. The PRD provides for none; `FR-008` is
  satisfied by the state being visible on the next visit.
- **No per-owner vote disclosure to the administrator.** Who voted how is `S-06`'s question.
  The tally is aggregate only, and the projection deliberately omits `owner_id`.
- **No e-mail fanout.** That is `S-04`, running in parallel.
- **No audit trail screen.** `S-06`.
- **No end date, deadline, or countdown.** `FR-007` gives voting no end; a duration would also
  force the `opened_at` clock question this plan sidesteps.
- **No change to `/api/vote/[token]`'s error model.** Its neutrality is load-bearing.
- **No re-scoping of `votes_select_authenticated`.** Still `using (true)`; still `Block: no`
  for one administrator account and a hard prerequisite for a second.
- **No TypeScript implementation of the threshold rule.** Decided during planning: the rule
  lives in SQL only.

## Implementation Approach

The outcome is **stored, not derived**, and written by an `after insert` trigger on
`public.votes`. Storing it is what makes `cast_vote`'s existing `status = 'open'` gate close
the vote automatically; deriving it would leave that gate open forever and give `S-06` no
recorded moment. Putting it in a trigger rather than inside `cast_vote` binds any future writer
of `votes`, not just today's single one, and keeps `cast_vote` about casting.

Because the threshold rule lives only in SQL, the screens must **read** the tally rather than
recompute it. A single `public.resolution_tally(uuid)` returns the four figures the page
renders, so the constant `10000` and the `+1` that turns "half" into "more than half" appear in
exactly one place in the codebase.

## Critical Implementation Details

**Concurrency — the one genuinely new correctness problem.** Under `READ COMMITTED`, two owners
committing at the same instant each insert their vote and then sum. Neither transaction sees
the other's uncommitted row, so both can read a sub-threshold total when the two together cross
it, leaving the resolution `open` with a majority already cast. `votes_resolution_owner_key`
does not help — it serialises one owner, not one resolution. The trigger must take a row lock
on the resolution **before** summing:

```sql
perform 1 from public.resolutions r where r.id = new.resolution_id for update;
```

The second transaction then blocks until the first commits and re-reads under a fresh statement
snapshot that includes it. The trigger was going to touch that row anyway on the deciding vote,
so the lock costs nothing extra, and contention is one building's voters on one resolution.

**Local migration must not reset the database.** The local stack carries hand-made test state
(a building, a registry, an open resolution, real votes) that `npx supabase db reset` would
destroy. Apply with `npx supabase migration up`, then `npm run db:types`.

**Ordering to production is forward-only and manual.** `npx supabase db push` runs **before**
the code that depends on the new status values is deployed; reversed, production serves code
reading a column that does not exist. Nothing in CI does this.

---

## Phase 1: Schema — statuses, `decided_at`, the outcome trigger, the tally read

### Overview

Everything that decides anything lands in one migration. After this phase the database resolves
uchwały on its own, with no screen involved.

### Changes Required:

#### 1. The migration

**File**: `supabase/migrations/20260804<HHmmss>_resolution_outcome.sql`

**Intent**: Widen the resolution lifecycle from two states to four, record when a resolution was
decided, and make the decision happen transactionally with the vote that causes it. Written as
one transaction, forward-only, in the commentary style the surrounding migrations use — the
concurrency argument and the reason the outcome is stored rather than derived both belong in
the file, because that is where the next reader meets them.

**Contract**:

- `resolutions_status_known` → `check (status in ('draft', 'open', 'passed', 'rejected'))`.
- New column `public.resolutions.decided_at timestamptz` — null until decided, written by the
  trigger with the **database** clock. Add `comment on column` recording that it must never be
  differenced against `opened_at`, which carries the Worker's clock
  (`…/open.ts:130`).
- New constraint `resolutions_decided_at_matches_status`: `decided_at` is not null exactly when
  `status in ('passed', 'rejected')` — the same shape
  `resolutions_opened_at_matches_status` already uses for `opened_at`.
- `public.assert_resolution_frozen` — replace the `EM007` transition test so the permitted set
  is `draft → open`, `open → passed`, `open → rejected`. Everything else still raises `EM007`,
  including `passed → open`, `rejected → open` and `passed → rejected`. The `EM006` content
  freeze is untouched: it is keyed on `old.status <> 'draft'` and so already covers the new
  states.
- New `public.apply_resolution_outcome()` — `after insert on public.votes for each row`,
  `security invoker`, `set search_path = ''`. Takes the row lock above, sums `share_bps`
  grouped by `choice` for `new.resolution_id`, and updates the resolution to `passed` when
  `for * 2 > 10000` or `rejected` when `against * 2 > 10000`, stamping `decided_at = now()`.
  Does nothing when neither holds. The update passes through `assert_resolution_frozen`, which
  is the intended path.
- New `public.resolution_tally(p_resolution_id uuid)` — `security invoker`, `stable`,
  `set search_path = ''`, returning one row:
  `total_bps integer, for_bps integer, against_bps integer, not_cast_bps integer,
   for_missing_bps integer, against_missing_bps integer`. `not_cast_bps` is
  `total_bps - for_bps - against_bps`; the two `missing` figures are how many more basis points
  that side needs to cross the threshold, floored at zero. `revoke execute … from public, anon`
  and `grant execute … to authenticated`, matching `assert_building_registry`.

  Invoker is correct here and the contrast with `assert_building_registry` is worth a comment:
  that function had to be flipped to `definer` because an **assertion** that aggregates only
  the caller's visible rows is silently wrong. This one is a **display** read for one
  administrator, and showing only what that caller may see is the right behaviour once the v2
  roles model scopes `votes_select_authenticated`. The authoritative decision is not taken
  here — it is taken by the trigger, which runs inside `cast_vote` and sees everything.

#### 2. Generated types

**File**: `src/db/database.types.ts`

**Intent**: Regenerate so the new function and column are typed, and commit in the same commit
as the migration — the discipline CLAUDE.md names.

**Contract**: `npx supabase migration up` (not `db reset`) then `npm run db:types`.

### Success Criteria:

#### Automated Verification:

- `npx supabase migration up` applies cleanly against the local stack
- `npm run db:types` regenerates without error and the diff shows `decided_at` and
  `resolution_tally`
- `npx astro sync && npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- Casting `za` votes against the local stack past 50% flips the resolution to `passed`,
  stamps `decided_at`, and a further vote on another link is silently refused (neutral page,
  no row written)
- The mirror case: `przeciw` past 50% flips to `rejected`
- `EM007` still refuses `passed → open` and `open → draft` when attempted directly through
  PostgREST
- `resolution_tally` returns figures that add up to `10000` on a part-voted resolution

---

## Phase 2: The resolutions route and the four-status badge

### Overview

Give the list its own page, teach the whole app that a resolution has four states, and shrink
the building page to an entry point.

### Changes Required:

#### 1. Shared status presentation

**File**: `src/lib/resolutions.ts`

**Intent**: One place decides what each status is called and how its badge looks. Three callers
render this today and each has its own copy of a two-branch conditional; a `passed` resolution
would currently claim voting is still open on every one of them.

**Contract**: Export a function mapping a status string to its Polish label and badge classes —
`draft` → *Wersja robocza*, `open` → *Głosowanie otwarte*, `passed` → *Podjęta*, `rejected` →
*Upadła* — with an explicit fallback for an unrecognised value rather than a silent default to
"open". Colour follows the existing palette: neutral for draft, green for open, and a
distinguishable pair for the two terminal states.

#### 2. The resolutions list page

**File**: `src/pages/buildings/[id]/resolutions/index.astro`

**Intent**: One list carrying every resolution of the building, running and finished together,
distinguished by the badge — the decision recorded in the roadmap on 2026-08-03. Modelled on
the existing list markup being removed from the building page.

**Contract**: Route `/buildings/<id>/resolutions`, already protected by `startsWith("/buildings")`
in `src/middleware.ts:26` — **no middleware change**. Reads building + resolutions ordered
`created_at desc`, mirroring the current query at `src/pages/buildings/[id]/index.astro:79-83`.
Carries the *Nowa uchwała* action and the empty state. Handles the null Supabase client the way
every other page does.

#### 3. The building page gives up the list

**File**: `src/pages/buildings/[id]/index.astro`

**Intent**: Replace the inline list with a single entry point plus a count, keeping the
footprint small for `S-09` to rework into a module tile.

**Contract**: Remove the list markup and the *Nowa uchwała* button; keep the resolutions read
but reduce it to a count. Link to `/buildings/<id>/resolutions`. The section stays inside the
`units.length > 0` branch, for the reason already stated there.

#### 4. The resolution page badge

**File**: `src/pages/buildings/[id]/resolutions/[resolutionId].astro`

**Intent**: Use the shared helper instead of the local `isDraft` conditional.

**Contract**: `isDraft` stays as the gate for the edit form and the *Uruchom głosowanie* panel —
that branch is correct — but the badge comes from the helper. The non-draft branch must not
assume `open`.

### Success Criteria:

#### Automated Verification:

- `npx astro sync && npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- `/buildings/<id>/resolutions` lists draft, open and decided resolutions together, each with
  the right badge
- Signing out and visiting that URL redirects to `/auth/signin`
- The building page shows the entry point and count, and no longer renders the list
- A building with no resolutions shows the empty state on the new page

---

## Phase 3: The tally panel

### Overview

Put `FR-008` on the resolution page: both sides, what is still uncast, and how far each side is
from the threshold.

### Changes Required:

#### 1. Reading the tally

**File**: `src/pages/buildings/[id]/resolutions/[resolutionId].astro`

**Intent**: Call `resolution_tally` alongside the reads already issued in parallel, and render
the figures. The page renders; it does not decide — the threshold constant lives in SQL only.

**Contract**: Add the RPC to the existing `Promise.all` at `:89-106`. **Keep the vote-row
projection free of `owner_id`** — the aggregate comes from the function, and nothing on this
page may make it possible to render who voted how. The existing head-count read stays: it
answers a different question (are votes landing at all) and its copy already says it decides
nothing.

#### 2. The panel

**File**: same

**Intent**: Replace the bare head-count block with a balance panel, formatted with
`formatShareBps` so the udziały read the same way as everywhere else in the app.

**Contract**: Shows *Za*, *Przeciw*, *Jeszcze nie oddano* as percentages of the building, and
for each side how much it still needs. Once a resolution is decided, the panel states the
outcome rather than the remaining distance. Copy must make clear that *Jeszcze nie oddano*
counts towards the threshold denominator — this is the product's central claim (*silence acts
as a no*, PRD `## Business Logic`) and the amber block already on this page tells administrators
the same thing about owners with no e-mail.

### Success Criteria:

#### Automated Verification:

- `npx astro sync && npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- On a part-voted resolution the three figures sum to 100,00% and the missing figures are
  arithmetically right
- After the threshold is crossed the panel shows the outcome and the badge agrees with it
- The vote page HTML contains no owner-to-choice mapping (check the response, not the screen)

---

## Phase 4: The owner's link after the decision

### Overview

Close the defect this slice would otherwise introduce: dead `Za` / `Przeciw` buttons on a
decided resolution.

### Changes Required:

#### 1. The voting page reads the status

**File**: `src/pages/vote/[token].astro`

**Intent**: Today the page branches only on whether the reader has voted, which was right while
`open` was the only status a resolved token could carry. After Phase 1, an owner who never voted
sees live buttons on a decided resolution and pressing one does nothing at all — `cast_vote`
finds no `open` resolution, returns zero rows, and the endpoint correctly redirects back with no
error. A silent no-op loop.

**Contract**: When `resolution_status` is `passed` or `rejected`, render the outcome — *Uchwała
została podjęta* / *Uchwała upadła* — together with the reader's own receipt if they cast one,
and **no** choice buttons and no confirm step. When it is `open`, behaviour is unchanged. The
three response headers stay where they are, set **before** the token resolves. Do not touch
`src/pages/api/vote/[token].ts`: its neutral answer to a late vote is the error model, not a
gap.

### Success Criteria:

#### Automated Verification:

- `npx astro sync && npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- An owner who never voted opens their link on a decided resolution: sees the outcome, no
  buttons
- An owner who did vote sees the outcome **and** their own receipt
- An unknown token still renders the neutral page, byte-identical in shape to before
- **Production migration applied by hand (`npx supabase db push`) BEFORE the code is deployed**
- After deploy, `/api/health` returns `200`, and a real resolution on production shows its
  tally

---

## Testing Strategy

There is no test runner in this repository and this plan does not add one. Verification is the
manual matrix below, run against the local stack.

### Manual Testing Steps:

1. On the local stack, open a resolution with a registry whose shares total 10000.
2. Cast votes from individual links, watching `resolution_tally` after each: the three figures
   must always sum to 10000.
3. Cross 50% with `za`. Confirm: status `passed`, `decided_at` set, badge changed on both
   administrator screens.
4. Attempt a further vote from an unused link. Confirm: neutral page, no new row in
   `public.votes`.
5. Repeat 1–4 with `przeciw` for `rejected`.
6. Boundary: construct a registry where one owner holds exactly 5000 bps. Confirm that owner's
   vote alone does **not** decide the resolution — `5000 * 2 > 10000` is false, and *more than
   half* is the rule.
7. Attempt `passed → open` directly through PostgREST. Confirm `EM007`.
8. Open a decided resolution's link as an owner who never voted, and as one who did.

### Concurrency check:

Two votes committing simultaneously on the same resolution, both needed to cross the threshold.
Without the row lock the resolution stays `open`; with it, exactly one transaction performs the
flip. Exercise by opening two transactions against the local database and interleaving them by
hand.

## Migration Notes

Forward-only, one transaction, applied by hand. `npx supabase migration up` locally — **never
`db reset`**, which would destroy the hand-made local test state — then `npm run db:types`
committed alongside. Production is `npx supabase db push` from a linked checkout, run **before**
the code that reads the new statuses is deployed. `wrangler rollback` reverts code, never
schema.

## References

- Research: `context/changes/live-tally-and-outcome/research.md`
- Roadmap slice: `context/foundation/roadmap.md` §S-05
- PRD: `FR-007`, `FR-008`, `## Business Logic`
- The threshold expression: `supabase/migrations/20260802072737_create_units_and_owners.sql:71-74`
- The reserved status list: `supabase/migrations/20260802181500_create_resolutions_and_voting_links.sql:43-45`
- The transition rule to widen: `…:317-321`
- `cast_vote`'s `open` gate: `supabase/migrations/20260803090500_create_votes.sql:301-306`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Schema — statuses, decided_at, the outcome trigger, the tally read

#### Automated

- [x] 1.1 `npx supabase migration up` applies cleanly against the local stack — f84f3fe
- [x] 1.2 `npm run db:types` regenerates and the diff shows `decided_at` and `resolution_tally` — f84f3fe
- [x] 1.3 `npx astro sync && npm run lint` passes — f84f3fe
- [x] 1.4 `npm run build` passes — f84f3fe

#### Manual

- [x] 1.5 `za` past 50% flips to `passed`, stamps `decided_at`, and a later vote is silently refused — f84f3fe
- [x] 1.6 `przeciw` past 50% flips to `rejected` — f84f3fe
- [x] 1.7 `EM007` still refuses `passed → open` and `open → draft` through PostgREST — f84f3fe
- [x] 1.8 `resolution_tally` figures sum to 10000 on a part-voted resolution — f84f3fe

### Phase 2: The resolutions route and the four-status badge

#### Automated

- [x] 2.1 `npx astro sync && npm run lint` passes
- [x] 2.2 `npm run build` passes

#### Manual

- [x] 2.3 `/buildings/<id>/resolutions` lists all four states with correct badges
- [x] 2.4 Signed-out visit to that route redirects to `/auth/signin`
- [x] 2.5 Building page shows entry point + count, no list
- [x] 2.6 A building with no resolutions shows the empty state

### Phase 3: The tally panel

#### Automated

- [ ] 3.1 `npx astro sync && npm run lint` passes
- [ ] 3.2 `npm run build` passes

#### Manual

- [ ] 3.3 Three figures sum to 100,00% and the missing figures are arithmetically right
- [ ] 3.4 After the threshold is crossed the panel states the outcome and agrees with the badge
- [ ] 3.5 The response HTML contains no owner-to-choice mapping

### Phase 4: The owner's link after the decision

#### Automated

- [ ] 4.1 `npx astro sync && npm run lint` passes
- [ ] 4.2 `npm run build` passes

#### Manual

- [ ] 4.3 An owner who never voted sees the outcome and no buttons
- [ ] 4.4 An owner who voted sees the outcome and their own receipt
- [ ] 4.5 An unknown token still renders the neutral page unchanged
- [ ] 4.6 Production migration applied by hand BEFORE the code is deployed
- [ ] 4.7 `/api/health` returns 200 after deploy and a production resolution shows its tally
