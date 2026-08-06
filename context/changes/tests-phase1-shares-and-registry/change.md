---
change_id: tests-phase1-shares-and-registry
title: Pin Phase 1 — the udział allocation oracle and the registry parse
status: implementing
created: 2026-08-06
updated: 2026-08-06
archived_at: null
---

## Notes

`context/foundation/test-plan.md` §3 Phase 1 is `not started`, and it means it
literally: `context/changes/test-environment-bootstrap/` bought the harnesses and the
gates but deliberately stopped short of the tests the phase exists to buy, recording
that "Phase 1's udział-allocation oracle (Risk #2) and its real-world registry
fixtures (Risk #8 parse half) are not written here." This change writes them.

Both halves of the phase, because they are one layer and one gate:

- **Risk #2, allocation half** — an uchwała settled against udziały that do not
  reflect the electorate. `src/lib/shares.ts` has no test file. What must hold is
  stated in the PRD (FR-006, FR-007), not in the module: a registry whose areas force
  rounding still totals exactly 100%, and ties resolve identically on a re-parse of
  the same bytes.
- **Risk #8, parse half** — an administrator cannot get a budynek and its rejestr
  into the system at all, and v1 offers no re-import and no registry editing, so a
  refused import is not a recoverable mistake. `src/lib/units-csv.ts` has no test
  file. What must hold: a file carrying the messiness of a real zarządca's export
  either imports cleanly or is refused with a message naming the offending line.

The atomicity half of #8 and the threshold half of #2 are **out of scope** — both are
database behaviour and belong to Phase 2's contract suite.

The constraint that shapes every assertion here: the expected value comes from the
PRD, never from the module under test. A test whose oracle is lifted out of
`shares.ts` proves that `shares.ts` computes what `shares.ts` computes.
