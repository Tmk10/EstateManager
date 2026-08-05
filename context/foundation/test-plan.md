# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-08-04 (Risk #8 added — see §8)

Body is English (per `CLAUDE.md`: code, comments and docs in English) with Polish
domain nouns kept verbatim — *uchwała*, *udziały*, *lokal*, *właściciel* — because
they are the names the PRD and the schema use.

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the risk
   wins. Do not promote to e2e because e2e "feels safer." Do not put a vision
   model on top of a deterministic visual diff that already catches the
   regression.
2. **User concerns are first-class evidence.** Risks anchored in "the team is
   worried about X, and the failure would surface somewhere in `<area>`" carry
   the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents *what could
   fail* and *why we believe it's likely* — drawn from documents, interview, and
   codebase *signal* (churn, structure, test base). It does NOT claim to know
   which line owns the failure. That knowledge is produced by `/10x-research`
   during each rollout phase. If the plan and research disagree about where the
   failure lives, research is the ground truth.

Hot-spot scope used for likelihood weighting: `src/`, `supabase/` (68 commits in
30 days). Excluded: `context/`, `docs/`, `.github/`, generated types, lockfiles,
build output. The four `auth` clusters in that scan are dominated by deletions
(`F-01` removed the signup path) and are therefore **not** used as likelihood
evidence for any risk below.

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by risk =
impact × likelihood. Risks are failure scenarios in user / business terms, not
test names. The Source column cites the *evidence that surfaced this risk* —
never a specific file as "where the failure lives" (that is research's job, see
§1 principle #3).

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence — not anchor) |
|---|---|---|---|---|
| 1 | An owner receives a voting link that is not theirs — or receives none at all — so a bearer credential reaches the wrong person and the resolution's electorate stops matching the registry. | High | High | interview Q1 (three separate answers: someone else's link, link for the wrong lokal, more than one link per uchwała); roadmap `S-04` Unknowns (no idempotency keys from the mail provider, no batch endpoint, resume-not-restart unresolved); PRD `## Success Criteria` → Guardrails, FR-002, FR-004 |
| 2 | An uchwała is declared *podjęta* or *upadła* against udziały that do not reflect the registry — rounding, a wrong denominator, or a recomputation overriding what a vote was worth when cast moves a near-threshold outcome. | High | High | interview Q1 ("udział zostanie źle policzony", wrong vote outcome); PRD `## Success Criteria`, FR-006, FR-007; hot-spot dir `src/lib/` (14 commits/30d); roadmap `S-05` still `proposed` |
| 3 | Someone outside the registry casts a binding vote at another właściciel's weight, because one of the several independent guards on an open uchwała's electorate is relaxed by a later migration. | High | Medium | PRD `## Success Criteria` → Guardrails ("nikt spoza rejestru nie oddaje głosu"); roadmap `S-03` record (a guard was already found bypassable during review and reproduced end to end before the fix); hot-spot dir `supabase/migrations/` (9 commits/30d); interview Q1, Q3 |
| 4 | One właściciel's weight is counted twice in a single uchwała — via a duplicate link issued for that uchwała, or via the vote-finality guarantee being loosened. | High | Medium | interview Q1 (double vote in one uchwała; more than one link per uchwała); PRD `## Functional Requirements` domain rule "Jeden właściciel = jeden głosujący… głosuje raz"; roadmap `S-03` recorded residual (the write denial rests on policies, with no accompanying revoke); hot-spot dir `supabase/migrations/` |
| 5 | A właściciel's vote is stored or tallied as the opposite choice, or is silently not stored at all, while the page still reads as success. | High | Medium | interview Q1 ("głos za zostanie potraktowany jako głos przeciw", "głos użytkownika nie zostanie policzony"); PRD FR-005 and US-01 acceptance criteria (właściciel must receive confirmation the vote was saved); interview Q3 (voting routes named as low-confidence); hot-spot dir `src/pages/vote/` |
| 6 | Owner personal data — another person's name, metraż, udział, e-mail address, or vote — becomes readable from the unauthenticated voting surface. | High | Medium | PRD `## Success Criteria` → Guardrails ("dane właścicieli nie wychodzą poza budynek") and `## Non-Functional Requirements`; roadmap `S-02` / `S-03` records (the single anon surface was widened by two columns, and widening is the expected direction of travel); hot-spot dir `supabase/migrations/`; interview Q3 |
| 7 | A hit and a miss on a voting link become distinguishable — status, headers, body, or redirect differ between a real token, an unknown token, and a still-draft uchwała — turning the link into an oracle for "is this address a voter". | Medium | Medium | PRD Guardrails; roadmap `S-02` "Do przemyślenia" and `S-03` record (all three response headers must precede token resolution); interview Q3; hot-spot dir `src/pages/vote/` |
| 8 | An administrator cannot get a budynek and its rejestr lokali into the system at all — the form or the import refuses a legitimate real-world list, or a failed import leaves the budynek permanently unusable because v1 offers no way to re-import or edit. Nothing downstream is reachable: no uchwała, no links, no votes. | High | High | user, 2026-08-04; PRD FR-011, FR-001, and `## Non-Goals` ("bez edycji rejestru" — the rejestr is static in v1, so a bad import is not recoverable through the product); roadmap `S-01b` Unknowns, both still open (which file format a zarządca actually holds, and whether a total off 100% after rounding is rejected or accepted with a warning); hot-spot dir `src/lib/` (14 commits/30d) |

