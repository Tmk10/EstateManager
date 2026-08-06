# Phase 1 — the udział allocation oracle and the registry parse

## Overview

Two Vitest suites, plus the fixture layer that makes them possible, pinning the two halves of
`context/foundation/test-plan.md` §3 Phase 1: the share allocation in `src/lib/shares.ts`
(Risk #2, allocation half) and the registry parse in `src/lib/units-csv.ts` (Risk #8, parse
half).

The constraint that shapes every assertion: **the expected value comes from the PRD or from
analysis of the call path, never from the module under test.** A test whose oracle is lifted
out of `shares.ts` proves only that `shares.ts` computes what `shares.ts` computes — which is
the gap `src/lib/smoke.test.ts:7` and CLAUDE.md both name.

## Current State Analysis

**Both modules are untested and both are dependency-free.** `shares.ts` and `units-csv.ts`
import nothing, touch no I/O, and are already collected by `vitest.config.ts`
(`include: ["src/**/*.test.ts"]`, `environment: "node"`). The cheapest layer really is unit —
no Docker, no local stack, no Astro pipeline.

**The runner exists; the fixtures do not.** `context/changes/test-environment-bootstrap/`
bought Vitest and pgTAP and both CI gates, and recorded that it deliberately stopped short of
these tests. A `find` over the repo returns **no `.csv` file at all** — there is nothing to
inherit, and nothing to inherit the "it was written alongside the parser" problem from.

**Three findings from research change what the tests assert** (`research.md`):

1. **Sum-to-100% is not sufficient on its own.** Replacing the denominator at `shares.ts:66`
   with `totalArea + 1` shrinks every base share, grows the leftover, and the
   largest-remainder loop still lands the total on exactly 10000. A suite asserting only the
   sum stays green through a wrong denominator — one of the two failures Risk #2 names.
2. **The confirm path's stated safety property is not the real one.** Preview and confirm
   parse *different bytes*: the CSV travels back through `<input type="hidden">`
   (`import.astro:228`), and HTML form submission normalises every lone LF and lone CR to
   CRLF, while the preview's `TextDecoder` (`import.astro:141`) already dropped the BOM. What
   protects `units.ts:49-59` is line-ending and BOM **invariance**, not byte stability.
3. **"Refused with a message naming the offending line" is real but conditional.** Six defect
   classes name a real line; five report `line: 1` by construction (failed decode, empty file,
   header-only, over `MAX_ROWS`, header defects — the header *is* line 1). A test must assert
   this per class, not universally.

**One thing verified beyond research, because a phase depends on it.** The template is not an
exported constant — it is built inside the `GET` handler
(`src/pages/api/buildings/units-template.csv.ts:29-30`). A throwaway probe confirmed the module
imports cleanly under Vitest (the `astro` import is type-only and erases; `environment: "node"`
provides `Response`), the handler runs with no context, and its bytes reach `parseUnitsCsv`.

## Desired End State

`npm test` runs two new suites, green, and each test in them catches a regression no other test
catches. Deliberately mutating `shares.ts` or `units-csv.ts` turns exactly the relevant test
red — that is the acceptance bar, and it is exercised by hand after the phases land, not
automated here.

Verified by: `npm run lint && npm test && npm run build`, and by reading each test for whether
its expected value could have been copied out of the module it exercises.

### Key Discoveries:

- `src/lib/shares.ts:39` — `computeShareBps`, the only allocator; two call sites
  (`import.astro:120` preview, `units.ts:59` write path)
- `src/lib/shares.ts:66` — the single division that is both quotient and remainder; the
  denominator a mutation would attack
- `src/lib/shares.ts:77-88` — largest-remainder distribution with a file-order tie-break.
  **Deliberately not pinned** — see What We're NOT Doing
- `src/lib/shares.ts:97-104` — the zero-share refusal, the only path returning an error rather
  than an array
- `src/lib/units-csv.ts:248` — `parseUnitsCsv`, the only parser
- `src/lib/units-csv.ts:134-141`, `:106-116` — `splitRecords` treats CRLF, LF and CR
  identically as terminators and normalises them identically inside quoted fields. This is the
  load-bearing behaviour Phase 4 protects
- `src/lib/units-csv.ts:252-273` — BOM strip, then fatal UTF-8 decode; Windows-1250 arrives here
- `src/lib/units-csv.ts:353`, `:362` — the two `continue` statements whose mutation to `break`
  Phase 3's completeness test exists to catch
