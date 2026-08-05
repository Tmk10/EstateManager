# Audit trail of a settled uchwała (S-06) — Plan Brief

> Full plan: `context/changes/finished-votes-archive/plan.md`

## What & Why

An administrator opens a settled uchwała and reconstructs **which udziały produced the result** —
who voted, at what weight, in what order, and whose silence counted as a no. PRD `FR-009` and the
durable guardrail *"każdy głos jest policzalny i ma ustalony ślad"* require the outcome to be
reproducible at any time; today the data satisfies that and nothing displays it.

## Starting Point

`S-03` made `public.votes` store the owner, the choice, the moment, and the weight *as of that
moment*, and `EM010` refuses every update and delete — so the trail is already complete and
immutable. `votes_select_authenticated` is `using (true)` with no column revoke, so an
administrator can already read it. What exists is a refusal to display it: the resolution page
reads votes with `head: true` (count only), and three separate comments record that per-owner
attribution is "S-06's question, and until it is answered the answer is no."

## Desired End State

A `passed` or `rejected` uchwała shows, below the existing *Bilans udziałów*: **Jak zagłosowano** —
one row per vote, oldest first, with właściciel, lokale, udział, Za/Przeciw and when; **Kto nie
oddał głosu** — the owners with no vote and their udziały, labelled as counting toward the
threshold; and a reconciliation line closing at 100,00%. A `draft` or `open` uchwała is unchanged,
and `/vote/<token>` is untouched.

## Key Decisions Made

| Decision | Choice | Why |
| --- | --- | --- |
| Trail depth | Per-owner, named | The owner is already the unit of voting — one link, one summed weight; the page lists every owner with name, lokale and udział today, so this adds two columns rather than a new model. |
| When shown | Settled uchwały only | FR-009 is scoped to *zakończone*; a settled result describes a fact, not a race in progress. |
| Non-voters | Own block, named, with udziały | Without them the figures do not close at 100,00% and the result is not reconstructable — silence is what the threshold counted. |
| Placement | Section on the existing resolution page | The uchwała, the balance and the per-owner table already live there; no new route, no new auth surface. |
| Read path | Parallel selects + pure assembler in `src/lib/` | Matches the shape the page documents at `:126`; a dependency-free pure function is what Vitest can drive test-first. |
| Ordering | Chronological, cast order | "Odtworzyć, które udziały złożyły się na wynik" is a narrative — this shows the vote that crossed the threshold. |
| Tests | Vitest on the assembler only | It is the one piece with real logic and no I/O; pgTAP contract tests belong to test-plan §3 Phase 2 and could only be written after the fact here. |
| Migration | None | `votes_select_authenticated` is already `using (true)` — no new privilege is needed, so none is created. |

## Scope

**In scope:** a pure trail assembler in `src/lib/` with its Vitest suite; the votes read and trail
section on `/buildings/<id>/resolutions/<resolutionId>`; correcting the three comments that record
the superseded decision; verification against the two irreproducible local fixtures; roadmap and
CLAUDE.md updates.

**Out of scope:** any migration; anything on `/vote/<token>` (an owner still never learns another
owner's vote); anything on a `draft` or `open` uchwała; CSV/print export; a separate archive route;
pgTAP tests; per-lokal attribution.

## Architecture / Approach

All arithmetic lives in one dependency-free pure function, `src/lib/resolution-trail.ts`, taking
plain arrays (owners, units, votes) and returning plain data (cast rows sorted by time, non-voters,
totals). The page does no folding, summing or sorting — it renders. That is what makes the slice
TDD'able, and it follows `shares.ts` and `units-csv.ts`, which are dependency-free for the same
reason. The reconciliation is computed from the assembler's own rows rather than copied from
`resolution_tally`, so a missing or double-counted owner shows up as a discrepancy instead of being
smoothed over.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. The trail assembler (test-first) | `src/lib/resolution-trail.ts` + the project's first domain test | Reading the live registry instead of the vote's snapshot — the two agree today, so a wrong implementation passes every manual check |
| 2. The read and the trail section | The votes projection, the rendered trail, and three corrected comments | Scope creep into a migration, or the trail leaking onto an open uchwała |
| 3. Verification and records | Walkthrough against `7/2026` and `6/2026`; roadmap + CLAUDE.md updated | The fixtures are irreproducible — `EM007` and `EM010` mean a botched check cannot be re-run from a clean state |

**Prerequisites:** `S-05` (done); local Supabase stack up with the two decided fixtures; Node
22.14.0.
**Estimated effort:** ~1 session across 3 phases. No production migration, so nothing has to land
before the code.

## Open Risks & Assumptions

- **The snapshot-vs-registry trap is invisible today.** `votes.share_bps` and a live sum of the
  owner's units agree in v1, so only the Phase 1 test distinguishes a correct implementation from a
  wrong one.
- **This is the first place in the app tying a named person to a choice.** The boundary that still
  holds — owners never see it, and no open uchwała shows it — is now enforced by page logic alone,
  not by the schema.
- **The fixtures cannot be remade.** Verification has one clean shot per uchwała.
- **A green `npm test` after this slice means the assembler is correct, not that the trail is
  authorised correctly.** Database-side access stays unasserted; test-plan §2's eight risks remain
  uncovered.

## Success Criteria (Summary)

- An administrator opening a settled uchwała can name every owner whose udziały produced the
  result, and the figures close at 100,00%.
- A `draft` or `open` uchwała, and every owner-facing page, are unchanged.
- The project's first domain test exists and fails if the trail stops reconciling.
