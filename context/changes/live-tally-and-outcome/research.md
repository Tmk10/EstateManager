---
date: 2026-08-04T21:21:23+02:00
researcher: Tomek Kościelniak
git_commit: 94517a7747dc050af046352303a6e6a21db15bd7
branch: feat/live-tally-and-outcome
repository: EstateManager
topic: "S-05 — live share tally, 50% threshold and automatic resolution outcome"
tags: [research, codebase, votes, resolutions, threshold, rls, tally]
status: complete
last_updated: 2026-08-04
last_updated_by: Tomek Kościelniak
---

# Research: S-05 — live share tally, 50% threshold and automatic resolution outcome

**Date**: 2026-08-04T21:21:23+02:00
**Researcher**: Tomek Kościelniak
**Git Commit**: `94517a7747dc050af046352303a6e6a21db15bd7`
**Branch**: `feat/live-tally-and-outcome`
**Repository**: EstateManager

## Research Question

What does `S-05: live-tally-and-outcome` have to touch? The administrator must see a live
share balance and the distance to the threshold (`FR-008`), and a resolution must become
**podjęta** when `za` shares exceed 50% of *all* shares in the building, or **upadła** when
`przeciw` shares do (`FR-007`) — on one shared resolution list under its own route.

## Summary

**S-05 is mostly already designed; it was designed by S-02 and S-03 and left as reserved
space.** Three separate migration comments name S-05 by hand and say what it will do. The
research did not have to choose an architecture so much as recover one and find the places
where the reserved space is not quite big enough.

Six findings that change what the plan has to say:

1. **The denominator is a constant, not a query.** Every building's `units.share_bps` totals
   exactly `10000`, asserted by a deferred constraint trigger (`EM003`), so the threshold
   comparison is `sum_for * 2 > 10000` in integers. Both migrations that care already
   prescribe that exact expression verbatim. The roadmap's "S-05 reads from two sources"
   is true but cheap: the tally sums the vote snapshots, the denominator is `TOTAL_BPS`.
2. **The outcome should be stored, not derived**, and the schema was pre-shaped for it —
   `resolutions_status_known`'s comment literally says *"S-05 widens this list with 'passed'
   and 'rejected'"*, and the freeze trigger's comment says *"S-05's outcome flip will pass
   through here"*.
3. **Storing it closes voting for free.** `cast_vote` gates on `r.status = 'open'`, so the
   moment the status leaves `open` every further vote falls onto the existing zero-row
   neutral path. No new refusal, no new error code, no new branch in the token space.
4. **A concurrency hole has to be closed deliberately.** Two votes committing at once can
   both read a pre-threshold sum under `READ COMMITTED` and neither will flip the status.
   The fix is a row lock on the resolution inside the trigger. This is the one genuinely new
   correctness problem in the slice.
5. **S-05 breaks the voting page unless it also fixes it.** After a resolution is decided, an
   owner who never voted still gets the full `Za` / `Przeciw` UI, and pressing either does
   nothing at all — silently. `src/pages/vote/[token].astro` never reads `resolution_status`,
   which was harmless while `open` was the only non-draft status.
6. **No `PROTECTED_ROUTES` change is needed.** The roadmap budgets "one file and one entry";
   the entry is already there — `/buildings` is matched with `startsWith`.

## Detailed Findings

### The threshold rule, and why the denominator is settled

`public.units.share_bps` is integer basis points, and the invariant is asserted rather than
intended (`supabase/migrations/20260802072737_create_units_and_owners.sql:71-74`):

> Hundredths of a percent. The S-05 threshold rule compares sums, and integer arithmetic is
> the only representation of that comparison that cannot drift: `sum_for * 2 > 10000` is
> exact, `sum_for_percent * 2 > 100.0` is not. Every building's units total exactly 10000 —
> asserted below, not merely intended.

The assertion is `public.assert_building_registry(uuid)`, raising `EM003` when a building's
shares do not total `10000`
(`supabase/migrations/20260802101500_registry_assertion_security_definer.sql:80-83`), fired by
the **deferred** constraint trigger `units_registry_check`. `src/lib/shares.ts:10-14` states
the same rule from the other end and gives the reason the total must be exact: *"the
threshold comparison is `sum_for * 2 > total`, and a total that drifts moves the bar under a
vote that has already been cast."*

So the rule is:

| Outcome | Condition |
| --- | --- |
| `passed` (podjęta) | `sum(share_bps) filter (choice = 'for') * 2 > 10000` |
| `rejected` (upadła) | `sum(share_bps) filter (choice = 'against') * 2 > 10000` |
| `open` (w toku) | neither |

The two conditions cannot both hold. Each owner votes at most once
(`votes_resolution_owner_key`) at their summed weight, and all owners' weights total `10000`,
so `sum_for + sum_against <= 10000` and both cannot exceed half of it.

