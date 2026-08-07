# CI/CD Code Review Pipeline Implementation Plan

## Overview

Wire the existing local reviewer (`npm run review` → `scripts/review.ts`, Claude Agent SDK) into a GitHub Actions workflow that reviews every pull request against `main`, and replace its five generic scoring criteria with EstateManager's own domain criteria. Add a local promptfoo regression harness so a future change to the review prompt/schema can be checked against multiple models before it ships.

## Current State Analysis

`scripts/review.ts` and `scripts/review-schema.ts` (PR #56) already implement a working local reviewer: read a diff from stdin, call the Claude Agent SDK with a fixed system prompt and JSON-schema-constrained output, print the verdict JSON to stdout, throw (exit 1) on any failure. Nothing calls this script from CI. `REVIEW_SCHEMA` currently scores five generic dimensions (`implementationCorrectness`, `idiomaticity`, `complexity`, `testRiskCoverage`, `securitySafety`) rather than anything specific to this repo's domain hazards. `.github/workflows/` holds only `ci.yml` and `deploy.yml`; neither sets `fetch-depth`, both pin third-party actions by tag, and no PR-comment or label automation exists anywhere in the repo. No `ai-cr:*` labels exist yet. `promptfoo` is not a dependency and no `promptfooconfig.yaml` exists.

## Desired End State

- `scripts/review-schema.ts` scores five EstateManager-specific criteria (domain rule conformance, RLS/security boundaries, test coverage vs. risk, secrets/configuration, diff readability), each anchored with what a 1 and a 10 look like.
- `.github/workflows/review.yml` runs `npm run review` against every PR's diff on open, posts a sticky PR comment with the verdict summary, and sets `ai-cr:passed`/`ai-cr:failed`. Adding the `ai-cr:review` label re-runs it and resets the labels. `workflow_dispatch` runs it manually against a chosen base ref, without PR-only side effects.
- `promptfooconfig.yaml` compares `claude-sonnet-5` and `gpt-5.1` (via OpenRouter) against two hand-crafted fixture diffs, reusing the real `SYSTEM_PROMPT`/`REVIEW_JSON_SCHEMA` — no copy that can drift from what CI enforces. Run by hand (`npx promptfoo eval`) before changing the prompt; not wired into CI.

### Key Discoveries:

- `scripts/review.ts:22-29` — verdict lives inside the parsed JSON (`message.structured_output.verdict`), separate from the step's exit code. The workflow must parse stdout for `verdict`, not just check whether the step succeeded.
- `scripts/review.ts:34` reads the whole diff from stdin with no other inputs — the workflow only needs to pipe a diff in, nothing else.
- `package.json` — `"review": "tsx scripts/review.ts"`; running it via plain `npm run review` (no `--silent`) prepends an `> tsx scripts/review.ts` line to stdout, which breaks `JSON.parse` on the output. Must invoke with `npm run review --silent`.
- Neither `ci.yml` nor `deploy.yml` sets `fetch-depth`; `actions/checkout`'s default shallow clone on the `pull_request` event checks out only the merge commit, not the base branch — diffing needs an explicit fetch of the base ref.
- `SYSTEM_PROMPT`, `REVIEW_SCHEMA`, `REVIEW_JSON_SCHEMA` in `scripts/review-schema.ts` are named exports; a promptfoo custom TypeScript provider (`ApiProvider` interface, loaded via `file://…ts`) can import them directly, so the same object CI enforces is what promptfoo evaluates.

## What We're NOT Doing

- Not using `anthropics/claude-code-action@v1` — the existing local script is wired into CI directly instead (recorded decision, see the playbook's `## Ustalenia`).
- Not adding branch protection / required status checks — `main` is deliberately unprotected per `CLAUDE.md`; `review.yml`'s verdict is advisory (comment + label), not a merge block.
- Not wiring promptfoo into CI — it stays a local command the student runs before changing the prompt.
- Not extending `scripts/review.ts`'s input surface (PR title/description) — it takes only the diff, matching `requirements.md`'s narrowed scope.
- Not building Task 4 (extra tools/context for the reviewer) — that is the playbook's separate, optional K9 step.

## Implementation Approach

Three independent-ish but sequential phases: the schema rewrite (Phase 1) has to land before the workflow (Phase 2) references the new field names in its comment-formatting logic, and before the promptfoo provider (Phase 3) evaluates them. All three touch `scripts/review-schema.ts` as the shared source of truth, so later phases read what earlier phases wrote rather than duplicating it.

## Critical Implementation Details

**`GITHUB_OUTPUT` and multi-line JSON.** The review step's stdout is a multi-line pretty-printed JSON blob. Capturing it into a step output requires the delimiter form of `GITHUB_OUTPUT` (`echo "result<<EOF" >> "$GITHUB_OUTPUT"`, then the JSON, then `echo "EOF" >> "$GITHUB_OUTPUT"`), not a plain `echo "result=$(...)" >>`, which breaks on embedded newlines.

**The review step can fail before producing a verdict.** `scripts/review.ts` throws on a schema-parse failure or an unsuccessful SDK result — no verdict JSON exists in that case. The comment/label step must run with `if: always()` and branch on `steps.review.outcome`, posting a distinct "reviewer failed to run" comment (no label change) rather than assuming a `verdict` field is always present.

## Phase 1: Domain-specific review criteria

### Overview

Replace `scripts/review-schema.ts`'s five generic criteria with EstateManager's five domain criteria (agreed in the playbook's K2), so both the CI reviewer and the Phase 3 eval score what actually matters for this repo.

### Changes Required:

#### 1. Review schema and prompt

**File**: `scripts/review-schema.ts`

**Intent**: Replace the generic `REVIEW_SCHEMA` fields and `SYSTEM_PROMPT` wording with the five domain criteria from `requirements.md`'s `## Code Review Criteria`, each anchored with its 1 and 10 description, keeping the existing `verdict`/`summary` fields and the `z.number()`-not-`min/max` workaround (Anthropic's structured-output mode rejects `integer` min/max, so the 1–10 range is enforced by prompt text and field `.describe()` only, not the schema).

**Contract**: `REVIEW_SCHEMA` fields become `domainRuleConformance`, `rlsSecurityBoundaries`, `testCoverageForRisk`, `secretsAndConfig`, `diffReadability` (each `z.number().describe(...)`), plus the unchanged `verdict: z.enum(["pass","fail"])` and `summary: z.string()`. `SYSTEM_PROMPT` restates the five criteria in Polish (matching the file's existing language) with their 1/10 anchors:

```text
1. Zgodność z regułami domenowymi — 1: łamie regułę z Hazards w CLAUDE.md (np. insert/update/delete
   na votes, recompute share_bps, próg liczony w TS zamiast SQL). 10: nie dotyka żadnej z tych reguł
   albo jawnie ją respektuje.
2. RLS i granice bezpieczeństwa — 1: nowa tabela bez kompletu 8 polityk, albo anon poza
   resolve_voting_link. 10: pełny komplet select/insert/update/delete × anon/authenticated,
   update ma using i with check.
3. Pokrycie testami względem ryzyka — 1: zero testów dla zmiany dotykającej votes/progu/RLS.
   10: odpowiedni harness uruchomiony i nazwany (npm test / test:db / test:e2e).
4. Sekrety i konfiguracja — 1: klucz/URL wklejony w kod albo commit. 10: przez secrets/astro:env,
   z obsługą null-klienta gdzie dotyczy.
5. Czytelność diffu — 1: zmiana bez uzasadnienia, martwy kod, nieusunięte placeholdery.
   10: diff czytelny bez kontekstu z rozmowy, komentarze tylko tam gdzie WHY jest nieoczywiste.
```

`REVIEW_JSON_SCHEMA` (`z.toJSONSchema(REVIEW_SCHEMA, { target: "draft-07" })`) regenerates automatically from the new `REVIEW_SCHEMA` — no separate edit needed.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes on `scripts/review-schema.ts`

#### Manual Verification:

- `git diff origin/main HEAD -- scripts/review-schema.ts | npm run review --silent` (or piping one of Phase 3's fixture diffs) returns JSON keyed by the five new field names, not the old generic ones

---

## Phase 2: `review.yml` — the PR review workflow

### Overview

A new workflow that runs the updated reviewer against every PR's diff, posts a sticky summary comment, and maintains `ai-cr:passed`/`ai-cr:failed` labels, retriggerable via `ai-cr:review`.

### Changes Required:

#### 1. One-time label creation

**Intent**: The three labels this workflow manages don't exist in the repo yet; `gh label create` is idempotent config, not a workflow step, so it runs once during implementation rather than on every job run.

**Contract**: `gh label create ai-cr:passed --color 0e8a16 --description "Local AI code review: verdict pass" --force`, `gh label create ai-cr:failed --color d73a4a --description "Local AI code review: verdict fail" --force`, `gh label create ai-cr:review --color c5def5 --description "Add to re-run the AI code review" --force`. Colors reuse the repo's existing green (`type:foundation`/`status:done`) and red (`bug`).

#### 2. The workflow file

**File**: `.github/workflows/review.yml`

**Intent**: On `pull_request: [opened]` and on `pull_request: [labeled]` (filtered to the `ai-cr:review` label in a job-level `if`), plus `workflow_dispatch`, compute the diff against the PR's base branch, run the reviewer, and reflect the verdict as a sticky comment and labels. `workflow_dispatch` runs the reviewer against `origin/main` for visibility/debugging but skips the PR-only comment/label steps (there is no PR to post to).

**Contract**:

```yaml
name: AI Code Review

on:
  pull_request:
    branches: [main]
    types: [opened, labeled]
  workflow_dispatch:

permissions:
  contents: read
  issues: write
  pull-requests: write

jobs:
  review:
    if: >
      github.event_name == 'workflow_dispatch' ||
      github.event.action == 'opened' ||
      (github.event.action == 'labeled' && github.event.label.name == 'ai-cr:review')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7
      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - name: Fetch base ref
        run: git fetch origin ${{ github.base_ref || 'main' }} --depth=1
      - name: Compute diff and run reviewer
        id: review
        run: |
          {
            echo "result<<EOF"
            git diff "origin/${{ github.base_ref || 'main' }}" HEAD | npm run review --silent
            echo "EOF"
          } >> "$GITHUB_OUTPUT"
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
      - name: Reset the ai-cr:review trigger label
        if: always() && github.event.action == 'labeled'
        uses: actions/github-script@3a2844b7e9c422d3c10d287c895573f7108da1b3 # v9
        with:
          script: |
            await github.rest.issues.removeLabel({
              owner: context.repo.owner, repo: context.repo.repo,
              issue_number: context.issue.number, name: 'ai-cr:review',
            }).catch(() => {});
      - name: Post verdict comment and labels
        if: always() && github.event_name == 'pull_request'
        uses: actions/github-script@3a2844b7e9c422d3c10d287c895573f7108da1b3 # v9
        with:
          script: |
            const marker = '<!-- ai-code-review -->';
            const failed = '${{ steps.review.outcome }}' !== 'success';
            const body = failed
              ? `${marker}\n### ⚠️ AI code review nie uruchomiło się poprawnie\nZobacz log kroku \`review\`.`
              : (() => {
                  const r = JSON.parse(`${{ steps.review.outputs.result }}`);
                  return `${marker}\n${r.summary}`;
                })();
            const { data: comments } = await github.rest.issues.listComments({
              owner: context.repo.owner, repo: context.repo.repo, issue_number: context.issue.number,
            });
            const existing = comments.find(c => c.body.startsWith(marker));
            if (existing) {
              await github.rest.issues.updateComment({ owner: context.repo.owner, repo: context.repo.repo, comment_id: existing.id, body });
            } else {
              await github.rest.issues.createComment({ owner: context.repo.owner, repo: context.repo.repo, issue_number: context.issue.number, body });
            }
            if (!failed) {
              const r = JSON.parse(`${{ steps.review.outputs.result }}`);
              const toRemove = r.verdict === 'pass' ? 'ai-cr:failed' : 'ai-cr:passed';
              const toAdd = r.verdict === 'pass' ? 'ai-cr:passed' : 'ai-cr:failed';
              await github.rest.issues.removeLabel({ owner: context.repo.owner, repo: context.repo.repo, issue_number: context.issue.number, name: toRemove }).catch(() => {});
              await github.rest.issues.addLabels({ owner: context.repo.owner, repo: context.repo.repo, issue_number: context.issue.number, labels: [toAdd] });
            }
```

#### 3. README

**File**: `README.md`

**Intent**: Document the new workflow and its secret alongside the existing `ci.yml`/`deploy.yml` entries, matching the file's established convention (`### GitHub Actions` section).

**Contract**: One new bullet under the GitHub Actions section: `.github/workflows/review.yml` — runs `npm run review` against every PR's diff on open (and on demand via the `ai-cr:review` label or `workflow_dispatch`); needs `ANTHROPIC_API_KEY` as a repository secret.

### Success Criteria:

#### Automated Verification:

- `npm run lint && npm test && npm run build` pass (no application code changed by this phase, but the full gate per `CLAUDE.md` still applies to the PR)
- `gh label list` shows `ai-cr:passed`, `ai-cr:failed`, `ai-cr:review`

#### Manual Verification:

- Open a test PR against `main` (or run `workflow_dispatch`) and confirm the `review` job runs, posts a comment starting with `<!-- ai-code-review -->`, and sets `ai-cr:passed` or `ai-cr:failed`
- Add the `ai-cr:review` label to that PR and confirm: the label is removed, the review re-runs, the existing comment is updated (not duplicated), and the pass/fail label is refreshed

---

## Phase 3: Local promptfoo regression harness

### Overview

A local `npx promptfoo eval` command comparing `claude-sonnet-5` and `gpt-5.1` against two fixture diffs, reusing the real `SYSTEM_PROMPT`/`REVIEW_JSON_SCHEMA` so the eval can never silently diverge from what `review.yml` enforces.

### Changes Required:

#### 1. Dependency

**File**: `package.json`

**Intent**: Pin `promptfoo` as a devDependency (matching how `tsx` and other dev tooling are declared) and add a convenience script.

**Contract**: `"promptfoo": "^<latest>"` in `devDependencies`; `"eval:review": "promptfoo eval"` in `scripts`.

#### 2. Custom provider

**File**: `scripts/review-eval-provider.ts`

**Intent**: A promptfoo `ApiProvider` that calls OpenRouter's chat-completions endpoint directly (not the Claude Agent SDK, which only talks to Anthropic) using the exact `SYSTEM_PROMPT` and `REVIEW_JSON_SCHEMA` imported from `scripts/review-schema.ts`, parameterized only by `config.model` — the same "swap only the model" pattern `scripts/review.ts` already uses internally.

**Contract**:

```typescript
import type { ApiProvider, ProviderOptions, ProviderResponse, CallApiContextParams } from "promptfoo";
import { REVIEW_JSON_SCHEMA, SYSTEM_PROMPT } from "./review-schema.ts";

export default class ReviewEvalProvider implements ApiProvider {
  private model: string;
  constructor(options: ProviderOptions) {
    this.model = (options.config?.model as string) ?? "anthropic/claude-sonnet-5";
  }
  id(): string {
    return `openrouter-review:${this.model}`;
  }
  async callApi(prompt: string, _context?: CallApiContextParams): Promise<ProviderResponse> {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_schema", json_schema: { name: "review", strict: true, schema: REVIEW_JSON_SCHEMA } },
      }),
    });
    const data = (await response.json()) as { choices?: { message: { content: string } }[]; usage?: { total_tokens: number; prompt_tokens: number; completion_tokens: number } };
    return {
      output: data.choices?.[0]?.message.content ?? "",
      tokenUsage: data.usage
        ? { total: data.usage.total_tokens, prompt: data.usage.prompt_tokens, completion: data.usage.completion_tokens }
        : undefined,
    };
  }
}
```

promptfoo loads `.ts` custom providers natively (documented `ApiProvider` pattern) — no separate build/loader step needed.

#### 3. Fixture diffs

**Files**: `scripts/eval-fixtures/clean-change.diff`, `scripts/eval-fixtures/bad-change.diff`

**Intent**: Two small, hand-written diffs with unambiguous expected verdicts, so the eval's `javascript` assertion has a hard ground truth. `bad-change.diff` deliberately fails at least two criteria at once (e.g., re-adds a raw `insert`/`delete` grant on `public.votes` — a `CLAUDE.md` Hazard — with no accompanying test), so it should score low on both `domainRuleConformance` and `testCoverageForRisk` and verdict `fail`. `clean-change.diff` is a small, well-formed, tested, self-explanatory change that should verdict `pass`.

**Contract**: Plain unified-diff text (`git diff` format), not real repo history — written by hand so the criteria they exercise are unambiguous, per the playbook's K5 decision.

#### 4. `promptfooconfig.yaml`

**File**: `promptfooconfig.yaml`

**Intent**: Compare the two models against the two fixtures, asserting valid JSON and the expected `verdict`.

**Contract**:

```yaml
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: EstateManager code-review prompt/schema regression gate
prompts:
  - "Zrecenzuj ten diff:\n\n{{diff}}"
providers:
  - id: file://scripts/review-eval-provider.ts
    label: claude-sonnet-5
    config:
      model: anthropic/claude-sonnet-5
  - id: file://scripts/review-eval-provider.ts
    label: gpt-5.1
    config:
      model: openai/gpt-5.1
tests:
  - description: bad change — domain-rule violation, no tests
    vars:
      diff: file://scripts/eval-fixtures/bad-change.diff
    assert:
      - type: is-json
      - type: javascript
        value: "JSON.parse(output).verdict === 'fail'"
  - description: clean change — respects rules, tested
    vars:
      diff: file://scripts/eval-fixtures/clean-change.diff
    assert:
      - type: is-json
      - type: javascript
        value: "JSON.parse(output).verdict === 'pass'"
```

#### 5. README

**File**: `README.md`

**Intent**: Document how and when to run the eval, matching the file's existing secrets-documentation convention.

**Contract**: One bullet: `npx promptfoo eval` (or `npm run eval:review`) compares the reviewer's prompt/schema across models on `scripts/eval-fixtures/*.diff` before you change `scripts/review-schema.ts`; needs `OPENROUTER_API_KEY` locally (not a CI secret — this eval is not wired into CI).

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes on `scripts/review-eval-provider.ts`
- `npm run build` still succeeds (new devDependency doesn't affect the app bundle)

#### Manual Verification:

- `OPENROUTER_API_KEY=… npx promptfoo eval` completes and prints a 2×2 pass/fail matrix
- `bad-change.diff` verdicts `fail` on both models; `clean-change.diff` verdicts `pass` on both models

---

## Testing Strategy

### Unit Tests:

- None added — `scripts/` is outside Vitest's `include: ["src/**/*.test.ts"]` scope by repo convention, and `npm run lint` already covers the new/changed TypeScript files.

### Integration Tests:

- The Phase 2 manual verification (open a PR, confirm comment + label, retrigger via `ai-cr:review`) is this change's integration test — there is no automated harness for GitHub Actions behavior in this repo.

### Manual Testing Steps:

1. Open a small throwaway PR against `main` from the working branch and confirm `review.yml` runs, posts a marker comment, and applies a verdict label.
2. Add `ai-cr:review` to that PR; confirm the label is consumed, the comment updates in place, and the verdict label is refreshed.
3. Run `OPENROUTER_API_KEY=… npx promptfoo eval` locally and confirm the matrix output and that both fixtures verdict as expected on both models.

## Performance Considerations

`review.yml` only runs on PR open and on-demand retrigger (not on every push), keeping Claude Agent SDK calls to roughly one per PR unless explicitly re-requested — the trigger-cadence decision recorded in the playbook.

## Migration Notes

Not applicable — no data model or schema changes.

## References

- Related research: `context/changes/ci-cd-code-review/research.md`
- Requirements: `context/changes/ci-cd-code-review/requirements.md`
- Existing reviewer: `scripts/review.ts`, `scripts/review-schema.ts`
- Existing workflow conventions: `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Domain-specific review criteria

#### Automated

- [x] 1.1 `npm run lint` passes on `scripts/review-schema.ts` — 28f39c6

#### Manual

- [ ] 1.2 Piped diff through `npm run review --silent` returns JSON keyed by the five new field names

### Phase 2: `review.yml` — the PR review workflow

#### Automated

- [x] 2.1 `npm run lint && npm test && npm run build` pass
- [x] 2.2 `gh label list` shows `ai-cr:passed`, `ai-cr:failed`, `ai-cr:review`

#### Manual

- [ ] 2.3 Test PR (or `workflow_dispatch`) runs the review job, posts the marker comment, sets a verdict label
- [ ] 2.4 `ai-cr:review` retrigger consumes the label, updates the existing comment in place, refreshes the verdict label

### Phase 3: Local promptfoo regression harness

#### Automated

- [ ] 3.1 `npm run lint` passes on `scripts/review-eval-provider.ts`
- [ ] 3.2 `npm run build` still succeeds

#### Manual

- [ ] 3.3 `npx promptfoo eval` completes and prints the 2×2 matrix
- [ ] 3.4 `bad-change.diff` verdicts `fail` on both models; `clean-change.diff` verdicts `pass` on both models
