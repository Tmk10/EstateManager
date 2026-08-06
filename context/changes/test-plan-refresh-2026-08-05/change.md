---
change_id: test-plan-refresh-2026-08-05
title: Refresh the test plan against S-04 and S-05
status: implemented
created: 2026-08-05
updated: 2026-08-06
archived_at: null
---

## Notes

The refresh `context/foundation/test-plan.md` §8 scheduled for itself: "after roadmap
`S-04` (`voting-link-email-fanout`) ships." `S-04` shipped 2026-08-04 and `S-05` shipped
2026-08-05, so Risks #1 and #2 — the two highest-scored — are estimates against code that
now exists.

Also corrects two defects the document carries: §3 records Phase 1 as `change opened`
against `context/changes/testing-share-arithmetic/`, a folder that has never existed on any
branch (PR #34 landed this knowingly and deferred the fix here); and §1's hot-spot figure
attributes a repo-wide commit count to a two-directory scope.

Document only — no test runner, no `CLAUDE.md` edit, no Phase 1 launch.