**On the "two sources" note in the roadmap.** The tally sums `votes.share_bps` — the snapshot,
authoritative by `comment on table public.votes` — while the denominator comes from the
registry. They agree by construction in v1 because the registry cannot move
(`import_building_units` raises `EM002` on re-import, no edit screen exists). The distinction
only starts paying rent when udziały become editable, and the code should read `TOTAL_BPS`
from `src/lib/shares.ts` / the literal `10000` in SQL rather than re-summing `units`, because
re-summing invites someone to "improve" it into summing only the units that voted.

### The status widening, and everything that already handles it

`resolutions.status` is `text` + check constraint, chosen for this exact moment
(`supabase/migrations/20260802181500_create_resolutions_and_voting_links.sql:43-47`):

> Text plus a check constraint rather than an enum. **S-05 widens this list with 'passed' and
> 'rejected'**, and widening a check constraint is ordinary DDL inside this migration.

What S-05 must change — only two things:

- `resolutions_status_known` — `check (status in ('draft', 'open'))` → add `'passed'`,
  `'rejected'` (`:62`).
- `public.assert_resolution_frozen` — `EM007` currently refuses every transition except
  `draft → open` (`:317-321`). It must also permit `open → passed` and `open → rejected`,
  and must keep refusing everything else, in particular `passed → open`, `rejected → open`
  and `passed → rejected`. The function's own header already anticipates the visit
  (`:292-293`): *"Fires on every update of public.resolutions, so it also guards paths that do
  not exist yet — S-05's outcome flip will pass through here."*

What needs **no** change, verified condition by condition:

| Existing guard | Why it already covers `passed` / `rejected` |
| --- | --- |
| `resolutions_opened_at_matches_status` (`:64-66`) | Keyed on `status = 'draft'` vs `status <> 'draft'`, so a decided resolution keeps its non-null `opened_at`. |
| `EM006` content freeze (`:304-312`) | Keyed on `old.status <> 'draft'`. |
| `EM009` no delete of a non-draft resolution (`20260803090000:104-107`) | Same key. |
| `EM012` / `EM013` no link issue or delete outside draft (`20260803090000:175-186`, `:225-229`) | Same key. |
| `EM010` vote immutability | Unconditional. |
| `public.resolve_voting_link` (`20260803090500:427`) | Filters `r.status <> 'draft'`, so an owner's link keeps resolving after the outcome — and the function already **returns `resolution_status`**, so the voting page can render the outcome with no schema change. |

**And one that changes behaviour for free**: `public.cast_vote` joins
`... and r.status = 'open'` (`20260803090500:301-306`). The instant the status leaves `open`,
a late vote takes the `if not found then return; end if` path — the same zero-row answer an
unknown token gets. Voting closes automatically, on the existing neutral path, without
widening the token space by a single observable branch. This is the strongest argument for
storing the outcome rather than deriving it at read time.

### Who writes the outcome — and the concurrency hole

The write has to happen in the same transaction as the vote that crosses the threshold;
otherwise "sama zostaje podjęta" depends on someone loading a page. Three candidates:

1. **`after insert` trigger on `public.votes`** — recomputes the two sums for the resolution
   and updates `public.resolutions.status`. Runs inside `cast_vote`'s transaction. Keeps
   `cast_vote` about casting a vote, and binds any future writer of `votes` as well. Passes
   through `assert_resolution_frozen`, exactly as that function's comment predicts.
2. **Inline in `cast_vote`** — same transactional guarantee, but couples the single write door
   to the outcome rule and leaves a future second writer unbound.
3. **Derived at read time** — contradicts `FR-007`'s wording (*"zostaje oznaczona"*), gives
   `S-06` no recorded moment to show, and forfeits the free voting-close above, since
   `cast_vote` would still see `status = 'open'` forever.

Recommendation: **(1)**.

**The hole.** Under `READ COMMITTED`, two owners committing simultaneously each insert their
own vote and then sum. Neither transaction sees the other's uncommitted row, so both can
compute a sum below the threshold when the two together cross it — and the resolution stays
`open` with a majority already cast. Nothing in the current schema prevents this;
`votes_resolution_owner_key` serialises a *single owner*, not a resolution.

The fix is to serialise per resolution inside the trigger, by taking a row lock before
summing:

```sql
perform 1 from public.resolutions r where r.id = new.resolution_id for update;
```

The trigger updates that row anyway on the deciding vote, so the lock is on the row it was
going to touch. Contention is one building's voters on one resolution — at 70 lokale, nothing.
`context/foundation/infrastructure.md` §D9 (no long-lived connections from the runtime) is
what makes this a database-side problem rather than something the Worker could coordinate.

### `opened_at` vs `decided_at`: the clock question, resolvable by not asking it

