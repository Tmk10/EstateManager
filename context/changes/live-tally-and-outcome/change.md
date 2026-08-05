---
change_id: live-tally-and-outcome
title: Live tally and outcome
status: implementing
created: 2026-08-04
updated: 2026-08-05
archived_at: null
---

## Notes

### The lock has to be taken BEFORE the insert, and the first version got it wrong

Found by testing, on 2026-08-05, before Phase 1 was committed. The plan called for a row lock
on the resolution inside the `after insert` trigger, to stop two simultaneous votes each
reading a pre-threshold total. That serialises correctly — and **deadlocks**.

`public.votes` carries a composite foreign key to `public.resolutions`, so every insert takes
`FOR KEY SHARE` on the parent row on its way in. Two concurrent voters both acquire it (they
are compatible), and then each after-trigger asks for `FOR UPDATE` and waits for the other:

```
tx A: insert -> FK KEY SHARE          tx B: insert -> FK KEY SHARE
tx A: AFTER trigger wants FOR UPDATE  tx B: AFTER trigger wants FOR UPDATE
      waits on B's KEY SHARE                waits on A's KEY SHARE   -> 40P01
```

Reproduced against the local stack **on the first attempt** with two unstaggered sessions
(`deadlock detected`, processes waiting on each other's transaction). The loser's vote is not
recorded and the endpoint shows them *"Nie udało się zapisać głosu"* — an owner turned away
for having pressed at the same moment as a neighbour.

The fix is lock **order**, not lock strength: `votes_lock_resolution`, a `before insert`
trigger, takes `FOR UPDATE` first, so the FK's `KEY SHARE` is always acquired second by the
same transaction. After the fix: 12 unstaggered runs, no deadlock; a second session still
blocks — now inside `lock_resolution_for_outcome` — and proceeds once the first commits.

**Do not move the lock back into the after-trigger.** It will look like removing a redundant
trigger.

### Phase 1 verification, run against the local stack (all rolled back)

The hand-made local state was never modified — every check ran inside a transaction that was
rolled back, and the four resolutions are still `open` with `decided_at` null.

| Check | Result |
| --- | --- |
| Exact half: 2501 + 2499 = 5000 `za` | stays `open` — `5000 * 2 > 10000` is false |
| One more vote: 7500 `za` | `passed`, `decided_at` set |
| Late vote on a decided resolution | zero rows, vote count unchanged (3 → 3) |
| Owner with no units (Ewa Testowa) | zero rows, nothing written |
| `EM007` `passed → open` | refused |
| `EM007` `open → draft` | refused |
| `EM006` content edit on a `passed` resolution | refused |
| Against side: 5000 stays open, 7499 crosses | `rejected`, `decided_at` set |
| `decided_at` set on an `open` resolution | refused by `resolutions_decided_at_matches_status` |
| `resolution_tally` with no votes | 0 / 0 / 10000, missing 5001 each |

The exact-half case is the one worth keeping: PRD `FR-007` says *przekroczy* — more than half,
not half — and the local registry happens to hold owners at 2501 and 2499 bps, which sums to
exactly 5000 and proves the boundary rather than approximating it.

### Phase 4: the defect this slice would have shipped

`src/pages/vote/[token].astro` branched only on whether the reader had voted. That was right
while `open` was the only status a resolved token could carry. After Phase 1 it stopped being
right: an owner who never voted, opening their link on a settled uchwała, would have seen live
`Za` / `Przeciw` buttons, pressed one, and got **nothing** — `cast_vote` refuses a resolution
that is not open, returns zero rows, and the endpoint redirects back with no `?error=`. A
silent loop, forever.

The fix is in the page, and deliberately **not** in the endpoint. `/api/vote/[token]` must go
on answering a late vote exactly as it answers an unknown token; naming the failure there would
tell a caller that their token resolves. So the page reads `resolution_status` — already in
`resolve_voting_link`'s return list, nothing widened — and renders the outcome instead of the
buttons.

Ordering matters in the state machine: the decided check sits **before** `pendingChoice`, so a
link opened with a stale `?wybor=za` still lands on the outcome rather than on a confirm screen
for a vote that can no longer be cast.

Verified locally across every state:

| Link | Renders |
| --- | --- |
| Never voted, uchwała `passed` | outcome, **no buttons**, "głosowanie jest już zamknięte" |
| Same, with a stale `?wybor=za` | outcome — confirm screen not reached |
| Voted, uchwała `passed` | outcome **and** own receipt |
| Voted, uchwała `rejected` | outcome and own receipt |
| Uchwała still `open` | buttons, no outcome — unchanged |
| Unknown token | neutral page, nothing |

And the property that had to survive: a passed hit, an open hit and a miss all answer `200`
with byte-identical `Cache-Control`, `X-Robots-Tag` and `Referrer-Policy`. The settled page
carries no token anywhere, because it has no form to post — one fewer place it can appear than
an open one.

### The local test fixture now carries two decided uchwały — deliberately, and irreversibly

2026-08-05, with the user's agreement. Verifying the decided state needed a decided
resolution, and one cannot be made and unmade: `EM007` refuses `passed → open`, `EM010`
refuses deleting a vote. So two of the four local resolutions were settled **through the
application**, by posting to `/api/vote/<token>` — not by writing status directly:

| Uchwała | Cast | Result |
| --- | --- | --- |
| `7/2026` | Tomek 2501 + Anna 2500 `za` | `passed` at **5001 bps** — the narrowest possible crossing, 50,01% against 49,99% uncast |
| `6/2026` | Piotr 2500 + Anna 2500 + Maria 2499 `przeciw` | `rejected` at 7499 bps |

`1/2026` and `2/2026` stay open. The two decided ones are worth more as fixtures than they
were as spares: `S-06` needs exactly this, and `7/2026` in particular pins the boundary — a
resolution that passed by a single basis point.

### Phase 3: the page renders the balance and computes none of it

`resolution_tally` is called alongside the four reads already in flight, and the panel prints
what it returns. No `sum * 2 > 10000` exists in TypeScript, which is the whole point of the
verification decision taken at planning time: one implementation of the rule, in SQL.

Two copy decisions worth keeping:

- A running uchwała is asked *how much further*; a decided one is not. Showing a distance
  beside a settled result would invite the reading that it might still move — it cannot,
  because `cast_vote` refuses every later vote.
- The panel says outright that uncast udziały count towards the threshold and *"działają w
  skutku jak głos przeciw"*. That is the product's central claim (PRD `## Business Logic`) and
  the number an administrator would otherwise misread as neutral.

Also: `Głosowanie otwarte od …` is a claim about now and stops being true once the vote is
settled, so a decided resolution says `Głosowanie otwarto …` in the past tense.

Verified against the local stack: figures matched `resolution_tally` exactly on a part-voted
uchwała (33,34 / 33,33 / 33,33, missing 16,67 and 16,68), both outcome sentences render, the
badges agree with the panel, and the response HTML carries no vote-to-owner mapping — the page
never reads a vote row joined to an owner, only counts and sums.

### Phase 2: `open` stopped being green

Not in the plan, and worth knowing before someone "restores" it. Before this slice `open` was
the only non-draft status, so its badge was green and green just meant *live*. With four
statuses green has to mean **Podjęta**, and an open vote a shade away from a passed one is the
single most expensive confusion this screen could produce. So: `draft` neutral, `open` sky,
`passed` green, `rejected` rose — the last deliberately not styled as an error, because an
uchwała that falls is the ordinary outcome for roughly 85% of them.

`describeResolutionStatus` takes `string`, not the union, because that is what a database read
hands over, and its fallback says *Nieznany status* rather than guessing. Falling back to
`open` would be the dangerous default: it would report an unknown state as one still accepting
votes. The lookup uses `Object.hasOwn` rather than `in` — with `in`, a status of `toString`
indexes onto a function and reports as known. Both cases are covered by the check below.

**Phase 2 verification** (dev server against the local stack):

| Check | Result |
| --- | --- |
| Signed-out `GET /buildings/<id>/resolutions` | `302` → `/auth/signin`, with **no** `PROTECTED_ROUTES` entry added — `/buildings` is matched with `startsWith` |
| Signed-in list | `200`, four `Głosowanie otwarte` badges for the four open uchwały |
| Building page | entry point present, list and `Nowa uchwała` gone |
| Empty state | `200` on a throwaway building, "Ten budynek nie ma jeszcze żadnej uchwały" (building deleted afterwards; counts back to 1 / 4 / 2) |
| `describeResolutionStatus` over all four statuses + `wat`, `toString`, `__proto__` | correct labels; all three unknowns → *Nieznany status* |

The `Podjęta` / `Upadła` badges are verified at the helper, not end to end, because **no decided
resolution exists yet and one cannot be made and unmade** — `EM007` refuses `passed → open` and
`EM010` refuses deleting a vote, so manufacturing one would leave permanent junk in the local
database. They render through the identical code path as the other two; the end-to-end sighting
happens in Phase 3, where real votes cross the threshold.

### RESOLVED 2026-08-05: was blocked on S-04, which landed

Kept because **the shared local database will do this again** the next time two slices touch
the schema in parallel.

On 2026-08-04 this branch could not apply its own migration. `S-04`
(`voting-link-email-fanout`) was being built at the same time in another worktree, and both
share one local Supabase stack. S-04 had already applied
`20260804212500_voting_links_send_state.sql` locally, which broke two things here:

1. `npx supabase migration up` refused — the local migration history carried a version this
   branch's directory did not have. **Do not run the `migration repair --status reverted`
   the CLI suggests in that situation**: it marks the other slice's migration reverted while
   its columns, index and function still exist, corrupting the other worktree.
2. `npm run db:types` regenerates from that shared database, so `database.types.ts` here would
   have carried S-04's `voting_links` send-state columns and `unsent_voting_links()` — types
   for a schema this branch does not create.

Resolved by waiting: S-04 merged (PRs #29, #30), this branch fast-forwarded onto `main` at
`9a18cf0`, and both commands then ran clean. The two slices never collided on schema — S-04
touches `public.voting_links`, S-05 touches `public.resolutions` and `public.votes` — and this
migration's timestamp (`213630`) is later than S-04's (`212500`), so the ordering on `main`
came out right without a rename.

The roadmap marks S-04 and S-05 `Parallel with` each other. That is true of the code and false
of the local database; the parallelism costs a rebase, not a redesign.