- `src/pages/api/buildings/units-template.csv.ts:30` — template body generated from
  `CSV_HEADERS.join(CSV_SEPARATOR)`, inside the handler
- PRD `## Acceptance Criteria`:131 — "Suma udziałów wszystkich lokali w budynku daje 100%"
- PRD FR-006:197 — "System wylicza udział każdego lokalu z jego metrażu i waży nim oddany głos"
- PRD FR-001:164, PRD:236-244 — the import requirement, and one owner identified by e-mail
- `src/lib/resolution-trail.test.ts` — the convention to follow: a test name is a sentence about
  the domain, not about the function

## What We're NOT Doing

- **The remainder-distribution rule is not pinned.** The PRD says shares come from metraż and
  total 100%; it does not say the leftover basis points go to the largest remainders, nor that
  ties break by file order. Asserting "the unit at index 2 received the extra basis point" pins
  the algorithm and is the anti-pattern Risk #2's guidance names. The property asserted instead
  is the one the confirm path actually relies on: **identical input yields identical output**.
- **The threshold comparison.** `sum_for * 2 > total` exists once, in SQL. No test written here
  computes it — including the knife-edge test, which asserts allocation only.
- **The per-owner aggregation** (PRD:236-244, `import_building_units`) and the **`EM003`
  backstop** — both database behaviour, Phase 2's pgTAP suite.