Carried forward from S-02 and still flagged open in the roadmap.
`resolutions.opened_at` is written from the **Worker's** clock —
`src/pages/api/buildings/[id]/resolutions/[resolutionId]/open.ts:130` posts
`new Date().toISOString()`, because supabase-js sends values, not SQL expressions.
`votes.created_at` is the **database's** `now()`, and the votes migration says so explicitly
(`20260803090500:59-62`): *"S-05 must not difference the two without deciding that first."*

S-05 does not need to difference them. The slice displays no duration — `FR-007` gives voting
no end date, so there is no countdown and no elapsed time to render. The resolution:

- If a `decided_at` column is added, it is written by the **trigger**, i.e. the database
  clock, putting it on the same clock as `votes.created_at` — the value it is most likely to
  ever be compared against (e.g. S-06 showing the deciding vote).
- `opened_at` and `decided_at` may both be *displayed*; they must not be *subtracted*. Worth a
  `comment on column` so the next reader inherits the constraint rather than the confusion.

### The route, the list, and the four-status badge

**No middleware change.** `src/middleware.ts:26` is
`["/dashboard", "/api/email", "/buildings", "/api/buildings", "/help"]` and matching is
`startsWith` (`:38`), so `/buildings/<id>/resolutions` is protected the moment the file
exists. The roadmap's cost estimate of "one file and one entry in `PROTECTED_ROUTES`" is one
item too generous.

**The list moves out of the building page.** It lives today at
`src/pages/buildings/[id]/index.astro:196-244`, nested inside the `units.length > 0` branch,
fed by the read at `:79-83` (`order("created_at", { ascending: false })`). S-05 moves it to a
new `src/pages/buildings/[id]/resolutions/index.astro` and leaves a shortcut behind; the
roadmap defers the shortcut's exact shape to S-09.

**The status badge is binary in two places and must become four-valued:**

- `src/pages/buildings/[id]/index.astro:222-231` — `item.status === "draft" ? … : …`
- `src/pages/buildings/[id]/resolutions/[resolutionId].astro:183-192` — same shape, via
  `isDraft` at `:145`

Both render "Wersja robocza" or "Głosowanie otwarte" and nothing else, so a `passed` row would
silently claim voting is still open. Two callers of one rule is exactly the condition
`src/lib/resolutions.ts` was created for — its header says the date formatter lives there
*"because they have more than one caller and drift silently if they are copied."* The status
label and badge classes belong in that module.

### Reading the tally without widening what the administrator sees

The resolution page counts voters today with `head: true` and no rows
(`src/pages/buildings/[id]/resolutions/[resolutionId].astro:105`), and the comment above it
(`:99-105`) explains why the rows themselves are refused: a vote row carries the owner and the
choice, and *"neither belongs on this page"* — that is S-06's question.

S-05 needs sums per choice, and the safe projection is `choice, share_bps` **without
`owner_id`**. That yields the tally while keeping it impossible for the page to render who
voted how, preserving the boundary S-03 drew. Summing ~70 rows in memory matches the file's
existing style and its stated reason (`:85-88`: four reads joined in memory rather than a
projection string deep enough to hide a wrong column, since supabase-js does not type-check
`.select()` contents).

`votes_select_authenticated` is `using (true)` (`20260803090500:151-155`), so the read works —
and carries the standing caveat recorded in both S-02 and S-03: every administrator account
reads every building's tally. `Block: no` for one account, hard prerequisite for a second.

### The defect S-05 introduces into the owner's page if it does not fix it

`src/pages/vote/[token].astro` branches on `ownVoteChoice` (`:141`, `:148`) — receipt if they
voted, buttons if they have not. **It never reads `resolution_status`.** That was correct while
`open` was the only status a resolved token could carry.

After S-05, an owner who never voted and opens their link on a decided resolution sees the
full `Za` / `Przeciw` UI. Pressing a button posts to `/api/vote/[token]`, `cast_vote` finds
nothing (`r.status = 'open'` fails), returns zero rows, and the endpoint redirects back to the
same page with no `?error=` (`src/pages/api/vote/[token].ts:78`) — by design, because that is
the neutral path. The owner gets an infinite, silent no-op loop.

The fix is in the page, not the endpoint: when `resolution_status` is `passed` or `rejected`,
render the outcome instead of the buttons. The data is already in the return list. Note the
endpoint's neutral behaviour must **not** be changed — a named error there would tell a caller
that their token resolves.

## Code References

- `supabase/migrations/20260802072737_create_units_and_owners.sql:71-74` — the threshold
  expression, prescribed in integers
- `supabase/migrations/20260802101500_registry_assertion_security_definer.sql:80-83` — `EM003`,
  the assertion that makes `10000` a fact
- `supabase/migrations/20260802181500_create_resolutions_and_voting_links.sql:43-47` — status as
  `text` + check, "S-05 widens this list"
