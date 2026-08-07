# CI/CD Code Review Pipeline — Plan Brief

> Full plan: `context/changes/ci-cd-code-review/plan.md`
> Research: `context/changes/ci-cd-code-review/research.md`

## What & Why

Every PR to `main` should get an automated first-pass review against EstateManager's own domain rules — not generic code-quality checks — before a human looks at it. The existing local script (`npm run review`, landed in PR #56) already does the hard part; it just isn't wired into CI, and it scores the wrong five things.

## Starting Point

`scripts/review.ts`/`scripts/review-schema.ts` work locally: pipe a diff in, get a structured pass/fail verdict out via the Claude Agent SDK. Nothing calls this from GitHub Actions. The schema's five criteria are generic (idiomaticity, complexity, …), not EstateManager-specific. No PR-comment or label automation exists anywhere in this repo.

## Desired End State

Open a PR, and within a minute or two a comment appears scoring the diff against this repo's own hazards (does it touch `votes` the wrong way, does RLS cover the new table, are secrets handled correctly, is the diff readable) with a `ai-cr:passed`/`ai-cr:failed` label. Add `ai-cr:review` to ask for a fresh look after pushing fixes. Before changing the prompt itself, run `npx promptfoo eval` locally to see a pass/fail matrix across two models on two fixture diffs, so a prompt tweak's blast radius is visible before it ships.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Reviewer engine | Wrap the existing `npm run review` script in a new workflow | No new agent code needed; the lesson's pattern (GHA + structured verdict + comment/label) doesn't require the specific `claude-code-action` | Plan |
| Action pinning | New workflow's actions pinned to commit SHA | The change's own D2 criterion requires it, even though `ci.yml`/`deploy.yml` pin by tag | Plan |
| Trigger cadence | `opened` only, plus manual retrigger via `ai-cr:review` label | Avoids one Claude Agent SDK call per push; author controls when review re-runs | Plan |
| Label lifecycle | Retrigger is self-consuming — removes `ai-cr:review` and the stale verdict label before adding the fresh one | Labels always reflect only the latest run, never stack up | Plan |
| Comment/label mechanism | `actions/github-script` (SHA-pinned) | Only fit with a precedent-free repo; no existing PR-automation pattern to follow instead | Plan |
| Promptfoo scope | Kept in scope but simplified: 2 models (`claude-sonnet-5` + `gpt-5.1`), 2 hand-crafted fixtures, local-only | Lesson names this task non-optional (only Task 4 is); scaled down per student request | Plan |
| Promptfoo/CI wiring | Not wired into CI | Zero added OpenRouter cost per PR; the eval is a deliberate pre-prompt-change check, not a merge gate | Plan |
| Promptfoo provider | Custom TypeScript `ApiProvider` importing `SYSTEM_PROMPT`/`REVIEW_JSON_SCHEMA` directly, calling OpenRouter's chat-completions API | The Claude Agent SDK only talks to Anthropic, so a raw OpenRouter call is needed to compare vendors — but reusing the real prompt/schema means the eval can't drift from what CI enforces | Plan |
| Fixture diffs | 2 hand-written diffs (one deliberately bad, one clean), not real PR history | Unambiguous expected verdict makes the `javascript` assertion meaningful | Plan |

## Scope

**In scope:**
- Rewriting `REVIEW_SCHEMA`/`SYSTEM_PROMPT` to EstateManager's 5 domain criteria
- `.github/workflows/review.yml`: PR-triggered review, sticky comment, verdict labels, label-triggered retry, `workflow_dispatch`
- One-time `ai-cr:passed`/`ai-cr:failed`/`ai-cr:review` label creation
- `promptfooconfig.yaml` + custom provider + 2 fixtures, local-only regression gate
- README documentation for both new secrets/commands

**Out of scope:**
- `anthropics/claude-code-action@v1` (superseded by wrapping the existing script)
- Branch protection / required status checks (main stays unprotected per `CLAUDE.md`)
- Wiring promptfoo into CI
- Extending `scripts/review.ts`'s input beyond the diff
- Task 4 (extra reviewer tools/context) — separate, optional playbook step

## Architecture / Approach

`review.yml` checks out the PR, fetches just the base ref, diffs, pipes the diff to the existing `npm run review`, captures its JSON output via the multi-line `GITHUB_OUTPUT` form, and a `github-script` step turns that into a sticky comment plus a verdict label. Retriggering is just re-running the same job on a `labeled` event filtered to `ai-cr:review`. The promptfoo side reuses the exact `SYSTEM_PROMPT`/`REVIEW_JSON_SCHEMA` objects through a thin custom provider that swaps only the target model, so CI's enforcement and the eval's subject are always the same object, not a copy.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Domain criteria | `scripts/review-schema.ts` scores EstateManager's 5 hazards instead of generic dimensions | A criterion drifts from what `CLAUDE.md`'s Hazards actually say |
| 2. Review workflow | `review.yml` posts a sticky comment + verdict label on every PR, retriggerable | `GITHUB_OUTPUT` multi-line capture or the always()-branching on review failure gets it wrong silently |
| 3. Promptfoo harness | Local 2-model × 2-fixture regression gate for prompt changes | OpenRouter model identifiers drift/rename over time |

**Prerequisites:** `ANTHROPIC_API_KEY` and `OPENROUTER_API_KEY` as repo/local secrets (playbook K7, manual)
**Estimated effort:** ~1 session across 3 phases, most of it Phase 2's workflow wiring

## Open Risks & Assumptions

- OpenRouter model identifiers (`anthropic/claude-sonnet-5`, `openai/gpt-5.1`) are assumed current as of plan-writing; verify against OpenRouter's model list at implementation time if the eval provider 404s.
- The review verdict is advisory only — nothing currently stops a PR with `ai-cr:failed` from being merged, since `main` has no branch protection by design.

## Success Criteria (Summary)

- Opening a PR against `main` produces a review comment and a verdict label within the workflow's run time.
- Adding `ai-cr:review` produces a fresh comment/label without duplicating the old one.
- `npx promptfoo eval` runs locally and shows both fixtures verdicting as expected across both models.