**Ordering note.** Rows are ordered by impact × likelihood **except #8**, which was
added on 2026-08-04 after the initial write and is appended rather than inserted,
because §3 references risk numbers and the schema forbids renumbering. By score it
sorts alongside #1 and #2 at the top of the map — read it there.

**Abuse lens coverage.** Authorization / subject-binding: #3. Credential
misdelivery: #1. PII leakage: #6. Information disclosure through response
differences: #7. Resource abuse (daily send limits, mass-triggering of side
effects) is folded into #1's response guidance rather than given its own row —
the provider caps the channel and the PoC building sits well under the cap, so a
standalone row would pad the map.

**Not modelled as a risk, deliberately.** An administrator reading another
building's rows: the `authenticated` policies are `using (true)` by decision in
v1 (no roles model exists, so there is nothing to scope to). A test today would
assert a restriction that does not exist. The rule that *does* hold — own-data-only
on the unauthenticated surface — is #6. Revisit when the v2 roles model lands.

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|---|---|---|---|---|---|
| #1 | A re-run or partially-failed fanout delivers each właściciel exactly their own link, exactly once per uchwała; owners with no address are surfaced to the administrator, not silently dropped | "The send succeeded because the call returned"; "re-running is safe because the link insert is idempotent" — link idempotency is not send idempotency | The per-owner send-state record, how a resumed run re-derives the owner↔token pairing, the read path that can see tokens at all, and how the daily-limit error is surfaced rather than retried | integration (against the local stack) | Asserting only the count of sends; mocking the pairing step, which is the thing under test |
| #2 | A registry whose areas force rounding still totals exactly 100%; ties resolve identically on a re-parse of the same bytes; and a vote's recorded weight stays authoritative over any later recomputation | "The shares sum to 100%, therefore each share is right"; "the tally can safely recompute from the current registry" | The allocation's tie-break rule and what it depends on, the snapshot's stated contract, and whether the threshold is compared against the building total or against udziały cast | unit (pure, no infrastructure) | Lifting the expected value out of the allocation code — the oracle must come from FR-006 / FR-007, not from the implementation under test |
| #3 | With an uchwała open, every route to changing who may vote fails — including delete-then-recreate, not only direct mutation | "One guard covers it" — review already found a guard bypassable through a different operation | Which operations each guard binds, which *caller* each binds (a definer function bypasses policies entirely), and what a caller reaching the data API directly can attempt | contract (pgTAP, exercised as `anon` and as `authenticated`) | Testing only the operation the guard is named after |
| #4 | A second vote by the same właściciel on the same uchwała fails at every layer independently, and no właściciel ends up holding two links for one uchwała | "The unique constraint covers it" — the layers bind different callers, and a policy edit can silently remove one without the others noticing | Each finality mechanism and the caller it binds; whether the write denial rests on policies alone or also on grants | contract (pgTAP) | Asserting one mechanism and assuming the rest; a test that would still pass if the write grants were re-opened |
| #5 | A vote is retrievable afterwards carrying the same choice the właściciel pressed, and a write that fails is never presented as a stored vote | "A 200 or a redirect means the vote landed"; "the confirmation screen proves persistence" | The two-step confirm path and which step performs the write, what the reader sees on re-opening the link, and how a failed write is signalled without breaking #7 | integration | Asserting the rendered confirmation instead of the persisted row |
| #6 | The unauthenticated surface returns the reader's own data and nothing about any other właściciel, across every column it exposes | "It is `security definer` and narrow, therefore safe" — narrowness is a property of the current return list, not of the mechanism | Exactly which columns the anon surface returns today, and what joins sit behind each of them | contract (pgTAP) | Snapshotting the current return shape without asserting the *rule* (own-data-only), so a later widening passes review unchallenged |
| #7 | An unknown token, a draft-uchwała token, and a forged choice produce identical status, headers, and redirect to what a real token's miss branch produces | "A more specific error message is a usability improvement" | Where response headers are set relative to token resolution, and every branch that can emit a differing status, header, or query string | integration | Asserting only the body — a test blind to headers and status is blind to the actual leak |
| #8 | A registry file carrying the messiness of a real zarządca's export — Polish diacritics, a decimal comma, `;` separators, CRLF, a byte-order mark, trailing blank rows, one address held by one person across several lokale — either imports cleanly or is refused with a message naming the offending line. And a refused import leaves the budynek importable again, not half-populated and permanently locked | "The import succeeded because the call returned"; "a rejected import is harmless." The second is the dangerous one: re-import is refused by product decision and v1 has no registry editing, so a partial write turns a recoverable mistake into a dead budynek. Also challenge "our fixture CSV is representative" — it was authored alongside the parser, so it cannot fail for the right reason | Whether the whole import is one transaction or can leave rows behind on failure; what the already-populated check considers "populated"; which rejections name the offending line and which are opaque; whether the downloadable template and the parser can drift apart; what the building-create uniqueness rule treats as a duplicate | unit for the parse half (pure, no infrastructure); contract for the atomicity and recoverability half — that behaviour is the database's, not the parser's | Round-tripping the project's own template as the only input, which tests the generator against itself; asserting the happy path and never the refusal messages; treating a rejection as pass without checking what state it left behind |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder via
`/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|---|---|---|---|---|---|
| 1 | Runner bootstrap and share arithmetic | Stand up a test runner, pin the udział allocation that decides every future outcome, and prove a real-world registry file parses or is refused legibly | #2, #8 (parse half) | unit | change opened | `context/changes/testing-share-arithmetic/` |
| 2 | Database contract tests | Prove the electorate, vote finality, own-data-only, and registry-import atomicity rules hold as `anon` and as `authenticated` | #3, #4, #6, #8 (atomicity half) | contract | not started | — |
| 3 | Voting-path integration | Prove a vote round-trips with the choice the właściciel pressed, and that a hit and a miss stay indistinguishable | #5, #7 | integration (e2e only if no cheaper layer reaches the two-step confirm) | not started | — |
| 4 | Quality gates and fanout gate spec | Lock the floor in CI and define what the e-mail fanout must prove before it merges | #1, cross-cutting | gates, AI-native PR review | not started | — |

**Order rationale.** Phase 1 first because nothing is testable until a runner
exists, and the share modules are pure and dependency-free — the highest signal
per unit of cost in the repository, on the top hot-spot directory. Risk #8's
parse half rides along in that phase rather than getting its own: it is the same
kind of pure, file-in / values-out code, in the same directory, and splitting it
out would buy a second change folder for no extra signal. Its atomicity half
cannot ride along — "what state does a refused import leave behind" is a database
question, so it lands in Phase 2. Phase 2 next
because that is where the risk actually concentrates: the second hot-spot
directory, named in interview Q3, forward-only with no rollback, and the only
layer able to bind callers the application layer cannot reach. Phase 3 depends
on Phase 1's runner and Phase 2's fixtures. Phase 4 last because Risk #1 is the
top risk but **its code does not exist yet** — roadmap `S-04` is unbuilt, so this
phase writes the gate that `S-04`'s own plan must satisfy, rather than
retrofitting tests onto a slice that already shipped.

## 4. Stack

The classic test base for this project. AI-native tools carry a `checked:` date
so future readers can see which lines need re-verification.

| Layer | Tool | Version | Notes |
|---|---|---|---|
| unit + integration | none yet — see Phase 1 | — | Astro's official testing guide wires **Vitest** through `getViteConfig()` from `astro/config`, which loads the project's Astro config into the test environment; checked: 2026-08-04 |
| database contract | none yet — see Phase 2 | — | Supabase ships **pgTAP** through `supabase test db`, with helpers to create a user and run assertions *as* a given role — the only layer that can assert RLS and trigger behaviour per caller; requires Docker and the local stack; checked: 2026-08-04 |
| API mocking | not planned | — | The boundaries that matter here are Postgres and the mail binding. Postgres is exercised for real via the local stack (Phase 2); the mail binding sits in §7 negative space. A mocking library would add a layer with nothing to mock. |
| e2e | conditional — see Phase 3 | — | Astro's guide names Playwright and Cypress. Neither is installed and neither is adopted by default: Phase 3 promotes to e2e **only** if integration cannot reach the two-step confirm path; checked: 2026-08-04 |
| accessibility | not planned | — | Excluded with UI testing generally; see §7 |
| (optional) AI-native | LLM review of migration and anon-surface diffs at PR time — checked: 2026-08-04 | n/a | **When NOT to use:** whenever the check is expressible as a pgTAP assertion. Phase 2's deterministic tests win on cost and reliability. This row exists only for *new* surfaces no existing assertion covers — a table added without the full per-operation × per-role policy shape, a grant to `anon`, or a widening of the anon return list beyond the reader's own data. |

**Consequence to record now.** `CLAUDE.md` currently states as a hard rule that
"There is no test runner… never report that tests passed." Phase 1 makes that
line false. Updating it is part of Phase 1's scope, not a follow-up — an agent
reading the stale rule will refuse to run the suite that exists.

**Stack grounding tools (current session):**

- Docs: **Context7, via the `ctx7` CLI** — resolved `/withastro/docs` and `/supabase/supabase`; read Astro's testing guide (Vitest via `getViteConfig()`, Playwright/Cypress for e2e) and Supabase's pgTAP guide (`supabase test db`, role-switching helpers for RLS assertions); checked: 2026-08-04
- Search: **none used** — web search is available in this session but the primary sources answered the stack questions directly; checked: 2026-08-04
- Runtime/browser: **no Playwright MCP in session** — Playwright would be a dependency to add, not a tool already present. Not used; checked: 2026-08-04
- Provider/platform: **no GitHub, Supabase, or Cloudflare MCP in session**. The `gh`, `supabase`, and `wrangler` CLIs are available locally and are what Phase 4's gates will invoke; checked: 2026-08-04

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.
"Required after §3 Phase `<N>`" means the gate is enforced once that rollout
phase lands; before that, the gate is planned.

| Gate | Where | Required? | Catches |
|---|---|---|---|
| lint + typecheck | local + CI (`ci.yml`, `deploy.yml`) | required — already wired | syntactic and type drift; the type-aware pass needs `astro sync` first |
| build | local + CI | required — already wired | build-time breakage before deploy |
| unit | local + CI | required after §3 Phase 1 | udział allocation regressions (#2); a registry file that a real zarządca could plausibly hand over failing to parse, or being refused without naming the offending line (#8) |
| database contract | local + CI | required after §3 Phase 2 | electorate, finality, and own-data-only regressions (#3, #4, #6); a failed import leaving a budynek half-populated and therefore permanently locked (#8). Cost to flag during Phase 2: this gate needs Docker and a migrated local stack inside CI, which no current workflow provides |
| voting-path integration | CI on PR | required after §3 Phase 3 | vote round-trip and hit/miss indistinguishability regressions (#5, #7) |
| e2e on the confirm flow | CI on PR | conditional — only if §3 Phase 3 promotes | the two-step confirm crossing, if integration cannot reach it |
| fanout gate | CI on PR | required after §3 Phase 4, enforced on the `S-04` slice | link misdelivery and non-idempotent re-runs (#1) |
| post-edit hook | local (agent loop) | recommended after §3 Phase 1 | regressions at edit time, fed back to the agent mid-session. Not a CI substitute. Configuration is out of this plan's scope |
| AI-native migration / anon-surface review | CI on PR | recommended after §3 Phase 4 | new surfaces no deterministic assertion covers yet (see §4 for when NOT to use) |
| post-deploy health assertion | `deploy.yml` after `wrangler deploy` | required — already wired | a Worker that deploys but cannot reach Supabase. Known limit: it certifies the version live when it ran, and a second, unlinted deploy path can replace that version seconds later |

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once the
relevant rollout phase ships; before that, the sub-section names the pattern it
will carry.

### 6.1 Adding a unit test

TBD — see §3 Phase 1. Will carry two patterns: asserting udział allocation
against an independent oracle (FR-006 / FR-007), including the rounding and
tie-break cases that decide a near-threshold uchwała; and asserting that a
registry file parses or is refused legibly, with fixtures authored *against the
format a zarządca actually uses* rather than round-tripped from the project's own
downloadable template.

### 6.2 Adding a database contract test

TBD — see §3 Phase 2. Will carry the pattern for asserting a rule *as a specific
role*, including the delete-then-recreate bypass shape and how to write a test
that fails if a write denial is loosened.

### 6.3 Adding an integration test for a voting route

TBD — see §3 Phase 3. Will carry the pattern for asserting persistence rather
than rendered confirmation, and for asserting status and headers — not only
bodies — so a hit/miss leak is visible.

### 6.4 Adding a test for a new API endpoint

TBD — see §3 Phase 3. Will carry the request → response *and* side-effect
pattern, plus the rule for when an endpoint's failure mode justifies e2e instead.

### 6.5 Adding a test for a new table or migration

TBD — see §3 Phase 2. Will carry the checklist a new table must satisfy before
merge: the per-operation × per-role policy shape, the `anon` denial, what to
assert when a definer function is introduced, and — for any write path that
refuses to run twice — what state a *failed* run must leave behind.

### 6.6 Per-rollout-phase notes

Filled in as phases land — two or three lines each, capturing anything a phase
taught that the sections above do not already say.

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5). Future
contributors should respect these unless the underlying assumption changes.

- **UI and visual regression** — no snapshot or pixel-diff tests on pages,
  Tailwind classes, or generated components. Polish copy is still moving and the
  PRD explicitly declines to commit to mobile usability. Re-evaluate if a screen
  becomes load-bearing for a decision rather than for presentation. (Source:
  Phase 2 interview Q5.)
- **Generated and vendor code** — generated database types and Worker binding
  types are not tested; the generator is the test. Neither is third-party
  behaviour (Supabase, Cloudflare, Astro internals). Re-evaluate if a generator
  upgrade silently changes a contract the app relies on. (Source: Phase 2
  interview Q5.)
- **Authentication mechanics** — cookie-based sessions and the sign-in /
  sign-out round trip are excluded; the round trip was verified live on
  production and administrator accounts are created by hand outside the app.
  Re-evaluate when the v2 roles model lands, because that turns "who is logged
  in" into an authorization question rather than a session question. (Source:
  Phase 2 interview Q5.)
- **Mail deliverability** — whether a message reaches the inbox rather than
  spam, and the behaviour of the mail binding itself, are out of scope; the PRD
  moved deliverability to v2 by decision. Note the boundary: *deliverability* is
  excluded, but *who receives which link* is Risk #1 and is very much tested.
  Re-evaluate when deliverability re-enters scope in v2. (Source: Phase 2
  interview Q5, PRD `## Non-Goals`.)
