---
date: 2026-08-06T10:51:46+0200
researcher: Tomek Kościelniak
git_commit: b2829de952c31c4fb80f491e972cd73f9147be5f
branch: chore/tests-phase1-shares-and-registry
repository: EstateManager
topic: "Phase 1 unit-test oracles for Risk #2 (allocation half) and Risk #8 (parse half)"
tags: [research, codebase, shares, units-csv, test-plan, phase-1]
status: complete
last_updated: 2026-08-06
last_updated_by: Tomek Kościelniak
---

# Research: Phase 1 unit-test oracles for Risk #2 (allocation) and Risk #8 (parse)

**Date**: 2026-08-06T10:51:46+0200
**Researcher**: Tomek Kościelniak
**Git Commit**: b2829de952c31c4fb80f491e972cd73f9147be5f
**Branch**: chore/tests-phase1-shares-and-registry
**Repository**: EstateManager

## Research Question

For Risk #2 (allocation half) and Risk #8 (parse half) of `context/foundation/test-plan.md` §2,
establish three things each, so Phase 1's unit tests can be written:

1. Where the risk actually passes through code — file / function / module.
2. What behaviour would prove protection, derived from analysis and the PRD rather than from
   the shape of the implementation.
3. What the cheapest test is that catches the risk.

Out of scope by decision: the atomicity half of #8 and the threshold half of #2. Both are
database behaviour and belong to Phase 2's contract suite.

## Summary

The test plan's hypothesis holds for both halves. `computeShareBps` in `src/lib/shares.ts` is
the only place a udział is allocated, and `parseUnitsCsv` in `src/lib/units-csv.ts` is the only
place registry bytes become rows. Both are pure, dependency-free and reachable from Vitest with
no infrastructure, so the cheapest layer really is unit.

Three findings change what the tests should assert:

**The 100% assertion is not sufficient on its own, and there is a mutation that proves it.**
"The shares sum to 100%, therefore each share is right" is the inference the risk guidance tells
us to challenge, and it is false here in a demonstrable way: replacing the denominator with
`totalArea + 1` shrinks every base share, grows the leftover, and the largest-remainder loop
still lands the total on exactly 10000. A test asserting only the sum stays green through a
wrong denominator — which is one of the two routes the risk names. The assertion that catches it
is a per-unit bound derived from FR-006, computed independently in the test.

**The determinism property is not the one the source claims, and the difference is testable.**
The confirm endpoint's security argument is that it re-parses and recomputes rather than trusting
the shares a browser posts back (`src/pages/api/buildings/[id]/units.ts:49-59`). Two comments say
this rests on the round trip being byte-stable. It is not: the CSV travels back through
`<input type="hidden">`, and HTML form submission normalises every lone LF and lone CR in a
submitted value to CRLF, while the preview's `TextDecoder` has already dropped the BOM the
original bytes carried. Preview and confirm therefore parse **different bytes** for the same
upload. The property survives because `splitRecords` is newline-agnostic and the parser strips a
BOM that is no longer there — so what protects the confirm path is line-ending and BOM
*invariance*, not byte stability. That is a different assertion, and the right one.

**Template drift is closed for headers and the separator, open for everything a data row needs.**
The template is generated from `CSV_HEADERS.join(CSV_SEPARATOR)`, so those cannot disagree. But
the template is headers-only by design — it carries no example row — so the decimal comma and the
BOM agree between template and parser by two independent decisions rather than by construction.

## Detailed Findings

### Risk #2, allocation half — where it passes through code

`computeShareBps(areaHundredths: number[]): ShareResult` — `src/lib/shares.ts:39`. Confirmed as
the only allocator in the codebase; a repo-wide search for the symbol returns two call sites and
one comment.

| Caller | Line | Role |
| --- | --- | --- |
| `src/pages/buildings/[id]/units/import.astro` | 120 | preview only — renders shares, writes nothing |
| `src/pages/api/buildings/[id]/units.ts` | 59 | the write path — recomputes, then hands `share_bps` to the RPC |

