## Overall concept

- GHA workflow run for every new pull request to `main`, plus manual `workflow_dispatch`
- reviewer is the existing local script (`npm run review` → `scripts/review.ts`, Claude Agent SDK) invoked from the workflow, not a new agent or action
- promptfoo eval set as a regression gate for the reviewer's prompt/schema

## Input parameters

- `git diff` against `origin/${{ github.base_ref }}`, piped to `npm run review` on stdin

## Code Review Criteria

Each criterion is scored on a 1–10 scale, where 1 is the worst outcome and 10 is the best.

1. **Domain rule conformance** — 1: breaks a rule from `CLAUDE.md`'s Hazards (e.g. `votes` insert/update/delete, recomputing `share_bps`, a threshold computed in TypeScript instead of SQL). 10: touches none of them, or explicitly respects one it's near.
2. **RLS and security boundaries** — 1: a new table ships without all 8 policies, or `anon` gains access outside `resolve_voting_link`. 10: the full `select`/`insert`/`update`/`delete` × `anon`/`authenticated` matrix is present, and `update` has both `using` and `with check`.
3. **Test coverage proportional to risk** — 1: zero tests for a change touching `votes`, the threshold, or RLS. 10: the right harness ran and is named — `npm test` / `test:db` / `test:e2e`.
4. **Secrets and configuration** — 1: a key or URL is hardcoded or committed. 10: everything flows through `secrets`/`astro:env`, with `null`-client handling where it applies.
5. **Diff readability** — 1: an unexplained change, dead code, or unremoved placeholders. 10: the diff reads without conversation context, and comments appear only where the WHY is non-obvious.

## Parked for later

- business alignment (requires broader context)
- architectural fit (requires broader context)

## Expected side-effects

- PR comment with summary
- labels: `ai-cr:failed` (red) OR `ai-cr:passed` (green)

## Expected behavior

- on-demand retry when label `ai-cr:review` is added
