<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: S-07 — Help module at /help

- **Plan**: none — this change was implemented without a `plan.md` by explicit user decision. Reviewed against the roadmap `S-07` entry (`context/foundation/roadmap.md` §S-07), which enumerates the deliverables, the content verbatim, and the scope risk, and therefore serves as the reference contract.
- **Scope**: whole change (single commit `2a7da99`, merged as `9b7d2983`)
- **Date**: 2026-08-02
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 2 observations

> **Reviewer independence caveat.** This review was produced by the same agent session that wrote the code. It is a self-review, and self-review is weakest exactly where the author's original judgement was wrong — an assumption that looked right while implementing tends to look right again while reviewing. F1 exists because the author's own scope call is the most likely thing to be wrong here; treat the absence of further findings as weaker evidence than an independent pass would give.

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

### Evidence behind the verdicts

**Plan Adherence (PASS)** — every item the roadmap specified is present and literal:

| Roadmap requirement | Actual |
|---|---|
| Own route `/help` | `src/pages/help.astro` |
| Exactly one sentence, verbatim | Renders `W przypadku problemów skontaktuj się z deweloperem: tomek.maq@gmail.com` |
| Address as a `mailto:` link | `href="mailto:tomek.maq@gmail.com"` |
| `/help` in `PROTECTED_ROUTES` | `src/middleware.ts:10` |
| Visible only when signed in | Verified on production, with controls |
| No modular infrastructure | No layout/registry/nav abstraction added |

**Success Criteria (PASS)** — `npm run lint` exit 0, `npm run build` exit 0. Behavioural verification on production (`estate-manager.estate-manager.workers.dev`): anon `/help` → 302 `/auth/signin`; anon `/dashboard` → 302 (protected control); anon `/` → 200 (public control); signed in `/help` → 200 rendering the sentence. The two controls are what make the 302 attributable to the new array entry rather than to any redirect.

## Findings

### F1 — Dashboard link is a fourth deliverable beyond the roadmap's enumerated three

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Scope Discipline
- **Location**: src/pages/dashboard.astro:18-31
- **Detail**: The roadmap's Risk field states the deliverable precisely: „`S-07` dowozi **jedną trasę, jedno zdanie i jeden wpis w tablicy**" — one route, one sentence, one array entry. The implementation added a fourth thing: a „Pomoc" link on `/dashboard`, which also required restructuring the existing „Budynki" anchor into a flex container. The roadmap names navigation as `S-09`'s job and names scope inflation („rozdmuchać do infrastruktury modułowej") as this slice's principal risk, so this is the exact axis the roadmap asked to be watched. The counter-argument the author applied: the Outcome says „administrator **wchodzi** do modułu", and with no link the module is reachable only by typing the URL, which arguably fails the Outcome. Both readings are defensible; the roadmap does not resolve it, and the author resolved it unilaterally at implementation time rather than raising it.
- **Fix A ⭐ Recommended**: Keep the link and record the deviation in the roadmap's S-07 entry as a one-line note.
  - Strength: The module is genuinely unreachable otherwise, so the Outcome sentence is only satisfied with it. Documenting closes the gap between the roadmap's enumerated deliverables and what shipped, which matters because the roadmap is the contract future reviews read.
  - Tradeoff: The precedent is that an implementer may add a nav affordance when a slice needs one — mildly erodes the S-09 boundary.
  - Confidence: HIGH — the code is already merged, deployed, and verified; this is a documentation reconciliation, not a code change.
  - Blind spot: Whether the product owner intended URL-only reachability for v1. Unverified — only they can say.
- **Fix B**: Remove the dashboard link, leaving `/help` reachable by URL only until S-09 builds navigation.
  - Strength: Restores strict literal adherence to the three enumerated deliverables and keeps all navigation decisions inside S-09.
  - Tradeoff: Ships a module no administrator will discover; requires a new branch, PR and production deploy to remove working, verified code.
  - Confidence: MEDIUM — hinges on whether the Outcome's „wchodzi" tolerates URL-only access, which is a product judgement, not a technical one.
  - Blind spot: Not checked whether the product owner would consider an undiscoverable Help module to have delivered S-07 at all.
- **Decision**: FIXED via Fix A — link kept; deviation recorded in the roadmap's S-07 entry (2026-08-02).

### F2 — Roadmap still records S-07 as `proposed` after it shipped to production

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence (documentation)
- **Location**: context/foundation/roadmap.md:54 (At a glance row), context/foundation/roadmap.md:241 (`**Status:** proposed`)
- **Detail**: The change is merged (`9b7d2983`) and verified live, but both places the roadmap records S-07's status still say `proposed`. Every other shipped slice reads `done (2026-08-02)` and carries a `**Zrealizowane:**` line summarising the outcome (see S-01 at line 140-141). Two concrete consequences: `S-09` lists `S-07` as a prerequisite, so its readiness cannot be computed correctly from the roadmap; and `/10x-archive` keys off `Change ID` plus status. Left as-is deliberately during implementation, pending user direction, so this finding is a reminder rather than a surprise.
- **Fix**: On a `docs/` branch and PR, set S-07's status to `done (2026-08-02)` in both the At a glance table and the S-07 block, and add a `**Zrealizowane:**` line recording the route, the `PROTECTED_ROUTES` entry, and the production verification — matching S-01's format. Also flip the Backlog Handoff row (line 285) to `zrobione`.
- **Decision**: FIXED — roadmap S-07 set to `done (2026-08-02)` in all three places, with a `**Zrealizowane:**` line (2026-08-02).

### F3 — `PROTECTED_ROUTES` prefix matching makes `/help` claim every path starting with that string

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/middleware.ts:10,24
- **Detail**: The gate matches with `startsWith`, so the new `"/help"` entry also silently protects any future route whose path begins with that literal string — `/helpdesk`, `/help-public`, `/helpline`. This is **pre-existing design, not introduced by this change**: `/buildings` behaves identically, the file comment documents the behaviour, and it is currently harmless because no such route exists. It is recorded because the failure mode is the invisible one the roadmap warned about — a route silently gaining or lacking auth is not visible on screen — and because `S-09` will add routes while touching this array. No action recommended now.
- **Fix**: None now. If a public `/help…` sibling is ever added, switch the predicate to exact-or-segment matching (`p === route || p.startsWith(route + "/")`) rather than adding an exception.
- **Decision**: ACCEPTED — pre-existing design, harmless today. Revisit only if a public `/help…` sibling is added; tighten the predicate rather than add an exception.

### F4 — Polish content served under `lang="en"`

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/layouts/Layout.astro:15
- **Detail**: `Layout.astro` hardcodes `<html lang="en">` while this page — like every other product screen — is Polish. Screen readers select pronunciation rules from this attribute, so Polish text is read with English phonetics. **Pre-existing and not introduced by this change**; `/help` is simply one more page inheriting it. Out of scope for S-07, and it belongs with the bilingual-UI cleanup the roadmap already parked at S-01 („interfejs jest teraz dwujęzyczny… świadomie zostawione jako osobne zmiany").
- **Fix**: None here. Fold into the bilingual-UI change or into `S-09`, which touches every screen anyway.
- **Decision**: DEFERRED — folded into the parked bilingual-UI change (roadmap S-01 „Do przemyślenia poza tym kawałkiem") / S-09.