What is **not** here, and must stay out of Phase 1:

- **The per-owner aggregation.** PRD:236-244 rules that one owner voting with several lokale
  casts one vote carrying the sum of their units' shares. `computeShareBps` allocates per *unit*;
  the collapse to an owner happens in SQL (`import_building_units`, keyed on
  `lower(btrim(email))` — `supabase/migrations/20260802094500_import_units_single_owner_name.sql`).
  Phase 2.
- **The 100% backstop.** `assert_building_registry` raises `EM003` when a building's shares do not
  total 10000 bps (`supabase/migrations/20260802101500_registry_assertion_security_definer.sql:83`).
  The same rule is enforced in two independent places; the unit test pins the TypeScript half.
- **The snapshot rule.** `votes.share_bps` outranks any recomputation
  (`supabase/migrations/20260804213630_resolution_outcome.sql:223`). Database behaviour, Phase 2.

### Risk #2 — what behaviour would prove protection

Three assertions, each with an oracle that lives outside `shares.ts`.

**A. The shares total exactly 10000 bps, for any registry.**

Oracle: PRD `## Success Criteria`:131 — "Suma udziałów wszystkich lokali w budynku daje 100%".
Stated as a product property, independent of any module, and independently enforced by `EM003`.

**B. Every unit's share is one of the two integers adjacent to its exact proportional value** —
`floor(area × 10000 / total)` or that value plus one.

Oracle: FR-006 — "System wylicza udział każdego lokalu z jego metrażu i waży nim oddany głos" —
combined with A. If a share is proportional to floor area and the total must be exactly 100%, then
each unit's share can only be its exact proportional value rounded down or up; anything further
away is not proportional to metraż any more. The test computes both bounds itself, in integer
arithmetic, from the areas — **it never asks `shares.ts` what the answer should be**. This is the
independent oracle CLAUDE.md records as missing.

B is what makes the suite catch a wrong denominator, and A alone does not:

| Mutation of `shares.ts` | Assertion A (sum) | Assertion B (bounds) |
| --- | --- | --- |
| `totalArea` → `totalArea + 1` at `:66` | still green — leftover absorbs it | **red** |
| leftover handed out by file order instead of largest remainder (`:78-84`) | still green | still green |
| `Math.floor` → `Math.round` at `:66` | still green | **red** for some registries |

The middle row is the honest limit of what the PRD can pin — see Open Questions.

**C. Line-ending and BOM invariance across the preview → confirm round trip.**

The security property that needs protecting is at `src/pages/api/buildings/[id]/units.ts:49-59`:
the endpoint re-parses the CSV text and recomputes the shares, so a client that edited the shares
in the preview cannot assign its own lokal any voting weight it likes. That only holds if the
second parse agrees with the first.

The path the bytes actually take:

1. `import.astro:114` — the uploaded file's bytes, exactly as received, are parsed.
2. `import.astro:141` — those bytes are decoded with `new TextDecoder("utf-8")`, which drops a
   leading BOM by default.
3. `import.astro:228` — the text is carried in `<input type="hidden" name="csv" value={previewCsv} />`.
4. `units.ts:54` — the submitted string is re-encoded with `TextEncoder` and parsed again.

Step 3 is where the assumption breaks. The HTML form-submission algorithm normalises newlines in
every submitted value: a lone LF and a lone CR each become CRLF. So an LF-only upload is parsed as
LF at preview and as CRLF at confirm, and a BOM present in step 1 is absent by step 4.

Both source comments describe this as byte-stable:

- `import.astro:139-140` — "the round trip is byte-stable either way"
- `units.ts:52-53` — "re-parses and recomputes from exactly these bytes ... the same bytes must
  yield the same shares"

The conclusion those comments reach is correct and the reasoning is not. The parses agree because
`splitRecords` treats CRLF, LF and CR identically as record terminators (`units-csv.ts:134-141`)
and normalises them identically inside quoted fields (`:106-116`), and because the parser strips a
BOM if one is there and does nothing if it is not (`:252-253`). So the assertion that protects the
confirm path is:

