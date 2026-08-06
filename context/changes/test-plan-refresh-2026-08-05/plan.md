# Test Plan Refresh (2026-08-05) Implementation Plan

## Overview

`context/foundation/test-plan.md` was written on 2026-08-04 and scheduled its own refresh
for "after roadmap `S-04` (`voting-link-email-fanout`) ships." `S-04` shipped that same day
and `S-05` (`live-tally-and-outcome`) shipped on 2026-08-05, so the two risks the plan
scored highest — #1 (link misdelivery) and #2 (an uchwała decided against wrong udziały) —
were both estimates made against code that did not exist and now does.

This change re-derives those two rows against the code that shipped, folds `S-05`'s two
*reproduced* failure modes into existing rows rather than appending new ones, corrects a
§3 status cell that points at a change folder which has never existed on any branch,
corrects a §1 hot-spot figure that measures something other than what its label claims,
and retires the scheduled refresh trigger now that it has fired.

It is a **documentation change only**. It installs no test runner, edits no `CLAUDE.md`
rule, and does not launch §3 Phase 1.

## Amendment, 2026-08-06 — the plan re-based on what landed since

This plan was written on 2026-08-05 and sat unimplemented for a day, during which the
document it targets moved three times. Its contracts are literal, so they are re-based here
rather than being read charitably at implementation time. What changed:

- **PR #39 (`test-environment-bootstrap`) landed both harnesses and both CI gates.** It also
  fixed the §3 Phase 1 status cell that Phase 1 item 2 below was opened for, and it rewrote
  §4's runner row — so Phase 3 item 5's contract (name Vitest via `getViteConfig()`) is not
  merely done but **decided the other way**: `getViteConfig()` is incompatible with the
  Cloudflare adapter and §4 now records why.
- **§1's hot-spot figure was corrected on 2026-08-06**, which is Phase 1 item 3. The
  correction went further than this plan's contract: §2's per-directory labels said
  "commits" where the numbers were file changes, so the unit was fixed alongside the scope.
  The figures differ from the ones below because the 30-day window moved by a day — the
  numbers below are superseded, not contradicted.
- **Risk #9 (a voting token retained outside the application) was appended on 2026-08-06**,
  and §3 Phase 3 now owns its testable half. The map has **nine** rows, not eight.
- **§5 lost its `post-edit hook` row and moved the AI-native review trigger to after Phase
  2** on 2026-08-06, which overlaps Phase 3 item 6 below.

**The §2 renumber is withdrawn.** Phase 2 item 1 planned to re-assign every risk number so
the registry blocker would lead the map. Two appends have since used the opposite
convention — #8 and #9 both sit at the end with an ordering note telling the reader to read
them at the top — and the numbers are now cited from §3, §5, §7 and four §8 amendments. A
renumber would invalidate all of it to buy a reading order the note already supplies. If it
returns, it returns as its own change with its own review, never as a side effect of a
refresh. **Items 2–6 of Phase 2 therefore keep the numbering the document has today**: the
link-misdelivery risk is #1, wrong-udziały is #2, the outsider-vote risk is #3.

What remains genuinely owed, and is what implementation should execute: re-deriving Risks
#1 and #2 against shipped `S-04`/`S-05` code, folding `S-05`'s two reproduced failure modes
into #2 and #3, the matching Risk Response Guidance rows, the §3 goal and rationale edits,
the Phase 4 rescope, and §8's ledger close-out.

## Current State Analysis

