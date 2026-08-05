<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: S-05 — Live share tally and resolution outcome

- **Plan**: `context/changes/live-tally-and-outcome/plan.md`
- **Scope**: Phases 1–4 of 4 (all phases; Progress row 4.7 still pending)
- **Date**: 2026-08-05
- **Verdict**: REJECTED (one critical finding; everything else is sound)
- **Findings**: 1 critical, 2 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | FAIL |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

Automated criteria re-run at review time: `npx astro sync` clean, `npm run lint` clean,
`npm run build` exit 0. There is no test runner in this repository and none was added; nothing
here reports tests as passing.

## Findings

### F1 — An administrator can declare an outcome with no votes behind it

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `supabase/migrations/20260804213630_resolution_outcome.sql:143-149`
- **Detail**: Widening `EM007` to permit `open → passed` and `open → rejected` opened those two
  transitions to **every** writer, not only to `apply_resolution_outcome`.
  `resolutions_update_authenticated` is `using (true)`
  (`20260802181500_create_resolutions_and_voting_links.sql:190-194`) and no table in this schema
  carries `force row level security`, so any signed-in administrator can `PATCH` a resolution's
  status through PostgREST. `resolutions_decided_at_matches_status` is satisfied by supplying
  `decided_at` in the same payload, and nothing compares the stored outcome against
  `resolution_tally`.

  **Reproduced against the local stack, inside a rolled-back transaction** (`set local role
  authenticated`): resolution `1/2026`, `for_bps = 0`, `for_missing_bps = 5001`, updated to
  `status = 'passed'` with `decided_at = now()` → `UPDATE 1`, no error, and the tally still reads
  `for_missing_bps = 5001` beside a resolution that now claims it passed. Rolled back; the local
  fixture is unchanged.

  Two things make this worse than a generic "v1 admin is unscoped" observation:
  - **It was not possible before this migration.** `EM007` previously refused every status change
    except `draft → open`.
  - **It also closes the vote.** `cast_vote` gates on `status = 'open'`, so a forged flip silently
    stops every owner who has not yet voted — on the neutral zero-row path, with nothing said.

  It is also out of step with this schema's own posture. `EM006` (no content edit after open),
  `EM009` (no delete outside draft), `EM010` (no vote update or delete), `EM012`/`EM013` (no link
  issued or deleted outside draft) exist precisely to fence the administrator out of tampering
  with a live vote — `EM012`/`EM013` came out of an earlier implementation review of exactly this
  class and were fixed rather than deferred to the v2 roles model.

- **Fix A ⭐ Recommended**: Make the transition conditional on the tally in
  `assert_resolution_frozen` — on `open → passed` require `for_missing_bps = 0`, on
  `open → rejected` require `against_missing_bps = 0`, raising a new `EM014` otherwise.
  - Strength: The legitimate flip from `apply_resolution_outcome` satisfies it by construction,
    so the honest path is untouched; it binds every writer rather than trusting one; it matches
    the `EM012`/`EM013` precedent for the same class of hole; one migration, no schema change.
  - Tradeoff: The assertion must read the tally the way the migration's own comment says an
    *assertion* has to — `resolution_tally` is `security invoker`, so calling it from an invoker
    trigger under a future scoped `votes_select_authenticated` would aggregate only the caller's
    visible rows and pass by not seeing the problem, the exact failure
    `assert_building_registry` was flipped to `definer` to avoid. The check therefore needs a
    `definer` read (or its own inlined sum), which is a deliberate second definer read to argue
    for in-file.
  - Confidence: HIGH — the hole is reproduced, and the guard shape is the one this schema already
    uses five times.
  - Blind spot: Not verified whether any legitimate future path needs to set an outcome without
    votes behind it (e.g. a resolution withdrawn or annulled by the community). If one does, it
    needs its own transition rather than reuse of these two.