> The same registry, presented with LF, with CRLF, with CR, and with or without a BOM, yields
> identical rows and identical shares.

This is an oracle from analysis of the call path, not from the shape of either module, and it is a
materially different test from the one "byte-stable" implies. It is also the assertion that would
fail first if anyone "simplified" the newline handling in `splitRecords`.

**Edge cases the risk implies** (`test-plan.md` §2 #2: "rounding or a wrong denominator"):

- Areas that force rounding — three equal units share 10000, exact value 3333.33 each; A + B force
  3333 / 3333 / 3334 in some order without naming which.
- A knife-edge registry — two owners each within a basis point of half the building. The risk is an
  uchwała "declared podjęta or upadła against udziały that do not reflect the electorate", so a
  1 bp misallocation at exactly this boundary is the failure in its purest form.
- One unit — the whole building, 10000.
- The zero-share refusal (`shares.ts:97-104`). A lokal whose fair share rounds to zero is refused
  with a Polish sentence naming its position. Oracle: FR-006 gives every lokal a share that weighs
  a vote, and `units_share_positive` agrees at the database.
- Non-positive and non-integer areas (`shares.ts:46-48`).

### Risk #2 — cheapest test

Vitest unit test at `src/lib/shares.test.ts`. `shares.ts` imports nothing, touches no I/O and is
already collected by `vitest.config.ts`. No Docker, no local stack. This matches the guidance's
"unit for the allocation (pure, no infrastructure)" and `test-plan.md` §3 Phase 1.

### Risk #8, parse half — where it passes through code

`parseUnitsCsv(bytes: Uint8Array): ParseResult` — `src/lib/units-csv.ts:248`. The only parser;
same two callers as above (`import.astro:115`, `units.ts:54`). Supporting surface: the template
generator at `src/pages/api/buildings/units-template.csv.ts:30`.

### Risk #8 — the template-drift question, answered

The module claims template and parser cannot drift (`units-csv.ts:16-19`,
`units-template.csv.ts:7-10`). Verified, with a boundary:

- **Closed by construction.** The template body is `${BOM}${CSV_HEADERS.join(CSV_SEPARATOR)}\r\n`
  (`units-template.csv.ts:30`); the parser validates the header against the same `CSV_HEADERS`
  (`units-csv.ts:177,188`) and splits on the same `CSV_SEPARATOR` (`:128`). Renaming a column
  renames both.
- **Not closed.** The template deliberately carries no example row (`units-template.csv.ts:12-15`),
  so the two conventions a *data* row depends on — the decimal comma (`units-csv.ts:224`) and the
  BOM (`units-template.csv.ts:27` writing it, `units-csv.ts:252-253` stripping it) — agree because
  two decisions happen to match, not because they share a source.

This gives a test that pins exactly the guaranteed part without falling into the named
anti-pattern of round-tripping the project's own template as the happy path: **feed the template
endpoint's bytes to the parser and assert the "header only, no data rows" refusal**
(`units-csv.ts:314-323`), not a header error. That proves the two agree on names, separator and
BOM, and asserts nothing about whether the parser can read a real file.

### Risk #8 — what behaviour would prove protection

Oracles: FR-001 (an administrator can import a list of lokale with metraż and owners), FR-011,
PRD `## Non-Goals` (no registry editing in v1, so a refusal must be legible and must leave the
budynek importable), and PRD:236-244 (one owner is identified by e-mail address — which is what
makes one address across several lokale a case that must *succeed*).

**The messy-export fixture.** `find` over the repo returns no `.csv` file at all, so there is no
pre-authored fixture to inherit the "it was written alongside the parser" problem from. The fixture
must be built byte-wise from what a Polish zarządca's export actually contains:

| Characteristic | Handled at | Must |
| --- | --- | --- |
| BOM `EF BB BF` | `:252-253` | import cleanly |
| `;` separator | `:23,128` | import cleanly |
| decimal comma `52,40` | `:224,227` | import cleanly |
| CRLF terminators | `:134-141` | import cleanly |
| Polish diacritics in `imie_nazwisko` | `:257` (fatal decode) | import cleanly |
| trailing blank rows | `:298-300` | be ignored |
| one e-mail across several lokale, identical name | `:346,428-439` | import cleanly |
| quoted field containing `;` and a doubled `""` | `:96-104,122-127` | import cleanly |
| Windows-1250 bytes | `:257-273` | be refused, naming the encoding and the fix |

The last row is the one a real zarządca hits most often — Polish Excel's default "CSV" is
Windows-1250 — and it is the case a fixture authored from the template can never produce.

**Which refusals name the offending line, and which cannot.** Read out of the failure taxonomy:

| Names a real line | Where |
| --- | --- |
| duplicate unit number — names **both** lines | `:380-383` |
| one e-mail, two names — names **both** lines | `:434-437` |
| wrong field count | `:356-361` |
| blank row in the middle | `:351-353` |
| per-field validation (number, metraż, name, e-mail) | `:371-423` |
| unclosed quote — names the line the quote opened on | `:281-293` |

| Reports `line: 1` regardless | Why it is legitimate |
| --- | --- |
| failed UTF-8 decode | `:262-272` — line numbers are meaningless once the bytes did not decode |
| empty file | `:303` |
| header only, no data rows | `:314-323` |
| more than `MAX_ROWS` rows | `:325-335` |
| header defects | `:182,190,198` — the header *is* line 1 |

So "refused with a message naming the offending line" is real but conditional, and a test must
assert it per class of defect rather than universally. The distinction comes from reading the
failure taxonomy, not from the parser's shape — it is an oracle, not an implementation detail.

**Completeness of the error list.** One pass must report *everything* wrong with the file
(`:6-8`, and `:369-370` — "Every check below runs regardless of what failed before it"). The
justification is recoverability: the screen does not remember the upload, so an administrator told
about one typo at a time makes seven round trips. A file carrying three unrelated defects must come
back with three errors. Strong behavioural assertion, and an obvious mutation target (`continue` →
`break` at `:353,362`).

**Edge case that belongs to the parse half of "a refused import leaves the budynek unusable".**
The atomicity half is Phase 2, but the reachable half here is that a refused parse writes nothing:
`parseUnitsCsv` is pure, and `units.ts:55-57` returns before the RPC is ever called. The unit layer
can assert that the parse is total — every rejection path returns `{ ok: false }` with at least one
error rather than throwing — which is what makes the "nothing was written" claim structural.

**One asymmetry worth a decision.** The same-e-mail-different-name refusal compares names with
`first.fullName !== fullName` after trimming (`:433`), and the database backstop uses
`count(distinct btrim(full_name)) > 1` (migration `20260802094500`). The two agree exactly — but
both mean "Jan Kowalski" and "JAN KOWALSKI" at the same address refuse the whole file. See Open
Questions.

### Risk #8 — cheapest test

Vitest unit test at `src/lib/units-csv.test.ts`, feeding `Uint8Array` literals built in the test.
`units-csv.ts` imports nothing (`:9-11`). No infrastructure.

## Code References

- `src/lib/shares.ts:39` — `computeShareBps`, the only allocator
- `src/lib/shares.ts:66` — the single division that is both quotient and remainder; the denominator
- `src/lib/shares.ts:77-88` — largest-remainder distribution, file-order tie-break
- `src/lib/shares.ts:97-104` — the zero-share refusal
- `src/lib/units-csv.ts:248` — `parseUnitsCsv`, the only parser
- `src/lib/units-csv.ts:69-154` — `splitRecords`; newline-agnostic, which is what makes the round trip safe
- `src/lib/units-csv.ts:223-232` — `parseAreaHundredths`, decimal comma, no float
- `src/lib/units-csv.ts:252-273` — BOM strip and fatal UTF-8 decode
- `src/pages/api/buildings/[id]/units.ts:49-59` — recompute-don't-trust-the-browser, with the byte-stability claim
- `src/pages/buildings/[id]/units/import.astro:141` — `TextDecoder` drops the BOM
- `src/pages/buildings/[id]/units/import.astro:228` — the hidden input the CSV travels through
- `src/pages/api/buildings/units-template.csv.ts:30` — template generated from the parser's constants
- `supabase/migrations/20260802101500_registry_assertion_security_definer.sql:83` — `EM003`, the 100% backstop
- `supabase/migrations/20260802094500_import_units_single_owner_name.sql` — owner collapse by e-mail, `EM005`

## Architecture Insights

- **Both modules are dependency-free on purpose**, and both say so in their own headers
  (`shares.ts:15-18`, `units-csv.ts:9-11`). That is what makes Phase 1 cheap, and it is a property
  worth not breaking — the same rule CLAUDE.md records for `src/lib/ui.ts`.
- **Integers end to end.** Areas arrive as hundredths of m², shares leave as basis points, and the
  value crossing into `numeric(8,2)` is built by slicing rather than dividing
  (`shares.ts:137-141`). No float touches a udział anywhere in the path.
- **Rules are enforced twice, at different layers, on purpose** — the sum-to-100% rule
  (TypeScript + `EM003`), the one-address-one-person rule (parser + `EM005`). The parser's job is
  the message with line numbers; the database's job is that a caller bypassing the UI cannot store
  what the parser refuses. Phase 1 pins the first half; Phase 2 pins the second.

## Historical Context (from prior changes)

- `context/changes/test-environment-bootstrap/` — bought both harnesses and both CI gates and
  deliberately stopped short of these tests, recording that "Phase 1's udział-allocation oracle
  (Risk #2) and its real-world registry fixtures (Risk #8 parse half) are not written here".
- `src/lib/smoke.test.ts:7` — the smoke test names this exact gap in a comment: the test Phase 1
  exists to buy "must assert `computeShareBps` against an independent oracle".
- `supabase/migrations/20260802094500_import_units_single_owner_name.sql` — S-01b implementation
  review found `import_building_units` silently collapsing two names behind one address and
  keeping the first; the fix was to refuse rather than resolve, in both layers.

## Related Research

None — this is the first research artifact for a Phase 1 test change.

## Open Questions

1. **Does the leftover-allocation rule get pinned, or recorded as unpinned?** The PRD says shares
   come from metraż and total 100%. It does **not** say the leftover basis points go to the largest
   remainders, nor that ties break by file order. That is an implementation decision
   (`shares.ts:77-88`), and CLAUDE.md records it as a hazard because the confirm path depends on its
   determinism. Asserting "the unit at index 2 received the extra basis point" pins the algorithm and
   is the anti-pattern the guidance names. Asserting "identical input yields identical output" pins
   the property the confirm path actually relies on, and lets the algorithm change. A product call.
2. **Do the two byte-stability comments get corrected in this change?** `import.astro:139-140` and
   `units.ts:52-53` state a reason that is not what happens. The conclusion is right, so nothing is
   broken — but a future reader who trusts "byte-stable" could remove the newline handling that is
   actually load-bearing. Fixing them is a two-line docs change inside a test-only branch: in scope
   or a separate `fix/`?
3. **Is refusing "Jan Kowalski" vs "JAN KOWALSKI" at one address correct?** Both layers compare
   exact strings after trimming, so they agree — but the refusal blocks a whole import over letter
   case. Loosening it would need both layers changed together, and it is a product decision about
   what "one address, one person" means, not a test decision.
4. **How near the threshold should the knife-edge fixture sit?** A registry engineered so one
   basis point decides whether 50% is crossed is the sharpest possible test of Risk #2, but the
   threshold comparison itself is Phase 2. Phase 1 can only assert the allocation feeding it. Worth
   confirming that a Phase 1 fixture built for the knife edge is not quietly asserting Phase 2's rule.