`context/foundation/test-plan.md` exists on `origin/main` at `15ed4af` (PR #34) and
**nowhere else** — it is on no other branch, and local `main` is one commit behind
`origin/main`. The branch this planning session ran on (`docs/record-s05-current-state`,
`474f08e`) branches from `0666024`, which predates #34, so the file is absent from this
working tree. That absence is the single most dangerous fact in this change and Phase 1
opens by fixing it.

What is stale, verified rather than assumed:

- **§3 Phase 1 Status is `change opened`, pointing at `context/changes/testing-share-arithmetic/`.**
  That folder exists on no branch. Verified by enumerating every ref in the repository.
  PR #34's own commit message records this as knowingly stale and defers the correction here.
- **No test runner exists.** `package.json` has no test script; no Vitest, Playwright, or
  pgTAP in `devDependencies`; zero `*.test.*` or `*_test.sql` files anywhere in `src/` or
  `supabase/`. Phase 1 is genuinely `not started`, which is what the status cell should say.
- **§1's hot-spot figure is wrong.** It reads: *"Hot-spot scope used for likelihood
  weighting: `src/`, `supabase/` (68 commits in 30 days)."* Reconstructing that window
  (`2026-07-05`..`2026-08-04` on `origin/main`) gives **68 commits repo-wide** and **19
  commits** touching `src/` or `supabase/`. The number quoted as the scoped count is the
  unscoped one. Every likelihood cell citing a "hot-spot dir" rests on this scan, so the
  label and the figure have to be made to agree.
- **Risk #1's code now exists.** `S-04` (`c1bdcfd`) built the per-owner send-state record
  (`sent_at`, `last_attempt_at`, `last_error_code`, `attempt_count`), the sequential
  send-then-write ordering that makes a run resumable, `public.unsent_voting_links(uuid)`
  as the only token read path, derived-not-stored status, and the `bez adresu e-mail`
  block. It ran on production 2026-08-04.
- **Risk #2's code now exists.** `S-05` (`6f73637`) moved the threshold into SQL —
  `public.resolution_tally(uuid)` is the only place `sum * 2 > 10000` is expressed, and no
  TypeScript computes it. The denominator is the constant `10000`, not udziały cast.
- **`S-05` shipped two reproduced failure modes §2 does not model.** A concurrent-vote
  deadlock (`40P01`) that silently dropped the loser's vote, fixed by lock *order* (a
  `before insert` trigger taking `FOR UPDATE` ahead of the FK's `KEY SHARE`); and `EM014`,
  a signed-in administrator flipping a resolution to `passed` through PostgREST with no
  votes behind it. Both were reproduced end to end before being fixed.
- **Hot-spots barely moved.** Re-scanned on `origin/main` over the trailing 30 days:
  `src/lib` 12 commits, `src/pages/api` 10, `supabase/migrations` 8, `src/db` 7,
  `src/pages/buildings` 6, `src/pages/vote` 3. The two directories §2 leans on are still
  the two that matter.

## Desired End State

`context/foundation/test-plan.md` on `main`, refreshed so that:

- §1's hot-spot sentence states a counting method and a figure that agree with each other.
- §2's Risk #1 and #2 describe the code that shipped, not the code that was imagined.
  Risk #2's row makes the *vanished vote* explicit — a vote silently not recorded is a
  wrong-outcome mode, and it is the one the user named as their top concern.
- §2's Risk #3 names `EM014` as a reproduced instance of the guard-relaxation shape it
  already describes.
- §2 still has exactly eight rows, renumbered so that **the registry blocker is Risk #1** —
  it is the precondition the whole rollout stands on, and a map that buried it at the bottom
  misreported the rollout's own dependency order. Position and number now agree, and every
  citation elsewhere in the document has been swept to match.
- §3 Phase 1 reads `not started` with no change folder; Phase 1's goal no longer implies it
  covers the outcome threshold; Phase 4 is a retrofit phase, not a gate specification for
  an unbuilt slice.
- §4 names Vitest via `getViteConfig()` as Phase 1's runner, so §5's unit gate can cite a
  command.
- §8 records this refresh, retires the fired trigger, and records the two *considered
  no-ops* — §7 unchanged, no rows appended — so the next refresh does not re-litigate them.

**How to verify:** the automated checks in each phase (structure, numbering, forbidden
anchors, status literals) plus a read-through against the §8 entry, which should account
for every section this change touched.

### Key Discoveries

- `context/foundation/test-plan.md` is absent from every branch except `origin/main`
  (`15ed4af`). Editing it from a branch based on anything earlier turns an edit into a
  create and reverts PR #34.
- §2's schema forbids `file:line`, function names, schema names, and module names in the
  Source column (`.claude/skills/10x-test-plan/SKILL.md:356`). The re-derived rows describe
  *S-04's send-state record* and *S-05's tally function* in prose, never as identifiers.
- §3's Status column holds parser literals the orchestrator reads on every invocation:
  `not started` → `change opened` → `researched` → `planned` → `implementing` → `complete`
  (`SKILL.md:358`). A prose status breaks the orchestrator.
- The `--refresh` contract says a refresh opens `test-plan-refresh-<YYYY-MM-DD>` and does
  **not** edit the guide in place from the skill (`SKILL.md:575`). This change folder is
  that folder; the edit belongs here.
- §8's amendment precedent (Risk #8, 2026-08-04) is the model for how this change records
  itself: what moved, which sections, and why, so a reader diffing against an earlier
  commit can see the reasoning.

## What We're NOT Doing

- **Not installing a test runner.** §4 will *name* Vitest; nothing is added to
  `package.json`, no config file is written, no test is authored. That is §3 Phase 1's job.
- **Not editing `CLAUDE.md`.** Its "There is no test runner — never report that tests
  passed" hard rule stays true until a runner lands, and stays with the commit that lands
  one. §4 already records this as Phase 1 scope; this change leaves that note intact.
- **Not launching §3 Phase 1.** No change folder is opened, and Phase 1's status is set to
  `not started` — deliberately *not* to `change opened`, which is how the stale cell this
  change is correcting came to exist.
- **Not appending new risk rows.** The two `S-05` failure modes fold into #2 and #3.
- **Not adding or removing risk rows.** §2 has eight rows before and after. The registry
  blocker is renumbered to #1 and the rest shift down by one, but no scenario is introduced,
  merged away, or dropped — `S-05`'s two reproduced failure modes fold into existing rows.
- **Not editing §7.** It was reviewed and deliberately left alone (see Phase 3); the
  decision is recorded in §8 rather than enacted in §7.
- **Not deciding how CI gets a database.** §5's database-contract gate keeps its flagged
  Docker cost as a Phase 2 decision.
- **Not touching any workflow, migration, or source file.** The blast radius is one
  markdown file plus this change folder.

## Implementation Approach

Three phases, ordered so that nothing is written before the ground it rests on is correct.

Phase 1 fixes the working tree (branch base) and the two purely factual defects — a status
cell pointing at nothing and a figure that does not measure what it says. These need no
judgement and are separable from anything editorial, so they land first and can be reviewed
on their own.

Phase 2 re-derives the risk map, which is the substance of the refresh. It runs after
Phase 1 because §2's likelihood column cites the hot-spot scan that Phase 1 corrects.

Phase 3 propagates §2's changes outward into §3–§5 and then writes §8 last, because §8 is
the record of everything the other phases did — including the two decisions to change
nothing.

## Critical Implementation Details

**Branch base is load-bearing and the failure is silent.** `context/foundation/test-plan.md`
exists only on `origin/main`. A branch cut from local `main` (one commit behind) or from
`docs/record-s05-current-state` will not contain the file, and the implementer will write a
"new" 269-line document that reverts PR #34 without any conflict, error, or warning to
signal it. Phase 1 verifies the file is present and 269 lines *before* any edit.

**§2 and §3 are machine-read, not just human-read.** The Source column has a forbidden
vocabulary and the Status column has a closed one; both are enforced by convention, not by
a parser that errors. The automated checks in Phases 2 and 3 are the only thing standing
between a plausible-looking edit and a §3 table the orchestrator silently misreads.

## Phase 1: Grounding and mechanical corrections

> **Complete as of 2026-08-06 — by other work, not by this plan.** All three items landed
> elsewhere: the branch is `docs/test-plan-refresh-s04-s05` cut from `origin/main` at
> `d4779b6`; the §3 status cell was fixed by PR #39; §1's hot-spot paragraph was corrected
> on 2026-08-06 together with §2's mis-labelled units. Do not re-apply any of it. The
> contracts stay below as the record of what was asked for; the pre-edit fingerprint of
> 269 lines is dead — the file is past 380 lines.

### Overview

Get onto a branch that actually contains the file, then fix the two defects that need no
editorial judgement: the §3 Phase 1 status cell, and §1's hot-spot figure.

### Changes Required

#### 1. Branch and working tree

**File**: none — git state

**Intent**: Put the working tree on a branch that contains `context/foundation/test-plan.md`,
so that every subsequent edit is an edit and not an accidental re-creation.

**Contract**: A new branch `docs/test-plan-refresh-2026-08-05` cut from `origin/main`
(**not** local `main`, which is behind at `0666024`, and **not** the current
`docs/record-s05-current-state`, which predates PR #34). The untracked change folder
`context/changes/test-plan-refresh-2026-08-05/` carries over. Before editing, confirm the
target file exists and is 269 lines — that count is the fingerprint of `15ed4af`'s content.

#### 2. §3 Phase 1 status cell

**File**: `context/foundation/test-plan.md`

**Intent**: Stop the rollout table from claiming a change was opened for Phase 1. No such
folder has ever existed, so the orchestrator currently resumes from a false state.

**Contract**: In §3's table, Phase 1's `Status` cell becomes `not started` and its
`Change folder` cell becomes `—`, matching Phases 2–4. `not started` is a parser literal;
do not paraphrase it. The rest of Phase 1's row is edited in Phase 3, not here.

#### 3. §1 hot-spot scope sentence

**File**: `context/foundation/test-plan.md`

**Intent**: Make the figure the likelihood column rests on measure what its label says. The
current sentence attributes a repo-wide commit count to a scoped one, so every "hot-spot
dir" citation in §2 rests on a number that never described those directories.

**Contract**: Rewrite §1's hot-spot paragraph to state (a) the counting method explicitly —
commits on `origin/main` touching a path within the scope, over the trailing 30 days — (b)
the corrected figure for the scope, and (c) the refreshed per-directory counts:
`src/lib` 12, `src/pages/api` 10, `supabase/migrations` 8, `src/db` 7,
`src/pages/buildings` 6, `src/pages/vote` 3. Re-run the scan at implementation time rather
than copying these; they are a check, not a source. Keep the existing exclusions list and
the note that the `auth` clusters are deletion-dominated and not used as likelihood
evidence. Add one sentence recording that the previous figure was the unscoped count, so a
reader comparing against `15ed4af` can see why the number moved.

### Success Criteria

#### Automated Verification

- Working tree is on `docs/test-plan-refresh-2026-08-05`, and `git merge-base --is-ancestor origin/main HEAD` succeeds
- `context/foundation/test-plan.md` was 269 lines at branch creation (pre-edit fingerprint of `15ed4af`)
- §3 contains no occurrence of `testing-share-arithmetic`
- Every §3 `Status` cell matches one of the six parser literals
- The hot-spot figures in §1 reproduce when the stated method is re-run

#### Manual Verification

- §1's method sentence is specific enough that a future reader can re-run the scan and get the same number
- The note explaining why the figure moved reads as a correction, not as an accusation

**Implementation Note**: pause here for confirmation before Phase 2.

---

## Phase 2: Risk map re-derivation (§2)

### Overview

Rewrite Risk #1 and Risk #2 against the code that shipped, fold `S-05`'s two reproduced
failure modes into #2 and #3, and update the Risk Response Guidance rows to match. Nine
rows in, nine rows out, same numbers and the same order — the renumber this phase opened
with is withdrawn (see the amendment above).

### Changes Required

#### 1. §2 renumber — **withdrawn 2026-08-06, do not apply**

This item planned a full re-assignment of §2's risk numbers so the registry blocker would
lead the map. It is withdrawn, and the reasoning is worth keeping because the question will
come back.

The argument for it still holds on its own terms: the registry risk is the precondition the
whole rollout stands on — an administrator who cannot get a budynek and its rejestr into the
system reaches no uchwała, no links and no votes — and it sits last only because it was
appended after the initial write. What changed is the cost. Since this plan was written the
map has taken a second append (#9) under the same convention, and both appended rows carry an
ordering note telling the reader to read them at the top. The numbers are now cited from §3,
§5, §7 and four §8 amendments, and from PR #39's history. A renumber invalidates every one of
those to buy a reading order the note already supplies.

If the renumber is ever made, it is its own change with its own review, applied as a
mechanical pass with nothing else in it — never folded into a refresh. Two things a future
attempt must not lose: `§1 principle #3` cites a numbered *principle*, not a risk, and any
find-and-replace will hit it; and the sweep was self-contained only because no file outside
`context/foundation/test-plan.md` cites a risk number, which is a fact to re-verify rather
than inherit.

> **Items 2–6 use the numbering the document has today** — no renumber precedes them. The
> parenthetical "(was #N)" headings below are historical and now read as no-ops.

#### 2. Risk #1 — link misdelivery

**File**: `context/foundation/test-plan.md`

**Intent**: Re-derive the row against the fanout that exists. The scenario is unchanged and
the score **holds at High/High**, but the evidence must separate what production
demonstrated from what it did not — a score left untouched by a slice shipping reads as a
score nobody re-derived.

**Contract**: Keep `High | High`. Rewrite the Source cell so it cites, in schema-legal prose
(no identifiers, no `file:line`): that the slice has now shipped and run on production;
that the resume rule and the per-owner send-state record are real rather than open
questions, closing the roadmap Unknowns the row previously cited; and that the failure
vocabulary remains largely unexercised because the provider's own failure conditions cannot
be produced on demand. Keep the existing PRD and interview citations. The row's scenario
text needs only light editing — it was written about delivery, and delivery is still the
risk.

#### 3. Risk #2 — an uchwała decided against wrong udziały

**File**: `context/foundation/test-plan.md`

**Intent**: Re-derive against `S-05`, and make the *vanished vote* an explicit mode of this
row rather than an unstated one. A vote silently not recorded produces exactly this row's
outcome — an uchwała decided against udziały that do not reflect the electorate — and it is
the failure the user named as their top concern.

**Contract**: Keep `High | High`. Extend the scenario text so it covers three modes: a
rounding or denominator error, a recomputation overriding a vote's recorded weight, and a
cast vote never being recorded at all. Rewrite Source to cite: that the threshold now lives
in exactly one place in the database layer rather than being a `proposed` slice; that a
concurrency defect was reproduced during the slice and silently dropped a vote before being
fixed; and that the tally's numerator and denominator come from two sources which agree
only by construction in v1. Keep the interview and PRD citations. Do **not** name the
function, the trigger, or the error code — schema-legal prose only.

#### 4. Risk #3 — someone outside the registry votes at another owner's weight

**File**: `context/foundation/test-plan.md`

**Intent**: Fold `EM014` in as a second reproduced instance of the shape this row already
describes. The row's existing evidence is a guard found bypassable during `S-03` review;
`S-05` produced a second one, and two instances of a shape is materially stronger evidence
than one.

**Contract**: Add to the Source cell that a later slice widened a status guard and thereby
handed outcome-setting to every authenticated writer, reproduced through the data API before
being closed in the same change. Score is unchanged at `High | Medium`. Scenario text
unchanged — it already describes "one of the several independent guards … relaxed by a later
migration", which is precisely what happened.

#### 5. Risk Response Guidance — rows #1, #2, #3

**File**: `context/foundation/test-plan.md`

**Intent**: Carry the re-derivation into the guidance table, which is what a phase planner
actually reads before writing tests.

**Contract**: Three row edits, on the rows for the three re-derived risks.

- **#1 (link misdelivery)**: `Must challenge` gains the trap that a link already sent is
  never re-attempted, so a "send again" affordance would break an invariant the current
  design depends on. `Context /10x-research must ground` gains: how a run that dies mid-way
  resumes, and how a send that succeeds while its status write fails is distinguished from
  one that did not send.
- **#2 (wrong udziały)**: `What would prove protection` gains a fourth clause — that two
  votes cast at the same moment both end up recorded, and that whichever crosses the
  threshold settles the uchwała exactly once. `Likely cheapest layer` becomes split rather
  than `unit`: unit for the allocation, contract for the threshold and the concurrency
  property. `Must challenge` gains "the threshold is only reachable through one code path" —
  it is reachable by any writer the guards do not bind.
- **#3 (outsider votes)**: `Must challenge` gains that a guard *widened* to permit a
  legitimate transition permits it for every caller, not only for the one the author had in
  mind.

#### 6. The deadlock's protection, stated as guidance

**File**: `context/foundation/test-plan.md`

**Intent**: Record what counts as protection against the vanished vote, since racing two
sessions is the most expensive and flakiest test available and was rejected on cost × signal.

**Contract**: In #2's guidance row (wrong udziały), state that the protection asserted is the *ordering* of
the lock acquisition — that the strongest lock is taken before the row is inserted — and
that the assertion must fail if that step is removed. Name the anti-pattern: the step looks
redundant, because a foreign key already takes a weaker lock on the same parent row, and
removing it reads like tidying. Do not name the trigger or the lock mode; describe the
property.

### Success Criteria

#### Automated Verification

- §2's risk table has exactly 9 data rows, numbered 1–9, in ascending order with none missing or duplicated
- Every risk keeps the number it carried before this phase — no row moved position or label
- The Risk Response Guidance table carries one row per risk 1–9, in the same ascending order
- §2's "Ordering note" survives, and still accounts for both appended rows (#8 and #9)
- §1's `principle #3` reference is unchanged
- No Source cell matches a `file:line` pattern, a `.ts`/`.sql`/`.astro` filename, or a bare `EM0NN` code
- `git diff --stat` shows `context/foundation/test-plan.md` as the only changed file

#### Manual Verification

- Risk #2's scenario reads as one coherent failure with three routes to it, not three risks in one cell
- Risk #1's Source makes clear what production proved and what it did not, without the cell becoming a verdict
- A reader who has never seen `S-05` can tell from #1's guidance what to assert and what mistake to avoid
- Nothing in §2 names a file, function, trigger, or error code

**Implementation Note**: pause here for confirmation before Phase 3.

---

## Phase 3: Rollout, stack, gates and ledger (§3–§5, §8)

### Overview

Propagate Phase 2's changes into the rollout table, the stack table and the gates table,
then write §8 — including the two decisions to change nothing.

### Changes Required

#### 1. §3 Phase 1 — narrow the goal

**File**: `context/foundation/test-plan.md`

**Intent**: Phase 1's goal says it will "pin the udział allocation that decides every future
outcome." Since `S-05`, allocation and the outcome threshold are in different layers, and
Phase 1 is unit-only. The goal currently claims coverage Phase 1 will not deliver.

**Contract**: Rewrite Phase 1's `Goal` so it claims the registry parse and the allocation
and stops implying the threshold; add that the threshold comparison is Phase 2's. Lead the
goal with the **registry parse**, not the allocation — the registry risk is the blocker the
rest of the rollout stands on, so the phase's own goal line should name it first.
`Risks covered` becomes `#8 (parse half), #2`, qualifying #2 the way #8 already is, so the
table shows #2 split across Phases 1 and 2. Status and change folder are already correct
(PR #39); do not re-touch them.

#### 2. §3 Phase 2 — absorb the concurrency assertion

**File**: `context/foundation/test-plan.md`

**Intent**: Phase 2 is where the lock-ordering assertion lands, and where the wrong-udziały
risk's other half now sits.

**Contract**: Add the threshold and lock-ordering properties to Phase 2's goal line, and add
`#2 (threshold half)` to its Risks covered. Test type stays `contract`.

#### 3. §3 Phase 4 — rescope from gate spec to retrofit

**File**: `context/foundation/test-plan.md`

**Intent**: Phase 4 exists because the fanout risk's code did not exist. It does now, so the phase's
stated purpose — writing a gate the slice's own plan must satisfy — describes a hand-off
that can no longer happen.

**Contract**: Rewrite Phase 4's `Goal` to prove the send-state and owner↔link pairing rules
hold against the fanout as shipped, and to lock the floor in CI. Test types become
integration plus gates (keeping the AI-native PR review). Phase 4 keeps its position.

#### 4. §3 order rationale

**File**: `context/foundation/test-plan.md`

**Intent**: Two clauses in the rationale paragraph no longer hold. Its closing argument —
*"Phase 4 last because [the top risk's] code does not exist yet"* — is now false, and it is
the sentence that justifies the whole ordering. And its account of the registry risk as
something that *"rides along"* in Phase 1 "rather than getting its own" phase describes a
minor passenger, which is not what Risk #1 is.

**Contract**: Two clause replacements, one paragraph. The numbers in it are already correct
and stay untouched; these edits change the argument, not the labels. Leave the 2026-08-06
sentence about Risk #9 joining Phase 3 alone — it is newer than this plan.

- Rewrite the registry clause. Phase 1 covers Risk #8's parse half not because it is cheap
  enough to ride along, but because it is the precondition the rest of the rollout depends on
  and its parse half happens to be the cheapest thing in the repository to assert. Keep the
  existing point that its atomicity half cannot ride along — "what state does a refused
  import leave behind" is a database question, so it stays in Phase 2 — since that reasoning
  is unchanged and is what splits the risk across two phases.
- Replace the Phase 4 clause. Phase 4 stays last because it depends on Phase 3's integration
  harness, and because retrofitting onto a shipped slice is the position this plan explicitly
  wanted to avoid and now cannot — record that as a cost of the refresh, not as a preference.

Keep the rest of the paragraph, including Phase 2's rationale, which still holds.

#### 5. §4 stack table — name Phase 1's runner — **superseded 2026-08-06, do not apply**

PR #39 installed the runner and rewrote this row, and it settled the question the other way:
`getViteConfig()` **cannot** be used here, because the Cloudflare adapter's Vite plugin
rejects the `ssr.resolve.external` list Vitest sets, and the run dies before collecting a
test. §4 now names Vitest 4.1.10 via `defineConfig` plus `vite-tsconfig-paths`, carries a
`checked:` date, and records the rejected alternative in a note beneath the table. Applying
this contract would re-introduce a configuration that does not work.

#### 6. §5 gates table

**File**: `context/foundation/test-plan.md`

**Intent**: Keep the gates aligned with the re-derived risks and the rescoped Phase 4.

**Contract**: Three cell edits. The `unit` gate's Catches column drops any implication of
threshold coverage — leave its 2026-08-06 clause about Risk #9 in place. The `database
contract` gate's Catches column gains the threshold and lock-ordering properties, and keeps
its flagged Docker-in-CI cost verbatim as a Phase 2 decision. The `fanout gate` row's
"enforced on the `S-04` slice" becomes enforcement against the shipped fanout, matching
Phase 4's rescope. The table's other 2026-08-06 changes — the removed `post-edit hook` row
and the AI-native review's earlier trigger — are settled; do not reopen either.

#### 7. §6.1 cookbook stub

**File**: `context/foundation/test-plan.md`

**Intent**: §6.1 promises Phase 1 will carry a pattern for asserting udział allocation
"including the rounding and tie-break cases that decide a near-threshold uchwała" — the same
over-claim as Phase 1's goal.

**Contract**: Narrow the sentence to the allocation and the tie-break rule itself; move the
near-threshold framing to §6.2, which is Phase 2's stub and where the threshold now lives.
Both stay `TBD`.

#### 8. §8 freshness ledger

**File**: `context/foundation/test-plan.md`

**Intent**: Record this refresh the way the Risk #8 amendment recorded itself — what moved,
which sections, and why — so the next reader is not left diffing to find out.

**Contract**: Four edits. Append the new entry above the existing 2026-08-06 amendments, so
the ledger stays newest-first; leave every earlier entry untouched.

- Update the three "last reviewed / last verified" dates to 2026-08-06, the day the refresh
  actually lands.
- Add a **Refresh, 2026-08-06** entry naming: the trigger that fired; that Risks #1 and #2
  were re-derived against shipped code; that `S-05`'s deadlock folded into #2 and the widened
  status guard into #3 rather than becoming new rows; the §3 goal edits; the Phase 4 rescope;
  and — as a decision, not an omission — that the renumber this refresh was planned to carry
  was **withdrawn**, with the reason, so the next reader does not re-open it by accident.
- Record the **considered no-ops** explicitly: §7 was reviewed and left unchanged (its "v1
  non-restrictions" bullet is about the absent roles model, and a database guard is not a
  role, so the bullet does not excuse skipping it); no risk rows were appended by this
  refresh; and §1's hot-spot figure, §4's runner row and §3's Phase 1 status cell were
  already correct on arrival — landed by PR #39 and by the 2026-08-06 corrections. Recording
  a no-op is the point: it stops the next refresh re-opening a settled question.
- Retire the fired trigger: delete the "Scheduled refresh — after roadmap `S-04` … ships"
  paragraph and keep the four standing condition-based triggers, noting in the refresh
  entry that the scheduled mechanism was used once, worked, and was deliberately not
  replaced with another date.

#### 9. Document header

**File**: `context/foundation/test-plan.md`

**Intent**: The header's `Last updated` line is what a reader checks first.

**Contract**: `Last updated: 2026-08-06 (refresh after S-04 and S-05 — see §8)`. No renumber
is announced, because none is made; the risk labels mean today what they meant yesterday.

#### 10. Change record

**File**: `context/changes/test-plan-refresh-2026-08-05/change.md`

**Intent**: Reflect that the change is planned and record what it is actually about — the
folder was created with an empty intent.

**Contract**: `status: planned`, `updated: 2026-08-05`, a title naming the refresh rather
than the humanized slug, and a `## Notes` body recording the trigger and the
document-only boundary.

### Success Criteria

#### Automated Verification

- All eight section headings `## 1.`–`## 8.` are present and in order
- §3's table still has four phase rows, and every `Status` cell is a parser literal
- §8 contains no remaining "Scheduled refresh" paragraph, and the three date lines read 2026-08-06
- §8's refresh entry records the withdrawn renumber as a decision
- The document header's `Last updated` line reads 2026-08-06 and announces no renumber
- `context/foundation/test-plan.md` and this change folder are the only paths in `git diff --stat` against `origin/main`
- Prettier's markdown formatting is clean (husky + lint-staged runs it on commit)

#### Manual Verification

- §3's order rationale reads as a current argument, not a patched one — no sentence survives that assumes `S-04` is unbuilt
- §8's entry accounts for every section this change touched, including the no-ops
- The document states a runner exists and is honest about what a green run currently proves; `CLAUDE.md`'s rules are still true against the repo as it stands
- Read end to end, the document does not read as three documents — the 2026-08-04 text, the 2026-08-06 corrections, and the refreshed text should be indistinguishable in register

**Implementation Note**: after this phase, commit, push the branch, and open the PR against
`main`. Commit, push, and merge are three separate approvals; the merge deploys to
production and is the one that matters.

---

## Testing Strategy

There is no test runner in this repository, and this change does not add one. Verification
is the automated checks listed per phase — all of them structural greps and git assertions
over one markdown file — plus manual read-through. Do not report that tests passed.

### Structural checks

- Risk table: exactly 8 rows, numbered 1–8, order preserved
- Source column: no `file:line`, no source filenames, no bare error codes
- §3 Status column: only the six parser literals
- Section headings: `## 1.` through `## 8.` present and ordered
- Diff scope: one document plus this change folder

### Manual testing steps

1. Read §2 rows #1, #2, #3 against `CLAUDE.md`'s "Current state" entries for `S-04` and
   `S-05` — every claim in Source should be traceable to something recorded there.
2. Read §3's rationale paragraph start to finish and confirm no clause depends on `S-04`
   being unbuilt.
3. Confirm §8's entry names every section the diff touches.
4. Confirm the diff touches no file outside `context/`.

## Migration Notes

Not applicable — no schema, no code, no deployment. The only migration-shaped hazard is the
branch base (see Critical Implementation Details), which is a Phase 1 gate.

## References

- Refreshed document: `context/foundation/test-plan.md` (on `origin/main` at `15ed4af`)
- Refresh contract and schema constraints: `.claude/skills/10x-test-plan/SKILL.md:356`,
  `:358`, `:575`; `.claude/skills/10x-test-plan/references/test-plan-schema.md`
- Slice records this refresh re-derives against: `context/changes/voting-link-email-fanout/`,
  `context/changes/live-tally-and-outcome/`
- Project rules and shipped-state narrative: `CLAUDE.md` ("Current state")
- Branch and PR discipline: `context/foundation/lessons.md` — "Każdy feature i fix przez
  własną gałąź i pull request", and "Sprawdź `git branch --show-current` przed każdym commitem"

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Grounding and mechanical corrections

**Landed 2026-08-06 by other work — see the amendment under `## Overview`.**

#### Automated

- [x] 1.1 Working tree is on a branch containing the file — `docs/test-plan-refresh-s04-s05`, cut from `origin/main` at `d4779b6`; the name differs from this plan's by the author's choice
- [x] 1.2 ~~269-line pre-edit fingerprint~~ — void: the file is past 380 lines after PR #39 and the 2026-08-06 corrections
- [x] 1.3 §3 contains no occurrence of `testing-share-arithmetic` — fixed by PR #39
- [x] 1.4 Every §3 `Status` cell matches one of the six parser literals — PR #39
- [x] 1.5 The hot-spot figures in §1 reproduce when the stated method is re-run — corrected 2026-08-06, scoped count 19 against a repo-wide 68

#### Manual

- [x] 1.6 §1's method sentence is specific enough to re-run and get the same number
- [x] 1.7 The note explaining why the figure moved reads as a correction — §8, amendment of 2026-08-06, which also fixed §2's unit labels

### Phase 2: Risk map re-derivation (§2)

#### Automated

- [x] 2.1 §2's risk table has exactly 9 data rows, numbered 1–9 ascending, none missing or duplicated
- [x] 2.2 Every risk keeps the number and position it had before this phase
- [x] 2.3 The Risk Response Guidance table carries one row per risk 1–9, in the same ascending order
- [x] 2.4 §2's "Ordering note" survives and still accounts for both appended rows
- [x] 2.5 §1's `principle #3` reference is unchanged
- [x] 2.6 No Source cell matches a `file:line` pattern, a source filename, or a bare error code
- [x] 2.7 `git diff --stat` shows `context/foundation/test-plan.md` as the only changed file

#### Manual

- [x] 2.8 Risk #2 reads as one failure with three routes, not three risks in one cell
- [x] 2.9 Risk #1's Source separates what production proved from what it did not
- [x] 2.10 #1's guidance tells a reader what to assert and what mistake to avoid
- [x] 2.11 Nothing in §2 names a file, function, trigger, or error code

### Phase 3: Rollout, stack, gates and ledger (§3–§5, §8)

#### Automated

- [ ] 3.1 All eight section headings `## 1.`–`## 8.` are present and in order
- [ ] 3.2 §3's table has four phase rows, every `Status` cell a parser literal
- [ ] 3.3 §8 has no remaining "Scheduled refresh" paragraph, and the three date lines read 2026-08-06
- [ ] 3.4 §8's refresh entry records the withdrawn renumber as a decision
- [x] 3.5 §4's `unit + integration` row no longer reads "none yet" — PR #39; `getViteConfig()` rejected with its reason
- [ ] 3.6 The document header's `Last updated` line reads 2026-08-06 and announces no renumber
- [ ] 3.7 Only `context/foundation/test-plan.md` and this change folder appear in `git diff --stat` against `origin/main`
- [ ] 3.8 Prettier's markdown formatting is clean

#### Manual

- [ ] 3.9 §3's order rationale contains no clause assuming `S-04` is unbuilt
- [ ] 3.10 §8's entry accounts for every section touched, including the no-ops
- [x] 3.11 §4's Vitest row states the rejected alternative well enough not to be re-opened — PR #39
- [ ] 3.12 The document is honest about what a green run proves; `CLAUDE.md`'s rules are still true
- [ ] 3.13 The document reads as one document, not three registers spliced together
