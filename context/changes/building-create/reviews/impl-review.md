<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Building Create Implementation Plan

- **Plan**: `context/changes/building-create/plan.md`
- **Scope**: Phases 1–4 of 4 (full plan; Progress 34/34 `[x]`)
- **Date**: 2026-08-02
- **Verdict**: NEEDS ATTENTION → triaged 2026-08-02 (2 fixed, 4 skipped)
- **Findings**: 0 critical, 3 warnings, 3 observations

## Triage outcome (2026-08-02)

| Finding | Decision |
|---|---|
| F1 — raw Postgres error text reaches the user | SKIPPED |
| F2 — no length bound in the database | SKIPPED |
| F3 — roadmap.md marks S-01b as not ready | FIXED |
| F4 — insert payload not actually type-checked | SKIPPED |
| F5 — `SupabaseClient` export has no consumers | SKIPPED |
| F6 — unique constraint is case-sensitive | FIXED |

Triage ran in the worktree `.claude/worktrees/building-create-review-fixes`
(branch `worktree-building-create-review-fixes`), per the branching rule updated in
`CLAUDE.md` on the same day.

**Open action — F6 is not live.** `supabase/migrations/20260802063954_buildings_case_insensitive_unique.sql`
is applied and exercised on the **local** stack only. Production still enforces the
exact-text constraint until someone runs `npx supabase db push` from a linked checkout
(residual G14 — nothing in CI applies migrations). No code depends on the change, so the
usual migration-before-code ordering is not at stake here.

Verification performed on the fix:

| Check | Result |
|---|---|
| Migration parsed and applied (rolled back) against local Postgres | `ALTER TABLE` / `CREATE INDEX` / `COMMENT` all OK |
| Case variant `('WSPÓLNOTA … KWIATOWA 3','warszawa','kwiatowa 3')` | rejected `23505` — so the endpoint's Polish duplicate message still fires |
| Same name, different city (`Kraków`) | `INSERT 0 1` — the constraint's original intent preserved |
| `npx supabase migration up --local` | applied; `pg_indexes` now shows `buildings_name_city_street_lower_key`, old constraint gone |
| `npm run db:types` | no diff — index-only migration does not move generated types |
| `npx astro sync && npm run lint && npm run build` | all pass |

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Nothing here blocks. The slice is live, RLS is correct on every operation × role, route
protection was re-verified against production during this review, and all three build gates
(`astro sync`, `lint`, `build`) are green. The three warnings are cheap, additive follow-ups.

### Evidence re-run during this review

| Check | Result |
|---|---|
| `npx astro sync` | pass — types generated |
| `npm run lint` | pass — 0 errors (only `astro-eslint-parser` `projectService` notices) |
| `npm run build` | pass — server built in 3.21s |
| `GET https://estate-manager.estate-manager.workers.dev/buildings` signed out | `302 → /auth/signin` |
| `GET /api/health` (production) | `{"status":"ok","email":"ok"}` |

Migration, seed, generated types, client parameterization, middleware entry, endpoint, form
island, both pages and the dashboard link all match their contracts. All eight "What We're NOT
Doing" guardrails hold. The 10-line change to `context/foundation/prd.md` is outside Phase 4's
file list but legitimate: it is the FR-011 address split, landed in the Phase 1 commit
`52b3e11` and documented in the commit message, `plan.md:229-238`, `change.md`, and
`roadmap.md:135`.

## Findings

