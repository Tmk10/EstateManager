# S-05: Live share tally and resolution outcome — Plan Brief

> Full plan: `context/changes/live-tally-and-outcome/plan.md`
> Research: `context/changes/live-tally-and-outcome/research.md`

## What & Why

An administrator can watch a resolution's share balance move and see exactly how much either
side still needs, and the resolution decides itself the moment one side passes half the
building. This is the point where the product's central claim stops being a vote-recording
exercise and becomes an answer: *czy uchwała przeszła*. It is the one rule the roadmap says must
be provably correct, because the threshold counts **all** shares in the building rather than the
shares cast — which is why silence acts as a no, and why ~85% of matters fail today.

## Starting Point

`S-03` shipped a complete vote path and an empty outcome path. Votes are stored with their
weight snapshotted; `resolutions.status` knows only `draft` and `open`; the administrator sees a
head-count of voters with copy stating plainly that it decides nothing. The resolutions list is
a section inside the building page. Research found that S-02 and S-03 had already reserved the
space for this slice — three migration comments name S-05 and describe what it will do.

## Desired End State

`/buildings/<id>/resolutions` carries every resolution of a building, running and finished
together, each with a badge distinguishing four states. Opening one shows the balance: shares
for, against, not yet cast, and how far each side is from the threshold. When a vote crosses it,
the status changes in the same transaction as that vote, `decided_at` is stamped, and every
later vote is refused. An owner opening their link afterwards reads the outcome and their own
receipt.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Denominator of the threshold | Constant `10000` | `units.share_bps` totals exactly 10000 per building, asserted by `EM003`; `sum * 2 > 10000` is exact integer arithmetic | Research |
| Outcome storage | Stored on `resolutions.status` | `FR-007` says *zostaje oznaczona*; storing it also makes `cast_vote`'s existing `status = 'open'` gate close voting for free | Research |
| Where the flip happens | `after insert` trigger on `public.votes` | Binds any future writer of votes, not just `cast_vote`; the freeze trigger's comment already predicts the visit | Plan |
| Concurrent votes | Row lock on the resolution before summing | Without it two simultaneous votes can both read a sub-threshold total and neither flips | Research |
| Deciding moment | `decided_at`, database clock | Same clock as `votes.created_at`; settles the open `opened_at` question by never differencing the two | Plan |
| Threshold rule location | SQL only — no TypeScript mirror | One implementation of the rule; screens read `resolution_tally` rather than recompute | Plan |
| Administrator's view | Both sides + distance to threshold | `FR-008` literally; lets an administrator chase specific missing votes | Plan |
| Resolution list | One list, own route, all statuses | *Zakończona* is a state of a resolution, not a different thing | Roadmap (2026-08-03) |
| Building page | Link + count only | Smallest footprint for `S-09` to rework into a module tile | Plan |
| Owner's link after decision | Outcome + own receipt | The outcome is a fact about their community, not another owner's vote | Plan |

## Scope

**In scope:** status widening to four states; `decided_at`; the outcome trigger; the tally read
function; `/buildings/<id>/resolutions`; a shared status badge; the tally panel; the owner's
page after a decision.

**Out of scope:** administrator notification; who-voted-how (`S-06`); e-mail fanout (`S-04`);
any deadline or countdown; changes to `/api/vote/[token]`'s error model; re-scoping
`votes_select_authenticated`.

## Architecture / Approach

```
cast_vote (definer)  →  insert into votes  →  [after insert trigger]
                                                 ├─ lock the resolution row
                                                 ├─ sum share_bps by choice
                                                 └─ status → passed / rejected + decided_at
                                                        ↓
                                       cast_vote's `status = 'open'` gate now closes
                                       every later vote onto the existing neutral path

pages  →  resolution_tally(uuid)  →  render only; the threshold constant never leaves SQL
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Schema | The migration: four statuses, `decided_at`, the outcome trigger, the tally read | The concurrency window — the lock has to be taken before summing, not after |
| 2. Route & badge | `/buildings/<id>/resolutions`, shared status helper, building page reduced to a link | Three call sites render the badge; missing one makes a decided resolution look open |
| 3. Tally panel | `FR-008` on the resolution page | Copy must not let *jeszcze nie oddano* read as neutral — it counts as a no |
| 4. Owner's link | The outcome instead of dead buttons | Touching the endpoint instead of the page would break the neutral error model |

**Prerequisites:** local Supabase stack up and migrated (`migration up`, **not** `db reset` —
the local data is hand-made test state); `S-03` shipped.
**Estimated effort:** ~2 sessions across 4 phases; phase 1 carries most of the weight.

## Open Risks & Assumptions

- **No test runner.** The threshold rule is verified by hand against the local stack, including
  a deliberate boundary case at exactly 5000 bps. Nothing re-runs it later.
- **Concurrency is verified by hand-interleaved transactions**, not by an automated race test.
- **`votes_select_authenticated` is `using (true)`.** After this slice every administrator
  account can read every building's tally. `Block: no` for one account; a hard prerequisite for
  a second.
- **Migrations are applied manually and forward-only.** The production apply has to precede the
  deploy, and nothing in CI enforces the order.

## Success Criteria (Summary)

- An administrator sees, on one page, how many shares are for, against and still silent — and
  how much either side needs to end it.
- A resolution becomes *Podjęta* or *Upadła* by itself, at the vote that crosses the threshold,
  with no screen involved.
- An owner opening their link after the decision reads the result rather than pressing buttons
  that do nothing.
