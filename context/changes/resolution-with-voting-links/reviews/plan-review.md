<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Resolution with Voting Links

- **Plan**: `context/changes/resolution-with-voting-links/plan.md`
- **Mode**: Deep
- **Date**: 2026-08-02
- **Verdict**: REVISE (3 criticals fixed in place the same day; 5 findings left PENDING)
- **Findings**: 3 critical, 4 warnings, 1 observation

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | FAIL    |
| Lean Execution        | WARNING |
| Architectural Fitness | PASS    |
| Blind Spots           | FAIL    |
| Plan Completeness     | WARNING |

The architecture survived review intact — schema shape, the single `definer` door, and the
links-before-status ordering all hold. What failed was the plan's own instrumentation: two
success criteria a _correct_ implementation would fail, and one hole in the safety argument
the plan makes its centrepiece.

## Grounding

8/8 paths ✓, 4/4 symbols ✓ (`PROTECTED_ROUTES`, `formatShareBps`, `cn`, `db:types`),
brief↔plan ✓

## Findings

### F1 — "Token from another building" describes behaviour that cannot exist

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: Desired End State #4; Manual Testing Step 8; Phase 5 §3
- **Detail**: Three places required that a token from another building render the neutral
  not-found page. It will not, and should not: `/vote/<token>` carries no building in the URL
  and `resolve_voting_link` looks up by token alone, so a valid token from any building
  resolves correctly. The criterion described a cross-check the design deliberately does not
  have, and would push an implementer to invent building scoping.
- **Fix**: Replaced all three occurrences with the check that is actually meaningful — a valid
  token resolves to its own resolution and that owner's data only, and no URL manipulation
  widens what one token returns.
- **Decision**: FIXED

### F2 — Batched insert plus "treat 23505 as success" defeated the ordering argument

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 3 §5 — Open the vote
- **Detail**: The whole justification for two queries instead of an RPC is that the ordering
  makes partial failure harmless — then the plan said to treat `23505` on the link insert as
  success. A multi-row insert aborts **entirely** on the first unique violation, so a
  double-clicked button left the losing request having written nothing while still flipping
  the status: an open resolution with a partial link set, the exact failure the ordering
  exists to prevent.
- **Fix**: Insert is now conflict-tolerant at the statement level (`on conflict … do nothing`
  / `upsert` with `ignoreDuplicates`), followed by a re-read comparing link count against
  owner count before the status flips. The residual two-writer race is stated rather than
  papered over.
- **Decision**: FIXED

### F3 — Progress section did not match Success Criteria in Phases 4 and 5

- **Severity**: ❌ CRITICAL (mechanical — `/10x-implement` parses this section)
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: `## Progress`
- **Detail**: Phase 4 listed 5 manual criteria against 4 Progress entries (4.6 merged two);
  Phase 5 listed 3 criteria against 4 entries (5.3 had no source in the criteria list).
- **Fix**: 4.6 split into 4.6/4.7; the migration-before-merge requirement promoted from the
  Phase 5 Contract into its Manual Verification list. Both phases now balance.
- **Decision**: FIXED

### F4 — The per-owner correction stops short of two per-unit statements

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: End-State Alignment
- **Location**: Phase 1 §4
- **Detail**: Phase 1 fixes only the `S-02` **Outcome** line. Verified in the tree, two
  per-unit statements survive: `roadmap.md:49` (slices table row for `S-02` — "dysponuje
  indywidualnym linkiem dla każdego lokalu") and `roadmap.md:174` (the `S-03` outcome —
  "udział jego lokalu jest doliczony do wyniku"). Phase 5 only touches `S-02`'s status and
  dependency row, so neither is reached. `S-03` is the next slice to be planned, and it would
  be planned from a line contradicting the PRD this change just corrected.
- **Fix**: Extend Phase 1 §4 to cover `roadmap.md:49` and the `S-03` outcome at `:174`.
- **Decision**: PENDING

### F5 — Phase 2's manual verification needs tokens that nothing creates until Phase 3

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — Manual Verification
- **Detail**: Four of six checks need an open resolution and a valid token; the screens and
  the token generator arrive in Phase 3. The plan states the checks as runnable and never says
  how the fixtures come into existence — and the token must satisfy `^[A-Za-z0-9_-]{43}$`.
