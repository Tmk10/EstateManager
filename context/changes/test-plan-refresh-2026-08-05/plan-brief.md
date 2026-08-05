# Test Plan Refresh (2026-08-05) — Plan Brief

> Full plan: `context/changes/test-plan-refresh-2026-08-05/plan.md`

## What & Why

`context/foundation/test-plan.md` scheduled its own refresh for "after roadmap `S-04`
ships." `S-04` shipped 2026-08-04 and `S-05` shipped 2026-08-05, so the plan's two
highest-scored risks — link misdelivery and an uchwała decided against wrong udziały — were
both written as estimates against code that did not exist and now does. This change
re-derives them against what shipped, and fixes two factual defects the document carries:
a rollout status pointing at a change folder that has never existed, and a hot-spot figure
that measures the whole repository while claiming to measure two directories.

## Starting Point

The document lives on `origin/main` at `15ed4af` (PR #34) and **nowhere else** — local
`main` is one commit behind and the current working branch predates it. No test runner
exists: no test script, no Vitest or pgTAP, zero test files. §3 nevertheless records Phase 1
as `change opened` against `context/changes/testing-share-arithmetic/`, a folder present on
no branch. PR #34 knowingly landed that staleness and deferred the correction here.

## Desired End State

The document describes the project as it is: Risk #1 and #2 grounded in shipped code, with
`S-05`'s two *reproduced* failures — a deadlock that silently dropped a vote, and an
administrator able to flip an outcome with no votes behind it — folded into existing rows.
The rollout table says Phase 1 has not started, Phase 1 stops claiming coverage it will not
deliver, and Phase 4 is a retrofit rather than a gate spec for an unbuilt slice. §8 records
what moved and what was deliberately left alone.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Authority over frozen §1–§2 | Re-derive the two risks whose code now exists | §8's own mandate | Plan |
| The registry blocker's rank | **Renumber §2** so it becomes Risk #1 | Nothing downstream is reachable until an administrator can get a budynek and its rejestr in — it gates the rollout, it doesn't just tie on score | User |
| Position vs. number | Renumber rather than reorder-and-keep-labels | No file outside the document cites a risk number, so the sweep is self-contained and the map stays readable without an explanatory note | User |
| `S-05`'s two new failure modes | Fold into #2 and #3, don't append | Keeps the map four-deep and avoids a third out-of-order row | Plan |
| Risk #1 likelihood | Hold at High/High | Four error paths never fired; the definer read is a known v2 hole | Plan |
| Deadlock protection | Assert the lock *ordering* structurally | Racing two sessions is the flakiest test available; a green race proves nothing | Plan |
| Phase 1 scope | Unit-only, narrower goal | The threshold moved into SQL with `S-05`; Phase 2 owns it now | Plan |
| Phase 4 | Rescope to retrofit | Its rationale ("code does not exist yet") is now false | Plan |
| Phase 1 runner | Vitest via `getViteConfig()` | Phase 3 needs a runner reaching Astro; Node's own runner cannot | Plan |
| `CLAUDE.md` hard rule | Leave to Phase 1 | The rule is true until a runner lands | Plan |
| §7 negative space | Unchanged, recorded as a no-op | Its bullet is about the absent roles model, not database guards | Plan |
| CI database for contract tests | Stay flagged, Phase 2 decides | Choosing a CI design before the tests exist is guesswork | Plan |
| Next refresh trigger | Standing conditions only | The scheduled mechanism fired once and worked; no new date invented | Plan |

## Scope

**In scope:** §1 hot-spot method and figures · §2 renumbered so the registry blocker is #1,
with the citation sweep it implies across §2, §3, §5, §7, §8 and the header · §2 Risks #2,
#3, #4 and their response guidance · §3 Phase 1 status, Phase 1 and 2 goals, Phase 4 rescope,
order rationale ·
§4 runner named · §5 three gate cells · §6.1/§6.2 stub wording · §8 ledger, refresh entry,
retired trigger · document header · this change folder's `change.md`.

**Out of scope:** installing a runner · editing `CLAUDE.md` · launching Phase 1 · adding or
removing risk rows (eight before, eight after) · editing §7 beyond its one renumbered
citation · deciding how CI gets a database · any workflow, migration, or source file.

## Architecture / Approach

Three phases ordered so nothing is written before the ground under it is correct. Phase 1
fixes the branch base and the two judgement-free defects. Phase 2 re-derives the risk map,
which depends on Phase 1's corrected scan. Phase 3 propagates outward into §3–§5 and writes
§8 last, because §8 is the record of what the other two phases did — including the two
decisions to change nothing.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Grounding and mechanical corrections | Right branch; §3 status and §1 figure corrected | Branching from the wrong base turns every edit into a silent revert of PR #34 |
| 2. Risk map re-derivation (§2) | Registry blocker renumbered to #1; #2 and #3 rewritten; deadlock and `EM014` folded in | A renumber sweep across six sections has no error mode — a missed citation silently points at the wrong risk. `§1 principle #3` is a decoy any find-and-replace will hit |
| 3. Rollout, stack, gates, ledger | §3–§5 aligned; §8 records the refresh | §3's Status cells are parser literals; prose there breaks the orchestrator silently |

**Prerequisites:** a branch cut from `origin/main` (not local `main`, which is behind); the
`S-04` and `S-05` change records and `CLAUDE.md`'s "Current state" as the evidence base.

**Estimated effort:** one session; three phases over a single markdown file.

## Open Risks & Assumptions

- The branch-base hazard has no error mode. If the implementer branches from local `main`
  or the current working branch, `test-plan.md` is absent and a "new" 269-line file reverts
  PR #34 with no conflict and no warning. Phase 1 gates on a line-count fingerprint.
- §2's forbidden-identifier rule and §3's closed status vocabulary are enforced by
  convention, not by a parser that errors. The structural greps are the only real check.
- Folding the deadlock into Risk #2 rather than giving it a row means the user's named top
  concern is carried by a row that must be read carefully. The plan makes it explicit in
  both the scenario text and the guidance for this reason.
- The renumber changes what every risk label means. Anything written before 2026-08-05 that
  cites a risk number — a conversation, a review comment, a draft — now points at the wrong
  row. Nothing in the repository does (verified), which is why the renumber was affordable,
  but §8 carries the old→new mapping so a human holding an old number can translate.
- `§1 principle #3` is a numbered *principle*, not a risk, and it is the one `#3` in the
  document that must not move. It is the most likely casualty of a careless sweep.
- Phase 4 becomes a retrofit onto a shipped slice — the exact position the original
  ordering was written to avoid. That is recorded as a cost of the refresh, not repaired.

## Success Criteria (Summary)

- A reader who knows only the current codebase finds nothing in the document that
  contradicts it — no unbuilt-slice assumptions, no folder that does not exist, no figure
  that measures something other than its label.
- A phase planner picking up Phase 1 or Phase 2 can tell exactly which half of Risk #2 they
  own, and what mistake to avoid.
- The next refresh does not re-open §7 or the appended-row question, because §8 records why
  both were left alone.