- **v1 non-restrictions asserted as restrictions** — building-scoped access for
  authenticated callers, the roles model, registry editing, per-uchwała
  thresholds, and the paper channel are all explicit v1 non-goals. Writing tests
  against them would assert behaviour the product deliberately does not have.
  Re-evaluate per item as each leaves `## Non-Goals`.

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-08-04
- Stack versions last verified: 2026-08-04
- AI-native tool references last verified: 2026-08-04

**Amendment, 2026-08-04.** Risk #8 (an administrator cannot get a budynek and its
rejestr into the system) was added at the user's direction after the initial
write, outside the normal `--refresh` path. Consequential edits: §2 risk map and
response guidance, §3 Phases 1 and 2 (risks covered, goals, order rationale), §5
unit and database-contract gates, §6.1 and §6.5. Recorded here because §1–§5 are
otherwise frozen between refreshes, and a reader comparing this file against its
first commit should be able to see why it moved.

**Scheduled refresh — after roadmap `S-04` (`voting-link-email-fanout`) ships.**
Agreed 2026-08-04, at the initial write. Risk #1 is the highest-scored risk in §2
and the only one whose code did not exist when this plan was written, so its
likelihood, its response guidance, and Phase 4's gate specification are all
estimates made against an unbuilt slice. Once `S-04` exists, run
`/10x-test-plan --refresh` and re-derive Risk #1 against real code — in
particular the send-state record, the resumed-run pairing, and whether the
fanout gate belongs in Phase 4 or in `S-04`'s own change. Until then, treat
Phase 4's Risk #1 rows as provisional.

Refresh (`/10x-test-plan --refresh`) also when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