- **Fix B**: Record as a v1 residual in `change.md` and `CLAUDE.md`, and leave the transition open.
  - Strength: Consistent with the project's stated posture that PRD v1 has no roles model and one
    administrator is trusted; ships S-05 unchanged.
  - Tradeoff: The one claim this product exists to make — that an outcome follows from
    share-weighted votes — becomes unenforced at the only layer that enforces anything here, and
    the residual is invisible to anyone reading the migration's own transition table.
  - Confidence: MEDIUM — defensible as a v1 stance, but it reverses the precedent set by
    `EM012`/`EM013` within the same schema.
  - Blind spot: Nobody has checked whether an outcome flip leaves any trace an audit could find
    (`S-06` scope); if it does not, "recorded residual" and "undetectable" coincide.
- **Decision**: FIXED via Fix A — `supabase/migrations/20260805084000_assert_outcome_matches_tally.sql`
  adds `public.resolution_outcome_supported(uuid, text)` (`security definer`, calling
  `resolution_tally` so the threshold still appears exactly once) and an `EM014` clause in
  `assert_resolution_frozen`, placed **after** the `EM007` test so a permitted-but-unearned
  transition is refused as unearned while an impermissible one is still refused as impermissible.
  Verified against the local stack, every check inside a rolled-back transaction:

  | Check | Result |
  | --- | --- |
  | Administrator forges `open → passed` with 0 votes | `EM014` |
  | Administrator forges `open → rejected` with 0 votes | `EM014` |
  | `draft → passed` | still `EM007`, not `EM014` — precedence correct |
  | `draft → open` | still permitted |
  | Three real votes (7499 bps `za`) through `cast_vote` | flips to `passed`, `decided_at` set, **no** `EM014` |
  | Late vote on the resolution just decided | 0 rows, silently refused — neutral path intact |

  The local fixture is unchanged afterwards (4 resolutions with the same statuses, 7 vote rows).
  `npm run db:types` regenerated (+4 lines) and `npx astro sync && npm run lint && npm run build`
  all exit 0.

  **Not yet on production.** `20260804213630` is live there, so the hole is live there too; this
  migration must be applied with `npx supabase db push` **before** the merge that deploys the code.

### F2 — plan.md still prescribes the lock placement that deadlocks

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `context/changes/live-tally-and-outcome/plan.md:100-115`
- **Detail**: The plan's `Critical Implementation Details` still specifies
  `perform 1 from public.resolutions r where r.id = new.resolution_id for update;` inside the
  **after-insert** trigger. That version deadlocks against the composite foreign key's
  `FOR KEY SHARE` and was reproduced on the first attempt (40P01) before Phase 1 was committed;
  the implementation moved the lock into a new `before insert` trigger
  (`votes_lock_resolution` / `public.lock_resolution_for_outcome()`). The deviation is argued at
  length in the migration (`:245-283`) and recorded in `change.md`, but the plan — the artifact
  `/10x-archive` keeps — still reads as an instruction to do the thing that breaks.
- **Fix**: Add a short addendum under `Critical Implementation Details` stating that the lock
  moved to a `before insert` trigger and why, pointing at the migration's argument.
- **Decision**: FIXED — addendum added to `plan.md` under `Critical Implementation Details`,
  naming the deadlock, the reproduction, the `before insert` fix, and the migration lines that
  argue it, ending with "do not move the lock back into the after-trigger".

### F3 — Production carries the deciding trigger while the UI that explains it is unmerged

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: `context/changes/live-tally-and-outcome/plan.md:491` (Progress 4.7)
- **Detail**: The migration was applied to production on 2026-08-05, before the code, which is
  the order the plan and CLAUDE.md require. The consequence is a live window: production can now
  decide an uchwała, but the deployed UI still renders the pre-S-05 badge and would show an owner
  the dead `Za` / `Przeciw` buttons Phase 4 removes. It was safe when checked — all five
  production resolutions are `open` with no vote near the threshold, verified against the real
  project rather than the local one — but the window stays open until the PR merges, and nothing
  monitors it.
- **Fix**: Close the window: push, open the PR, let `ci.yml` go green, merge, then verify 4.7
  (`/api/health` → 200 and a production resolution showing its tally). Each step is a separate
  opt-in; the merge is the production deploy.