### F1 — Raw Postgres error text reaches the user in two places

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/pages/api/buildings/index.ts:52`, `src/pages/buildings/index.astro:36`
- **Detail**: The plan's contract for the endpoint was that a unique violation is "translated
  to a Polish message … rather than surfacing the raw Postgres error." `23505` is translated,
  but every other error path passes `error.message` through verbatim — into a URL query
  parameter on the endpoint, and into rendered page text on the list. A failure such as an
  RLS denial or a check-constraint violation surfaces as
  `new row for relation "buildings" violates …` — English, and naming internal constraint and
  table identifiers. This breaks the project's Polish-user-facing-copy rule and leaks schema
  detail. The choice is deliberate and commented (`index.ts:47-48`), which is why this is a
  warning rather than a defect, but the rationale conflicts with a standing convention.
- **Fix**: Map unexpected errors to one generic Polish message ("Nie udało się zapisać budynku.
  Spróbuj ponownie.") and keep the detail server-side via `console.error`. Same treatment for
  the list page's load failure.
  - Strength: Restores the Polish-copy rule at both sites, closes the disclosure, and loses
    nothing — the operator still sees the real message in Worker logs.
  - Tradeoff: Debugging an unfamiliar failure now needs a log lookup instead of a glance at
    the URL bar.
  - Confidence: HIGH — both call sites are three lines each and the Polish-copy rule is
    explicit in `CLAUDE.md`.
  - Blind spot: `src/pages/api/auth/signin.ts:16` does the same thing with GoTrue messages, so
    fixing only `buildings` leaves the codebase briefly inconsistent.
- **Decision**: SKIPPED — admin-only surface; the passthrough is deliberate and commented at index.ts:47-48. Revisit if the same shape spreads to an owner-facing screen.

### F2 — No length bound in the database, though the migration claims a backstop

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `supabase/migrations/20260801222109_create_buildings.sql:40-45`
- **Detail**: The three `length(trim(...)) > 0` checks are commented as "the backstop for
  anything that reaches the table by another path" — but the 200-character bound
  (`MAX_LENGTH`) exists only in `src/pages/api/buildings/index.ts:6` and
  `src/components/buildings/BuildingForm.tsx:16`. Any writer that is not this endpoint —
  Studio, the `S-01b` import, a future endpoint — can insert unbounded text into `name`,
  `city` or `street`, which `/buildings` then renders. The backstop is half-built: blankness
  is enforced at the table, length is not.
- **Fix**: Add `check (length(name) <= 200)` (and city, street) in a new additive migration —
  exactly the extensibility shape FR-011 guarantees.
  - Strength: Makes the DB the single authority for both invariants instead of one of two;
    `S-01b`'s bulk import inherits it for free rather than re-implementing the bound.
  - Tradeoff: One more migration to apply by hand against production (residual G14).
  - Confidence: HIGH — the table is nearly empty, so the constraint validates instantly.
  - Blind spot: Not verified whether any production row already exceeds 200 characters; a
    `select max(length(name)) …` should precede the push.
- **Decision**: SKIPPED — the endpoint is currently the only writer. Reconsider when S-01b adds a bulk import path that bypasses it.

### F3 — `roadmap.md` still marks S-01b as not ready to plan

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `context/foundation/roadmap.md:229`
- **Detail**: Phase 4's contract required that "`S-01b` becomes ready." Its own row in the
  Backlog Handoff table still reads `no | Wymaga S-01`, while the S-01 row directly above it
  (line 228) was correctly updated to `zrobione — Wdrożone na produkcję 2026-08-02`. S-01b's
  only prerequisite is now satisfied. This is the one contracted item in the plan that was
  silently skipped, and the roadmap is what the next `/10x-plan` reads to decide what is
  pickable.
- **Fix**: Set the S-01b readiness cell to `yes` and replace `Wymaga S-01` with a note that
  the prerequisite landed on 2026-08-02.
- **Decision**: FIXED — roadmap.md:229 readiness flipped to `yes` with a note that S-01 landed 2026-08-02.

### F4 — The insert payload is not actually type-checked

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: `src/pages/api/buildings/index.ts:21,40-44`
- **Detail**: `values` is declared `Record<string, string>`, and `tsconfig.json` extends
  `astro/tsconfigs/strict`, which does not enable `noUncheckedIndexedAccess`. So `values.name`
  types as `string` whether or not the loop ever assigned it — a rename in the `FIELDS` array
  would compile clean and insert `undefined`. Phase 2's stated payoff was that "a wrong column
  in an insert/update payload is a compile error" (`plan.md:315-320`); that guarantee covers
  the *keys* of `.insert({...})` but is defeated on the *values* side by the untyped bag. This
  is the one place in the change where the new `Database` type does less work than the plan
  assumed.
- **Fix**: Type the accumulator to the field union — `Record<(typeof FIELDS)[number]["key"], string>`
  — or read the three fields explicitly instead of looping into a bag.
- **Decision**: SKIPPED — three fields, one call site.

### F5 — `export type SupabaseClient` has no consumers

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: `src/lib/supabase.ts:30`
- **Detail**: Contracted by the plan and correctly implemented, but `grep -rn SupabaseClient src/`
  returns only the declaration. Nothing imports it. It is forward-looking scaffolding for
  `S-01b`, shipped ahead of its consumer — worth noting so it is either used or dropped rather
  than quietly accumulating.
- **Fix**: Leave it and use it in `S-01b`'s import service; delete it if `S-01b` ends up not
  passing a client around.
- **Decision**: SKIPPED — left in place for S-01b.

### F6 — The unique constraint is case- and whitespace-sensitive

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `supabase/migrations/20260801222109_create_buildings.sql:49`
- **Detail**: `unique (name, city, street)` compares raw text, so `Kwiatowa 3`, `kwiatowa 3`
  and `Kwiatowa  3` are three distinct rows. The plan justified splitting the address on the
  grounds that a single free-text field defeats the unique constraint
  (`migration:27-30`) — splitting fixes *ordering* variants, but casing and internal spacing
  still slip through. The constraint's stated purpose (catching an accidental double submit)
  is unaffected, since a double submit is byte-identical; this only matters once two people
  enter the same building by hand.
- **Fix**: If it ever matters, a unique index on `(lower(name), lower(city), lower(street))`
  replaces the constraint — additive, and cheap while the table is small. Not worth doing now
  for a single-building v1.
- **Decision**: FIXED — new migration supabase/migrations/20260802063954_buildings_case_insensitive_unique.sql swaps the exact-text constraint for a unique index on (lower(name), lower(city), lower(street)). Applied and exercised locally; NOT yet applied to production.
