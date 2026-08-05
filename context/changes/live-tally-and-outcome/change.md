---
change_id: live-tally-and-outcome
title: Live tally and outcome
status: implementing
created: 2026-08-04
updated: 2026-08-04
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