- **Fix A ⭐ Recommended**: Add a fixture step to Phase 2 — a short SQL snippet inserting one
  building/owner/resolution/link with a literal 43-character token, run before the probes.
  - Strength: Keeps the security contract verified in the phase that creates it, which is the
    stated reason for putting the resolver in Phase 2 at all.
  - Tradeoff: Throwaway SQL that lives only in the plan.
  - Confidence: HIGH — every object involved exists after the migration.
  - Blind spot: None significant.
- **Fix B**: Move the four token-dependent checks into Phase 3.
  - Strength: No fixture scaffolding; every check runs against real data.
  - Tradeoff: The unauthenticated contract goes unverified for a whole phase.
  - Confidence: HIGH.
  - Blind spot: None significant.
- **Decision**: PENDING

### F6 — Cascade delete order across `voting_links` is asserted, not verified

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 2 §1 — `voting_links` foreign keys
- **Detail**: `voting_links → owners` is `on delete restrict`, while `voting_links` is reached
  only indirectly from `buildings` (buildings → resolutions → voting_links) and `owners`
  cascades from `buildings` directly. Deleting a building races two paths; if owners go first,
  the restrict fires and the delete fails. The precedent migration treated exactly this
  question as worth proving — `20260802072737:93-97` says the equivalent ordering for `units`
  was "verified, not assumed". This plan asserts it. No UI deletes buildings today, which is
  why it is a warning.
- **Fix**: Add one Phase 2 manual check — delete a test building carrying an open resolution
  and confirm it succeeds — and if it does not, make `voting_links → owners`
  `on delete cascade`.
  - Strength: One command settles it, at the standard the neighbouring migration set itself.
  - Tradeoff: One more fixture (shares Fix A of F5).
  - Confidence: MEDIUM — not run; the dependency order is plausible but unverified.
  - Blind spot: Exactly the point of the finding.
- **Decision**: PENDING

### F7 — Two automated criteria fail on a correct implementation

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 Automated (1.2); Phase 4 Automated (4.2)
- **Detail**: 1.2 requires `grep "Jeden lokal = jeden głosujący" context/foundation/` to return
  nothing. It cannot: the phrase legitimately survives at `prd.md:349` — the _non-goal_ bullet
  Phase 1 §3 explicitly keeps — and twice in `shape-notes.md`, a historical document Phase 1
  correctly does not touch. 4.2 (`grep -n '"/vote"' … returns nothing but the explanatory
comment`) is self-contradictory: a grep either matches or does not. (An earlier suspicion
  that the grep needed `-r` was wrong — verified, it recurses as written.)
- **Fix**: Scope 1.2 to `context/foundation/prd.md` and expect exactly one surviving line (the
  non-goal); restate 4.2 as `grep -c '"/vote"' src/middleware.ts` returning `0`.
- **Decision**: PENDING

### F8 — The resolver returns two columns the stated end state does not need

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Lean Execution
- **Location**: Phase 2 §1 — `resolve_voting_link`
- **Detail**: The plan says the return list _is_ the visibility contract for the internet, then
  returns eight columns. `building_name` and `owner_unit_numbers` serve trust and legibility,
  not the Phase 4 end state. Both are the reader's own data, so neither leaks — but every
  column on this function is permanently harder to remove than to add.
- **Fix A ⭐ Recommended**: Keep both and justify them in the function comment — the reader must
  be able to tell which community and which units the weight covers, or the number is
  unverifiable to them.
  - Strength: `S-03` needs both anyway; adding them later is a second migration on a
    security-sensitive function.
  - Tradeoff: Slightly wider contract than `S-02` alone requires.
  - Confidence: MEDIUM — rests on a prediction about `S-03`.
- **Fix B**: Ship four columns now (number, title, body, share) and widen in `S-03`.
  - Strength: Smallest possible unauthenticated surface at each step.
  - Tradeoff: A `create or replace` on a `definer` function next slice, re-running the whole
    grant/revoke review.
  - Confidence: HIGH.
- **Decision**: PENDING

## Note on authorship

This review was run by the same session that wrote the plan. F2 in particular is a defect in
the mitigation proposed for the user's two-queries decision: the ordering argument was sound,
the error handling written around it was not, and it reopened the hole the ordering closes.