- `…:62` — `resolutions_status_known`, the constraint to widen
- `…:64-66` — `resolutions_opened_at_matches_status`, already correct for the new statuses
- `…:292-293`, `:317-321` — `assert_resolution_frozen` / `EM007`, the transition rule to widen
- `supabase/migrations/20260803090000_harden_voting_links_and_resolutions.sql:104-107`, `:175-186`,
  `:225-229` — `EM009` / `EM012` / `EM013`, all keyed on `<> 'draft'`
- `supabase/migrations/20260803090500_create_votes.sql:57`, `:59-62` — `share_bps` snapshot and
  the clock warning
- `…:301-306` — `cast_vote`'s `r.status = 'open'` gate, which closes voting for free
- `…:379-428` — `resolve_voting_link`, already returning `resolution_status`
- `src/lib/shares.ts:10-14`, `:22` — the rule restated, and `TOTAL_BPS`
- `src/lib/resolutions.ts:1-14` — the module whose stated purpose is shared rules with two callers
- `src/middleware.ts:26`, `:38` — `PROTECTED_ROUTES`, already covering the new route
- `src/pages/buildings/[id]/index.astro:79-83`, `:196-244` — the list to move
- `src/pages/buildings/[id]/resolutions/[resolutionId].astro:99-105`, `:145`, `:183-192` — the
  vote count read and the binary badge
- `src/pages/buildings/[id]/resolutions/[resolutionId]/open.ts:130` — `opened_at` on the Worker clock
- `src/pages/vote/[token].astro:141`, `:148` — the branch that ignores `resolution_status`
- `src/pages/api/vote/[token].ts:66-78` — the neutral error model that must not change

## Architecture Insights

- **Reserved space is a real pattern in this schema.** Three comments name S-05 and describe
  what it will do. The plan's job is to fill the space as described, and to say plainly
  wherever it deviates — a deviation here contradicts a written prediction rather than merely
  surprising a reader.
- **Adding a status is cheaper than adding a rule** because every guard in the schema is keyed
  on `<> 'draft'` rather than on `= 'open'`. That was a choice, and it pays here.
- **The error model is a property to preserve, not a feature to extend.** Every new state must
  fall onto an existing neutral answer. S-05 gets this for free from `cast_vote`; the only
  place it must be actively defended is the voting page, where the fix is to render less, not
  to explain more.
- **The one-write-path discipline continues.** `cast_vote` stays the only writer of `votes`;
  the outcome flip belongs behind a trigger so the rule binds any writer, not just this one.
- **Nothing tests this arithmetic.** There is no test runner (CLAUDE.md). `src/lib/shares.ts`
  is dependency-free specifically so it can be run under `node --experimental-strip-types`; a
  tally module should be written to the same standard — a pure function from
  `{ choice, share_bps }[]` to a tally and an outcome — since this is the one rule the roadmap
  calls *"the only rule in the product that must be provably correct."*

## Historical Context (from prior changes)

- `context/changes/share-weighted-vote/change.md` — `share_bps` on a vote is a snapshot and is
  authoritative; the residual that `votes` write-denial is policies only, with no `revoke`
  behind them.
- `context/changes/resolution-with-voting-links/` — why the administrator sees no token, and
  the column-level `revoke` that enforces it.
- `context/foundation/roadmap.md` §S-05 — the two decisions already taken by the user
  (2026-08-03): **one list, not two**, and **the list gets its own route**.
- `context/foundation/prd.md:194` (`FR-007`), `:203` (`FR-008`), `:262-273` (Business Logic) —
  the outcome rule and its rationale: the threshold counts *all* shares, so silence acts as a
  no, which is the reason ~85% of matters fail today.

## Open Questions

1. **Does the administrator get notified at the moment of decision?** PRD provides for no
   administrator notification; the roadmap marks this `Owner: użytkownik, Block: no`.
   Recommendation: no — seeing it on next visit is what `FR-008` describes.
2. **Does the owner see the outcome on their link?** `resolve_voting_link` already returns
   `resolution_status`, so it costs nothing. This is the same fix as the defect above, and the
   only question is how much it says — "Uchwała została podjęta" is a fact about the
   community, not another owner's vote, so it does not touch S-06's boundary.
3. **Is `decided_at` stored, or is the deciding moment left to S-06 to reconstruct?** Storing
   it is one column and settles the clock question by writing it database-side.
4. **Does the building page keep a resolutions shortcut, and in what shape?** The roadmap
   explicitly defers the shape to S-09; the plan should keep it minimal.
5. **Standing, not this slice:** `votes_select_authenticated` and `voting_links_*_authenticated`
   are `using (true)`. After S-05, any administrator account reads any building's tally. `Block: no`
   for one account; a hard prerequisite for a second.