- **Import atomicity** (Risk #8's other half) — Phase 2.
- **The formatters** in `shares.ts:110-141`, including `areaHundredthsToDecimalString`.
  Out of scope by decision, even though it is the value that crosses into `numeric(8,2)`.
- **Loosening the same-e-mail-different-name refusal.** "Jan Kowalski" vs "JAN KOWALSKI" at one
  address refuses the whole file, in both layers, and they agree. Whether that is the right
  product rule is an open question recorded below — the tests pin the behaviour as it stands.
- **Coverage thresholds, CI changes, new npm scripts.** The gates already exist.

## Implementation Approach

Fixtures first, because they are the infrastructure this phase needs and neither suite is
honest without them. Then the two suites, each against oracles from outside its module. Then
the one assertion that spans both — round-trip invariance — as its own phase, because it
protects a call path rather than a function. The two comment corrections land last, so the
branch is green as a pure test change before any production file is touched.

## Critical Implementation Details

**The template must be invoked, not imported.** There is no exported constant; the bytes exist
only inside the response `GET` returns. The handler ignores its context argument, so the call
is `GET({} as never) as Response`, then `new Uint8Array(await response.arrayBuffer())`. Probed
and working.

**Windows-1250 bytes cannot come from `TextEncoder`** — it emits UTF-8 only. The fixture must
carry a hand-written byte array. Any byte in `0x80–0xBF` appearing where UTF-8 expects a lead
byte makes the fatal decoder throw, and the Polish letters a zarządca's file actually contains
are exactly that: `ł` = `0xB3`, `ą` = `0xB9`, `ż` = `0xBF`, `ó` = `0xF3`, `ę` = `0xEA`. Build the
line from ASCII plus those bytes; do not settle for a random invalid byte, because the test's
claim is about a real Polish Excel export, not about invalid UTF-8 in the abstract.

**The completeness fixture must avoid every early-return path.** `parseUnitsCsv` returns
immediately on an unclosed quote (`:281`), a failed decode (`:262`), an empty file (`:303`),
header defects (`:307`), a header-only file (`:314`) and too many rows (`:325`). A completeness
fixture containing any of those asserts nothing about completeness. The three defects must each
sit downstream of a different `continue`, so the test catches both mutation sites.

**The floor/ceil bound is not the module's expression.** The test computes
`floor(area * 10000 / total)` itself and asserts membership in `{floor, floor + 1}`. That
expression also appears at `shares.ts:66`, and that is not the oracle being borrowed: the
module's behaviour is base-plus-largest-remainder, while the test asserts only that the answer
is one of the two integers adjacent to the exact proportional value — a bound derived from
FR-006 combined with sum-to-100%, and true of *any* correct allocator. State this in a comment
where the bound is computed; a reviewer will otherwise read it as a copied oracle.

---

## Phase 1: Fixture layer

### Overview

The byte-level fixtures both suites draw on. No assertions live here — this is the
infrastructure phase, and its correctness is established by the phases that consume it.

### Changes Required:

#### 1. CSV fixture builders

**File**: `src/lib/units-csv.fixtures.ts`

**Intent**: Build registry files as bytes rather than as text, so line endings, the BOM and the
encoding — the three things the parser's contract turns on — are chosen explicitly by each test
instead of inherited from whatever the editor saved. Named `.fixtures.ts` rather than
`.test.ts` so Vitest's `include` glob does not collect it as a suite; it carries no `describe`.

**Contract**:

- `encodeCsv(lines: string[], options?: { newline?: "\n" | "\r\n" | "\r"; bom?: boolean }): Uint8Array`
  — joins with the chosen terminator, optionally prepends `EF BB BF`, encodes UTF-8. Default
  CRLF with BOM, which is what Polish Excel writes.
- `MANAGER_EXPORT_LINES: string[]` — the messy real-world export, header included, carrying all
  nine traits at once: `;` separator, decimal comma (`52,40`), Polish diacritics in
  `imie_nazwisko`, a quoted field containing both a `;` and a doubled `""`, one e-mail address
  across several lokale under an identical name, and two trailing blank rows. BOM and CRLF come
  from `encodeCsv`'s defaults. The quoted-semicolon field belongs in `imie_nazwisko` as
  `"Nazwisko; Imię"` — the shape a concatenated export column actually takes — not as a
  contrivance in `numer_lokalu`.
- `SIMPLE_REGISTRY_LINES: string[]` — a small clean registry, the subject of Phase 4's
  invariance test. Must be re-emittable under every newline/BOM combination without its meaning
  changing, so no quoted field may contain a newline.
- `COMPLETENESS_DEFECTS_LINES: string[]` — a file with exactly three defects, each downstream of
  a different `continue`: a **blank row in the middle** (line 3, `units-csv.ts:353`), a row with
  a **missing semicolon** so its field count is wrong (line 5, `:362`), and a row with an
  **invalid e-mail** (line 7, per-field validation at `:418`). No early-return defect anywhere
  in the file.
- `WINDOWS_1250_EXPORT: Uint8Array` — a header and one data row whose Polish letters are
  Windows-1250 single bytes. See Critical Implementation Details.
- Single-defect line builders for the refusal taxonomy — duplicate unit number, one e-mail with
  two names, unclosed quote, empty file, header-only, missing header column. Keep each minimal:
  the file exists to exhibit one defect and nothing else.

### Success Criteria:

#### Automated Verification:

- `npx astro sync && npm run lint` passes with the new module
- `npm test` still green (the fixture module is not collected as a suite and changes no result)
- `npm run build` passes

#### Manual Verification:

- `MANAGER_EXPORT_LINES` reads like something a zarządca would actually send, not like a
  test vector — a reviewer should recognise the file shape
- Every one of the nine traits is present and identifiable in the fixture
- No fixture is generated from `CSV_HEADERS` or from the template endpoint (Phase 3's template
  test is the one place those may meet)

**Implementation Note**: Pause after this phase for confirmation before writing assertions
against these fixtures.

---

## Phase 2: The allocation oracle

### Overview

Pins `computeShareBps` against values derived from the PRD, and demonstrates that the
sum-to-100% assertion needs the per-unit bound standing beside it.

### Changes Required:

#### 1. Share allocation suite

**File**: `src/lib/shares.test.ts`

**Intent**: Assert what the PRD says a udział is, on a table of registries chosen to represent
real buildings and real rounding pressure, without asserting which unit receives a leftover
basis point.

**Contract**: One `describe` covering `computeShareBps`, with an `it.each` table of **named**
registries — the name says what the building is, not what the numbers are:

| Registry | Why it is in the table |
| --- | --- |
| three equal lokale | exact share is 3333.33 — forces the leftover to exist at all |
| a knife-edge budynek | two owners within one basis point of half the building |
| one lokal, whole building | the degenerate case; share is exactly `TOTAL_BPS` |
| a 70-unit kamienica | the size the module's own comments reason about |
| areas engineered for maximal remainders | the largest leftover the method can produce |

Assertions, per registry:

- **A** — the shares total exactly `TOTAL_BPS`. Oracle: PRD `## Acceptance Criteria`:131.
- **B** — every share is `floor(area * TOTAL_BPS / total)` or that plus one, computed in the
  test in integer arithmetic from the areas alone. Oracle: FR-006 combined with A.
- **Determinism** — calling twice with the same registry returns equal arrays. Oracle: the
  confirm path at `units.ts:49-59`, which recomputes rather than trusting the browser.

Separate tests, outside the table:

- **The zero-share refusal** — a registry pairing a 0,01 m² lokal with a tower block returns an
  error naming **position 1**, not an array. Oracle: FR-006 gives every lokal a share that
  weighs a vote; `units_share_positive` agrees at the database.
- **The two input refusals** — an empty registry, and a registry with a non-positive or
  non-integer area, each return an error rather than throwing (`shares.ts:40-48`).

Test names are Polish-domain sentences in the style of `resolution-trail.test.ts` — "rozdziela
udziały tak, że sumują się do całego budynku", not "returns 10000".

### Success Criteria:

#### Automated Verification:

- `npm test` green, new suite included
- `npm run lint` and `npm run build` pass

#### Manual Verification:

- No expected value in the file was read out of `shares.ts` — each is derivable from the PRD
  lines cited in the test's own comments
- No test names a specific index as the recipient of a leftover basis point
- The knife-edge test says nothing about 50% and carries a comment explaining why the threshold
  is Phase 2's

**Implementation Note**: Pause for confirmation after this phase.

---

## Phase 3: The registry parse

### Overview

Pins that a real zarządca's file imports, that each class of defect is refused legibly, and that
one pass reports everything wrong.

### Changes Required:

#### 1. Parser suite

**File**: `src/lib/units-csv.test.ts`

**Intent**: Assert the behaviour Risk #8 names — a file carrying the messiness of a real export
either imports cleanly or is refused with a message naming the offending line — per defect
class, because the taxonomy makes that claim conditional.

**Contract**: Four groups.

- **The mess imports.** `parseUnitsCsv(encodeCsv(MANAGER_EXPORT_LINES))` returns `ok: true`,
  with the row count the fixture carries, the decimal comma parsed to hundredths, the trailing
  blank rows absent from the result, the quoted field's `;` preserved inside the value and its
  `""` collapsed to one `"`, and the repeated e-mail carried on every row that bore it. One
  test, all nine traits — a real file entering the system is one regression, not nine.
- **Refusals that name a real line.** Duplicate unit number (naming **both** lines), one e-mail
  under two names (naming both), wrong field count, blank row in the middle, per-field
  validation, unclosed quote (naming the line the quote **opened** on). Assert `line` and the
  fragment of the message that carries the domain content — the repeated unit number, the
  address, the word the administrator would search for. Not the whole Polish sentence: a
  reworded message that still names the wiersz and the winowajca is not a regression.
- **Refusals that legitimately report `line: 1`.** Failed decode (`WINDOWS_1250_EXPORT`, message
  naming UTF-8 and the Excel fix), empty file, header-only, missing header column. Each asserted
  as `line: 1` **with a comment saying why that is correct**, so a later reader does not
  "improve" it into a real line number.
- **Completeness.** `COMPLETENESS_DEFECTS_LINES` returns errors whose line numbers, as a set,
  are exactly `{3, 5, 7}`. Oracle: `units-csv.ts:6-8` — an administrator told about one typo at
  a time makes seven round trips through a screen that does not remember their file.

Also here: **the parse is total.** Every refusal path returns `{ ok: false }` with at least one
error and never throws — which is what makes "a refused import writes nothing" structural
rather than incidental (`units.ts:55-57` returns before the RPC).

#### 2. Template ↔ parser contract

**File**: `src/lib/units-template.test.ts`

**Intent**: Prove the downloadable template and the parser agree on column names, separator and
BOM — and prove it without round-tripping the project's own template as the happy path, which
is the anti-pattern Risk #8's guidance names.

**Contract**: Invoke the `GET` handler from
`src/pages/api/buildings/units-template.csv.ts`, read its bytes, feed them to `parseUnitsCsv`,
and assert the refusal is **"header only, no data rows"** (`units-csv.ts:314-323`) — not a header
error. A header error would mean the two had drifted on names, separator or BOM; the
header-only refusal means they agree on all three and the file simply has no data. Its own file
rather than a group inside `units-csv.test.ts`, because it is a contract between two modules
and it is the only test in the suite importing from `src/pages/`. Say so in a comment at the
import.

### Success Criteria:

#### Automated Verification:

- `npm test` green, both new suites included
- `npm run lint` and `npm run build` pass
- The completeness test fails if `continue` at `units-csv.ts:353` or `:362` is changed to
  `break` — confirmed by hand during this phase, restored immediately

#### Manual Verification:

- No test asserts a full Polish sentence
- Every `line: 1` assertion carries its justification
- The mess fixture's traits are all actually exercised by the assertions, not merely present in
  the bytes

**Implementation Note**: Pause for confirmation after this phase.

---

## Phase 4: Round-trip invariance

### Overview

The assertion research reframed: what makes the confirm endpoint safe is not that the bytes
survive the round trip unchanged — they do not — but that the parse is invariant to the two ways
they change.

### Changes Required:

#### 1. Invariance group

**File**: `src/lib/units-csv.test.ts` (its own `describe`)

**Intent**: Protect `units.ts:49-59` — the recompute-don't-trust-the-browser property — by
asserting the invariance it actually rests on. This is the group that would fail first if
someone "simplified" `splitRecords`' newline handling.

**Contract**: Two tests.

- **Six presentations, one result.** `SIMPLE_REGISTRY_LINES` emitted as LF, CRLF and CR, each
  with and without a BOM, yields identical `rows` **and** identical `computeShareBps` output
  across all six. Both modules in one assertion, because a divergence in either breaks the same
  security property.
- **The round trip as it actually happens.** Model the path end to end: parse the uploaded
  bytes (BOM, LF); decode them the way the preview does (`TextDecoder("utf-8")`, which drops the
  BOM); apply the newline normalisation HTML form submission performs (lone LF and lone CR each
  become CRLF); re-encode with `TextEncoder` the way `units.ts:54` does; parse again. Assert the
  two parses produce identical rows and identical shares. The test's comment states plainly that
  the bytes differ between the two parses and that this is expected.

### Success Criteria:

#### Automated Verification:

- `npm test` green
- The six-presentation test fails if `splitRecords`' CR handling (`units-csv.ts:134-141`) is
  narrowed to LF only — confirmed by hand, restored immediately

#### Manual Verification:

- The round-trip test reads as a description of the real call path, with `import.astro` and
  `units.ts` line references in its comments
- Neither test asserts byte equality anywhere

---

## Phase 5: Correct the two byte-stability comments

### Overview

Two comments state a reason that is not what happens. The conclusions they reach are correct, so
nothing is broken today — but a reader who trusts "byte-stable" could remove the newline
handling that is actually load-bearing, which is precisely the regression Phase 4 now guards.

### Changes Required:

#### 1. Preview comment

**File**: `src/pages/buildings/[id]/units/import.astro`

**Intent**: Replace "the round trip is byte-stable either way" (`:139-140`) with the property
that actually holds: the hidden input's value is newline-normalised on submission and the BOM is
already gone by this point, so what makes the confirm parse agree is that `splitRecords` is
newline-agnostic and the BOM strip is conditional.

**Contract**: Comment text only. No behaviour changes. Point at `src/lib/units-csv.test.ts`'s
invariance group so the next reader finds the test that holds the property up.

#### 2. Confirm endpoint comment

**File**: `src/pages/api/buildings/[id]/units.ts`

**Intent**: Same correction at `:52-53` — "the same bytes must yield the same shares" becomes
the invariance statement. The security argument is unchanged and stays: this endpoint recomputes
rather than trusting what the browser posted.

**Contract**: Comment text only.

### Success Criteria:

#### Automated Verification:

- `npm run lint && npm test && npm run build` all pass
- `git diff` on both files shows comment lines only — no statement changed

#### Manual Verification:

- Neither comment claims byte stability
- Both name line-ending and BOM invariance as the property, and point at the test

---

## Testing Strategy

### Unit Tests:

- Allocation: sum, per-unit bound, determinism, zero-share refusal, input refusals
- Parse: the messy export imports; six defect classes refused naming a real line; four refused
  at `line: 1` by construction; completeness across three defects; parse totality
- Contract: template bytes refused as header-only
- Invariance: six presentations, and the real round trip

### Manual Testing Steps:

The lesson's own bar, run after Phase 5 and recorded in this change folder — one mutation at a
time, `npm test`, note **which** test went red, `git checkout --` the mutated file, `npm test`
green again:

1. `shares.ts:66` — `totalArea` → `totalArea + 1`. Expect the bound test red, the sum test still
   green. This is the mutation that justifies assertion B existing.
2. `shares.ts:66` — `Math.floor` → `Math.round`.
3. `shares.ts:78-84` — leftover handed out by file order instead of largest remainder. Expect
   **everything still green** — that is the deliberate limit, and it gets recorded rather than
   fixed.
4. `units-csv.ts:353` and `:362` — `continue` → `break`. Expect the completeness test red.
5. `units-csv.ts:134-141` — CR dropped as a terminator. Expect the invariance test red.
6. `units-csv.ts:252-253` — BOM strip removed. Expect the invariance test red.

A mutation that kills no test is a finding to report, not to ignore.

### What these tests do not cover:

Everything at the database layer: the threshold, `EM003`, the owner collapse by e-mail, import
atomicity, RLS. `npm test` going green says nothing about any of them — Phase 2's pgTAP suite
is where they get pinned.

## References

- Research: `context/changes/tests-phase1-shares-and-registry/research.md`
- Test plan: `context/foundation/test-plan.md` §2 (Risks #2, #8), §3 Phase 1, §6.1
- Prior change: `context/changes/test-environment-bootstrap/` — the runner and the gates
- Convention to follow: `src/lib/resolution-trail.test.ts`
- Runner config: `vitest.config.ts`

## Open Risks & Assumptions

- **The remainder rule stays unpinned by choice.** Mutation 3 above is expected to kill nothing.
  If someone later reads that as a coverage gap and pins the algorithm, the confirm path gains a
  test that fails on any legitimate change to the distribution method.
- **"Jan Kowalski" vs "JAN KOWALSKI" under one address refuses the whole file.** Both layers
  agree, so the tests pin it as it stands. Whether that is the right product rule is undecided,
  and changing it later means changing the parser, the migration and this test together.
- **The messy-export fixture is a claim about what Polish zarządca exports look like.** It was
  built from the parser's own failure taxonomy rather than from a file anyone received. If a real
  export later shows a trait the fixture lacks, the fixture is what gets extended.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not
> rename step titles. See `references/progress-format.md`.

### Phase 1: Fixture layer

#### Automated

- [x] 1.1 `npx astro sync && npm run lint` passes with the new module
- [x] 1.2 `npm test` still green
- [x] 1.3 `npm run build` passes

#### Manual

- [x] 1.4 `MANAGER_EXPORT_LINES` reads like a real zarządca's file
- [x] 1.5 All nine traits present and identifiable
- [x] 1.6 No fixture generated from `CSV_HEADERS` or the template endpoint

### Phase 2: The allocation oracle

#### Automated

- [ ] 2.1 `npm test` green with the new suite
- [ ] 2.2 `npm run lint` and `npm run build` pass

#### Manual

- [ ] 2.3 No expected value read out of `shares.ts`
- [ ] 2.4 No test names the recipient of a leftover basis point
- [ ] 2.5 The knife-edge test says nothing about 50%

### Phase 3: The registry parse

#### Automated

- [ ] 3.1 `npm test` green with both new suites
- [ ] 3.2 `npm run lint` and `npm run build` pass
- [ ] 3.3 Completeness test goes red on `continue` → `break` at `:353` and `:362`, restored

#### Manual

- [ ] 3.4 No test asserts a full Polish sentence
- [ ] 3.5 Every `line: 1` assertion carries its justification
- [ ] 3.6 Every trait of the mess fixture is actually exercised

### Phase 4: Round-trip invariance

#### Automated

- [ ] 4.1 `npm test` green
- [ ] 4.2 Six-presentation test goes red when CR handling is narrowed, restored

#### Manual

- [ ] 4.3 Round-trip test reads as the real call path, with line references
- [ ] 4.4 No byte-equality assertion anywhere

### Phase 5: Correct the two byte-stability comments

#### Automated

- [ ] 5.1 `npm run lint && npm test && npm run build` pass
- [ ] 5.2 `git diff` shows comment lines only

#### Manual

- [ ] 5.3 Neither comment claims byte stability
- [ ] 5.4 Both name invariance and point at the test
