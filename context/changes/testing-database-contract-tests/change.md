---
change_id: testing-database-contract-tests
title: "Phase 2 — database contract tests: electorate, finality, own-data-only, threshold, atomicity"
status: implemented
created: 2026-08-07
updated: 2026-08-07
archived_at: null
---

## Notes

`context/foundation/test-plan.md` §3 Phase 2 is `not started` and means it literally:
`context/changes/test-environment-bootstrap/` bought the pgTAP harness and the CI gate but
wrote no test against the domain. This change writes them.

Opened by user direction, research step skipped deliberately (2026-08-07): grounding for
this change comes from reading `supabase/migrations/*.sql` directly rather than from a
separate `/10x-research` pass. `research.md` does not exist for this change; `plan.md`
carries the file:line anchors research would normally supply.

Risks covered (`test-plan.md` §2): #2 (threshold half), #3, #4, #6, #8 (atomicity half).
Test type: contract (pgTAP), per §3.
