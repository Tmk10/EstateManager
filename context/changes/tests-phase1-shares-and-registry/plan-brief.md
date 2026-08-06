# Phase 1 — the udział allocation oracle and the registry parse — Plan Brief

> Full plan: `context/changes/tests-phase1-shares-and-registry/plan.md`
> Research: `context/changes/tests-phase1-shares-and-registry/research.md`

## What & Why

`src/lib/shares.ts` and `src/lib/units-csv.ts` carry the two rules a wspólnota's whole result
rests on — how much of a building a lokal is worth, and whether a zarządca's registry file can
get into the system at all — and neither has a single test. This change writes them, with every
expected value taken from the PRD or from analysis of the call path, never from the module under
test.

## Starting Point

`context/changes/test-environment-bootstrap/` bought Vitest, pgTAP and both CI gates, and
deliberately stopped short of these tests. `context/foundation/test-plan.md` §3 Phase 1 reads
`not started` and means it literally: no risk in §2 is covered yet. Both modules are
dependency-free by design, so they are reachable from Vitest with no infrastructure — and the
repo contains no `.csv` file at all, so there are no fixtures to inherit.

## Desired End State

Two suites plus a contract test run green under `npm test`, and each test in them catches a
regression no other test catches. Deliberately breaking the allocator's denominator, or its
rounding, or the parser's newline handling, or its one-pass error collection, turns exactly the
relevant test red — verified by hand, mutation by mutation, after the phases land.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Allocation oracle | Sum **and** an independently computed floor/ceil bound | The sum alone stays green through a wrong denominator — the largest-remainder loop absorbs it | Research |
| Remainder rule | Left unpinned; determinism asserted instead | The PRD does not say who gets the extra basis point, and pinning it would be the anti-pattern Risk #2 names | Plan |
| Confirm-path property | Line-ending and BOM invariance, not byte stability | Preview and confirm parse different bytes; the form normalises newlines and the BOM is already gone | Research |
| Registry set | A table of named registries, not a generator | A failure names a building shape rather than a random array, and CI stays deterministic | Plan |
| Fixture home | `src/lib/units-csv.fixtures.ts`, built byte-wise | Versioned `.csv` files get silently normalised by editors and tooling, which breaks a fixture invisibly | Plan |
| Messy export | One fixture carrying all nine traits at once | That is what a real file is; nine isolated fixtures would be the near-identical copies the risk warns against | Plan |
| Error assertions | Line number plus the message's carrier fragment | Survives rewording, still catches "the message stopped naming the wiersz" | Plan |
| Knife-edge registry | In Phase 1, asserted on allocation only | The 50% comparison exists once, in SQL, and stays Phase 2's | Plan |
| Byte-stability comments | Corrected on this branch | The test and the comment it corrects belong in the same change | Plan |
| Formatters | Out of scope | The approved assertion set covers allocation and parse; widening it here was declined | Plan |

## Scope

**In scope:** a byte-wise fixture module; `src/lib/shares.test.ts`; `src/lib/units-csv.test.ts`;
`src/lib/units-template.test.ts`; a round-trip invariance group spanning both modules; two
comment corrections in `import.astro` and `units.ts`.

**Out of scope:** the 50% threshold, `EM003`, the owner collapse by e-mail, import atomicity,
RLS — all Phase 2's pgTAP suite; the remainder-distribution rule; `shares.ts`'s formatters; any
change to CI, coverage thresholds or npm scripts.

## Architecture / Approach

Fixtures first, because neither suite is honest without them and they are the infrastructure this
phase owes. Then each suite against oracles from outside its own module. Then the one assertion
that belongs to neither module alone — the same registry, presented six ways, yielding identical
rows and identical shares — which is what protects the confirm endpoint's
recompute-don't-trust-the-browser guarantee. The comment corrections land last, so the branch is
green as a pure test change before any production file is touched.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Fixture layer | `units-csv.fixtures.ts` — the messy export, newline/BOM variants, Windows-1250 bytes, single-defect files | A fixture that quietly contains an early-return defect asserts nothing about completeness |
| 2. Allocation oracle | `shares.test.ts` — sum, per-unit bound, determinism, refusals | Writing the bound in a way a reviewer reads as copied from `shares.ts:66` |
| 3. Registry parse | `units-csv.test.ts` + `units-template.test.ts` — the mess imports, refusals per class, completeness | Asserting full Polish sentences and pinning copy instead of behaviour |
| 4. Round-trip invariance | Six presentations, one result; the real preview → confirm path modelled | Drifting into a byte-equality assertion, which is the claim research disproved |
| 5. Comment corrections | Two comments state invariance instead of byte stability | Touching more than comments in production files |

**Prerequisites:** none — Vitest, the `@/*` alias and the CI gate already exist; no Docker, no
local stack.
**Estimated effort:** ~1–2 sessions across five phases, with a manual mutation pass at the end.

## Open Risks & Assumptions

- The remainder rule is unpinned on purpose, so one mutation in the manual pass is expected to
  kill nothing — a later reader may mistake that for a coverage gap.
- Refusing "Jan Kowalski" vs "JAN KOWALSKI" under one address blocks a whole import; both layers
  agree, so the tests pin it as it stands, and revisiting it means changing parser, migration and
  test together.
- The messy fixture is a claim about what real exports look like, built from the parser's failure
  taxonomy rather than from a file anyone actually received.

## Success Criteria (Summary)

- A file with the messiness of a real zarządca's export imports cleanly, and one written by
  Polish Excel in Windows-1250 is refused with a message saying so and saying what to do.
- A registry whose metraże force rounding still totals exactly 100%, and no lokal's udział
  strays from what its metraż earns.
- Breaking either module by hand turns exactly one test red — and the branch says out loud which
  rules it does *not* verify.
