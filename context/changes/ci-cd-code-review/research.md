---
date: 2026-08-07T18:58:49+0000
researcher: Claude
git_commit: a614e1b354a1a974a1bbd02da1ad2f4b18a8fa9d
branch: chore/ci-cd-code-review
repository: Tmk10/EstateManager
topic: "Wiring the existing local code-review script into a GHA PR-review pipeline"
tags: [research, codebase, ci-cd, github-actions, code-review, promptfoo]
status: complete
last_updated: 2026-08-07
last_updated_by: Claude
---

# Research: Wiring the existing local code-review script into a GHA PR-review pipeline

**Date**: 2026-08-07T18:58:49+0000
**Researcher**: Claude
**Git Commit**: a614e1b354a1a974a1bbd02da1ad2f4b18a8fa9d
**Branch**: chore/ci-cd-code-review
**Repository**: Tmk10/EstateManager

## Research Question

Per `context/changes/ci-cd-code-review/requirements.md`: how does `npm run review` (`scripts/review.ts`, Claude Agent SDK, landed in PR #56) get wired into a new GitHub Actions workflow that runs on every PR to `main`, alongside the existing `ci.yml`/`deploy.yml`? Specifically: how to compute the diff on the runner, what the script's interface actually requires, and whether its prompt/schema can be reused directly by promptfoo.

## Summary

`scripts/review.ts` is a minimal, CI-ready building block: it reads a diff from stdin, calls the Claude Agent SDK with a fixed system prompt and JSON-schema-constrained output, and either prints the structured verdict to stdout or throws (which exits the process with code 1) — that failure mode is already a usable pass/fail signal for a workflow step. Nothing in the repo currently posts PR comments or manages labels, so that plumbing (`ai-cr:passed`/`ai-cr:failed`, retrigger on `ai-cr:review`) is new. Two things need explicit decisions in the plan, not just implementation: **fetch-depth** (both existing workflows check out at the default shallow depth, which is insufficient for diffing against a base branch) and **action-pinning style** (both existing workflows pin by tag, e.g. `@v7`, while the lesson's stated criterion asks for SHA-pinning — this repo has no precedent for the stricter style). `SYSTEM_PROMPT`/`REVIEW_SCHEMA` from `scripts/review-schema.ts` are named exports and can be imported unmodified by a promptfoo custom provider, so the exact prompt/schema CI enforces is what gets evaluated across models — no separate copy to drift.

## Detailed Findings

### Existing CI/CD workflows

- `.github/workflows/ci.yml` — triggers on `push`/`pull_request` to `main`. Three jobs: `ci` (checkout → setup-node@v7 node 22 → `npm ci` → `astro sync` → `lint` → `test` → `build`), `db-contract` (fresh `supabase start` + `supabase test db`), `e2e` (Playwright against a seeded local stack).
- `.github/workflows/deploy.yml` — triggers on `push` to `main` only, concurrency group `deploy-production`. Runs the same lint/test/build gate, then `cloudflare/wrangler-action@v4` deploy, then a health-check curl.
- Neither workflow sets `fetch-depth` — both use the `actions/checkout@v7` default (shallow, effectively depth 1 for the triggering ref). A new `review.yml` diffing against `origin/${{ github.base_ref }}` needs either `fetch-depth: 0` or an explicit `git fetch origin ${{ github.base_ref }}` step; the default checkout will not have the base branch's history available.
- Action pinning across both files is **tag-based**, not SHA-based: `actions/checkout@v7`, `actions/setup-node@v7`, `supabase/setup-cli@v1`, `actions/upload-artifact@v4`, `cloudflare/wrangler-action@v4`. There is no SHA-pinned action anywhere in this repo yet — the lesson's "pin to SHA, not a moving tag" criterion has no existing convention to follow here, and would be the first of its kind in `.github/`.
- Repository secrets currently in use: `SUPABASE_URL`, `SUPABASE_KEY` (ci.yml, deploy.yml), `CLOUDFLARE_API_TOKEN` (deploy.yml). Documented in README.md around the "Configure ... as repository secrets in GitHub" note. `ANTHROPIC_API_KEY` (for `npm run review` in CI) and `OPENROUTER_API_KEY` (for promptfoo, if run in CI) are new secrets this change introduces.
- No PR-comment, labeling, or label-triggered-retry automation exists anywhere in the repo (`actions/github-script`, `peter-evans/*`, or similar — zero hits in `.github/` and `package.json`). This is greenfield; the plan needs to pick a concrete mechanism (most likely `actions/github-script` for the comment + `actions/github-script` or a dedicated label-add/remove step for `ai-cr:passed`/`ai-cr:failed`, plus an `on: pull_request: types: [labeled]` trigger — or a second job — for the `ai-cr:review` retrigger).

### `scripts/review.ts` / `scripts/review-schema.ts` interface

- Input: whole diff read from stdin (`for await (const chunk of process.stdin)`).
- No explicit env var reads in the script — it relies on the Claude Agent SDK's `query()` reading `ANTHROPIC_API_KEY` from the process environment implicitly. Nothing else is required: `tools: []` and `maxTurns: 4` mean no filesystem/bash access, so the script has no working-directory dependency beyond stdin.
- Output: pretty-printed JSON to stdout, shaped by `REVIEW_SCHEMA` (five numeric scores + `verdict: "pass" | "fail"` + a Markdown `summary` string already meant to be PR-comment-ready).
- Failure mode: no `try/catch`, no explicit `process.exit()`. A schema-parse failure, a non-success SDK result, or an empty result stream all throw; an uncaught exception at top-level `await` exits Node with code 1. This is directly usable as a CI gate signal (`npm run review` failing the step = the job going red) but means the workflow's PR-comment/label step needs to run even when the review step fails (`if: always()` or equivalent) if it's going to post a `ai-cr:failed` label rather than just a red check.
- `npm ci` provisions `tsx` (the runner for `"review": "tsx scripts/review.ts"`) and `@anthropic-ai/claude-agent-sdk`. No Docker/Supabase dependency — this script is independent of the app runtime the other three CI jobs need.

### Promptfoo reuse of the same prompt/schema

- `SYSTEM_PROMPT`, `REVIEW_SCHEMA`, and `REVIEW_JSON_SCHEMA` are named exports of `scripts/review-schema.ts`. A promptfoo custom provider (a small script promptfoo shells out to via `provider: file://...`) can import them directly and parameterize only the `model` field — the same pattern `scripts/review.ts` already implements, just swapping the hardcoded `"claude-sonnet-5"` for a variable. This means CI's actual prompt/schema is what promptfoo evaluates, with no separate copy that can drift out of sync.
- promptfoo is not yet a dependency (confirmed absent from `package.json` and `package-lock.json`).
- No prior repo history mentions promptfoo anywhere — the only hit is this change's own `requirements.md`. There is no existing config shape or convention to match; the plan is free to design `promptfooconfig.yaml` from scratch (per this change's `## Ustalenia`, fixtures should be diffs sampled from this repo's own history, not the lesson's example domain).

## Code References

- `scripts/review.ts:1-35` — full script: stdin read, SDK call, schema-checked output, throw-on-failure.
- `scripts/review-schema.ts:3-25` — `SYSTEM_PROMPT`, `REVIEW_SCHEMA` (zod), `REVIEW_JSON_SCHEMA` (draft-07 conversion for the SDK's structured-output mode).
- `package.json` — `"review": "tsx scripts/review.ts"` script; `@anthropic-ai/claude-agent-sdk` (dependencies) and `tsx` (devDependencies).
- `.github/workflows/ci.yml` — trigger, job, and checkout/setup-node pinning conventions to mirror or deliberately diverge from.
- `.github/workflows/deploy.yml` — repository-secrets convention (`secrets.SUPABASE_URL` etc.) to follow for `ANTHROPIC_API_KEY`/`OPENROUTER_API_KEY`.
- `.nvmrc` — `22.14.0`, the Node version any new job's `setup-node` step should match.

## Architecture Insights

- The repo's existing convention is tag-pinned actions everywhere; SHA-pinning (as the lesson's original `anthropics/claude-code-action@v1` criterion asked for) would be a deliberate, first-of-its-kind deviation for this one workflow, not a pattern already established to follow.
- `scripts/review.ts`'s "throw = exit 1" behavior is a convenient CI primitive but is orthogonal to the pass/fail *verdict* the review itself produces — a successful run can still carry `verdict: "fail"` in its JSON. The workflow needs to branch on the parsed `verdict` field for labeling, not just on the step's exit code.
- Because `scripts/review.ts` takes no PR title/description input (only the diff via stdin), this change's `requirements.md` narrowed the lesson's three-input MVP (title + description + diff) down to diff-only, matching what the existing script actually accepts rather than extending the script's interface as a prerequisite.

## Historical Context (from prior changes)

- No prior `context/changes/**/` or `context/archive/**/` entry addresses CI/CD workflow design, PR automation, or promptfoo — this is the first change in either location to touch `.github/workflows/`.
- `context/foundation/lessons.md` carries three superseding entries on branch/worktree/PR discipline (most recent: "Każdy feature i fix przez własną gałąź i pull request", 2026-08-02) — already reflected in how this change's branch was created, no new implication for the review pipeline itself.

## Related Research

None — first research document for this change.

## Open Questions

1. **Action pinning**: pin the new workflow's third-party actions to SHA (matching the lesson's stated security criterion, deviating from this repo's existing tag-pinned convention), or match the repo's existing convention and pin by tag like `ci.yml`/`deploy.yml` do? This is a real fork with no single correct answer — belongs in the plan as an explicit decision, not something to default silently.
2. **Fetch depth**: `fetch-depth: 0` (full history, larger checkout) vs. a targeted `git fetch origin <base_ref> --depth=<n>` (smaller, faster, correct for diffing without full history) — a plan-level implementation choice.
3. **Comment/label mechanism**: `actions/github-script` is the most direct fit given nothing else exists in this repo yet, but the plan should confirm rather than assume, since this is the first PR-automation of its kind here.
