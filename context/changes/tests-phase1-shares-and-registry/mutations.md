# Mutation log — what each assertion actually protects

A green suite proves the tests run, not that they hold anything down. This is the check that
tells the difference: break the production code under an assertion, and see whether **that**
test goes red. An assertion nothing can kill is decoration.

Method, one mutation at a time: edit the source, `npm test`, record which tests went red,
`git checkout -- <file>`, `npm test` green again, `git status --short` clean. The mutation set
is the one fixed in `plan.md` → `## Testing Strategy` → `### Manual Testing Steps`; nothing was
invented here to make a result look better.

Baseline: 51 tests, 6 files, green.

## Results

| # | Mutation | Expected | What went red |
| - | --- | --- | --- |
| 1 | `shares.ts:66` — `totalArea` → `totalArea + 1` | bound test red, sum test green | sum **and** bound, in the one-lokal registry only; the four multi-lokal registries stayed green |
| 2 | `shares.ts:66` — `Math.floor` → `Math.round` | red | sum test in `areas engineered for the largest leftover…` (10001); bound test in `a 70-lokal kamienica` (169 > 168) |
| 3 | `shares.ts:78-84` — leftover by file order, not largest remainder | everything green (deliberate limit) | the zero-udział refusal test — see below |
| 4 | `units-csv.ts:353` and `:361` — `continue` → `break` | completeness test red | completeness test only (`[3]` and `[3,5]` instead of `[3,5,7]`) |
| 5 | `units-csv.ts:134` — CR stops being a terminator | invariance test red | the six-presentations test only; the round trip stayed green, correctly |
| 6 | `units-csv.ts:252-253` — BOM strip removed | invariance test red | **nothing** — 51/51 still green |

Mutations 4 and 5 were run while the phases they belong to were being written, against the same
procedure; 1, 2, 3 and 6 were run against the finished suite. Every restore left the tree clean.

## Three results that are not what the plan predicted

**Mutation 1 splits by registry, and that is the sum assertion's real shape.** A wrong
denominator leaves every unit slightly short, the leftover grows, and the distribution loop
hands it back out until the total is 10000 again — so the sum assertion cannot see the error at
all. That is why the per-unit floor/ceil bound exists beside it, and mutation 1 is the reason to
keep it. The one-lokal registry is the exception rather than the counter-example: at 72,50 m²
the mutated base is 9998, leaving 2 basis points for a single unit, and the loop's second
iteration writes past the end of the ordering (`shares[order[1]]` with one element) instead of
landing anywhere. The sum arrives at 9999 by an accident of the mutation, not by the assertion
catching a wrong denominator. Read the multi-lokal registries for the honest answer: four of
them, sum green, bound red.

**Mutation 3 kills a test, and it is not an allocation test.** The limit set before any of this
was written still holds — no assertion says *which* unit receives the extra basis point, because
the PRD does not settle it. But the zero-udział refusal runs on `[1, 1000000]`: a 0,01 m² broom
cupboard beside a 10 000 m² tower block, with exactly one basis point left over. Largest
remainder gives that point to the tower (remainder 990 001 against 10 000), the cupboard stays at
zero, and the refusal fires. Distribute by file order and the cupboard takes it — udział 1, no
zero in the array, no refusal, and the test fails on getting two udziały where it wanted a
sentence. The refusal fixture is standing on the tie-break rule without saying so. It is not
wrong — the refusal is genuinely reachable and genuinely worth pinning — but anyone changing the
leftover rule will see this test break and should know why before assuming they broke the
refusal.

**Mutation 6 kills nothing, and the expectation was wrong rather than the code.** `TextDecoder`
strips a leading U+FEFF on its own unless `ignoreBOM` is set, so by the time the parser looks,
the BOM the template emits is already gone. The explicit strip removes a BOM that would not have
survived the decode anyway. No test can protect it, and the suite says so rather than papering
over it: the invariance group asserts what it can — that the same registry parses identically
across LF, CRLF, CR and a BOM'd presentation — and its comment states plainly that the strip
itself is not among the things this suite holds down.

## What this log does not claim

That the suite is complete. It covers the allocation arithmetic and the registry parse at the
unit layer, and nothing below them: the 50% threshold, `EM003`, the owner collapse by e-mail,
import atomicity and RLS all live in SQL, are all untouched by `npm test`, and are Phase 2's
work.