- **Decision**: PARTLY FIXED — `20260805084000_assert_outcome_matches_tally.sql` was applied to
  production on 2026-08-05, so the `EM014` hole is closed there ahead of the code. Verified
  against the real project rather than the local stack: five resolutions, all still `open` with
  `decided_at` null; `resolution_outcome_supported` deployed and answering `false` for a
  resolution with no votes; `/api/health` → `200 {"status":"ok","email":"ok"}`.
  **Still open**: row 4.7 stays pending until the PR merges and a production resolution is seen
  rendering its tally. The badge/dead-button window remains until then.

### F4 — A migration comment overstates what `cast_vote` cannot produce

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `supabase/migrations/20260804213630_resolution_outcome.sql:336-342`
- **Detail**: The comment says the non-`open` early return is unreachable from `cast_vote` —
  "cast_vote cannot produce this — it refuses to resolve a link whose resolution is not open — so
  this is the backstop for a future writer". Under `READ COMMITTED` it *is* reachable: `cast_vote`
  reads `r.status = 'open'` at `20260803090500:306`, then another transaction's deciding vote can
  commit before this one's insert clears `votes_lock_resolution`, so the after-trigger legitimately
  sees `passed`. The **code is correct** — it returns silently and the vote is recorded on a
  resolution already settled, which cannot change the outcome (the two sides sum to at most 10000).
  Only the comment's claim of unreachability is wrong, and it is the sentence a future reader would
  trust when deciding whether that branch still matters.
- **Fix**: Reword to say the branch is reachable in the commit race as well as by a future writer.
- **Decision**: SKIPPED — the code is correct either way, and `20260804213630` is already applied
  to production, so editing it now would put the file out of step with the database it produced.
  The correction is recorded here instead.

### F5 — Unplanned edit to `resolutions/new.astro`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: `src/pages/buildings/[id]/resolutions/new.astro`
- **Detail**: Its back link now points at `/buildings/<id>/resolutions` instead of the building
  page. Not listed in the plan's Changes Required, but a direct consequence of Phase 2 moving the
  list to its own route — leaving it would send an administrator back past the screen they came
  from. Benign; noted so the diff is fully accounted for.
- **Fix**: None needed — record it as in-scope consequence of Phase 2.
- **Decision**: ACCEPTED — an in-scope consequence of Phase 2 moving the list to its own route.
  No code change; the diff is fully accounted for.

## What was checked and found clean

- **The "What We're NOT Doing" list holds in full.** No `owner_id` in any vote projection on the
  administrator's page (`[resolutionId].astro:152` reads `id` with `head: true`); no change to
  `src/pages/api/vote/[token].ts`; no `PROTECTED_ROUTES` entry added; no TypeScript
  implementation of the threshold — `10000` and the `+1` appear only in
  `resolution_tally`; `votes_select_authenticated` untouched; no notification, no fanout, no
  audit screen, no deadline.
- **The neutral error model survives Phase 4.** `resolve_voting_link` filters `status <> 'draft'`
  (`20260803090500:427`), so a decided token resolves and the page renders the outcome from a
  column that function already returned — nothing was added to its return list. The three
  response headers are still set unconditionally before the token is resolved
  (`vote/[token].astro:61-63`), and the decided state is ordered before `pendingChoice`, so a
  stale `?wybor=` cannot reach a confirm screen for a vote that can no longer be cast.
- **No token reaches any new surface.** The settled page has no form and therefore no
  `action` attribute; the resolutions list and the tally panel read no token column.
- **The threshold arithmetic is exact and single-sourced.** `greatest(0, (10000 / 2 + 1) - …)` in
  integers, floored at zero, with the decision keyed on the missing figure reaching zero — so the
  trigger and the screen cannot disagree about where the bar is.
- **`describeResolutionStatus` fails safe** — unknown statuses render *Nieznany status* rather
  than defaulting to `open`, and the lookup uses `Object.hasOwn`, so `toString` and `__proto__`
  are unknowns rather than hits.
