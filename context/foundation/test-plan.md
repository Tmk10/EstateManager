# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-08-06 (refresh after S-04 and S-05 — see §8)

Body is English (per `CLAUDE.md`: code, comments and docs in English) with Polish
domain nouns kept verbatim — _uchwała_, _udziały_, _lokal_, _właściciel_ — because
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
3. **Risks are scenarios, not code locations.** This plan documents _what could
   fail_ and _why we believe it's likely_ — drawn from documents, interview, and
   codebase _signal_ (churn, structure, test base). It does NOT claim to know
   which line owns the failure. That knowledge is produced by `/10x-research`
   during each rollout phase. If the plan and research disagree about where the
   failure lives, research is the ground truth.

Hot-spot scope used for likelihood weighting: `src/`, `supabase/` — 19 of the 68
commits in the 30 days to 2026-08-04 touched that scope, and the per-directory
figures cited in §2 count **file changes** inside it, not commits. Excluded:
`context/`, `docs/`, `.github/`, generated types, lockfiles, build output. The
four `auth` clusters in that scan are dominated by deletions (`F-01` removed the
signup path) and are therefore **not** used as likelihood evidence for any risk
below.

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by risk =
impact × likelihood. Risks are failure scenarios in user / business terms, not
test names. The Source column cites the _evidence that surfaced this risk_ —
never a specific file as "where the failure lives" (that is research's job, see
§1 principle #3).

| #   | Risk (failure scenario)                                                                                                                                                                                                                                                                                                                                                                            | Impact | Likelihood | Source (evidence — not anchor)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | An owner receives a voting link that is not theirs — or receives none at all — so a bearer credential reaches the wrong person and the resolution's electorate stops matching the registry.                                                                                                                                                                                                        | High   | High       | interview Q1 (three separate answers: someone else's link, link for the wrong lokal, more than one link per uchwała); roadmap `S-04`, shipped and run on production 2026-08-04 — the per-owner send state and the resume-rather-than-restart rule now exist, closing the Unknowns this row previously cited as open, and a second run was observed sending nothing while a resumed run reached exactly those still unsent. What production did **not** exercise is the failure vocabulary: the provider's own failure conditions cannot be produced on demand, so the wording shown when a send fails went out untested and the first real failure is its first test; PRD `## Success Criteria` → Guardrails, FR-002, FR-004                                                                                         |
| 2   | An uchwała is declared _podjęta_ or _upadła_ against udziały that do not reflect the electorate. Three routes reach it: rounding or a wrong denominator; a recomputation overriding what a vote was worth when it was cast; or a vote that was cast and never recorded at all, which subtracts from the tally as surely as a mis-weighted one.                                                     | High   | High       | interview Q1 ("udział zostanie źle policzony", wrong vote outcome); PRD `## Success Criteria`, FR-006, FR-007; hot-spot dir `src/lib/` (14 file changes/30d); roadmap `S-05`, shipped 2026-08-05 — the threshold now exists in exactly one place in the database layer and no application code expresses it, which narrows the surface without removing the risk. Two facts from that slice keep the likelihood high: a concurrency defect was reproduced there in which two owners voting at the same moment deadlocked and the loser's vote was silently dropped, fixed by the _order_ in which locks are taken rather than by their strength; and the tally's numerator comes from the weights recorded on votes while its denominator comes from the registry, two sources that agree only by construction in v1 |
| 3   | Someone outside the registry casts a binding vote at another właściciel's weight, because one of the several independent guards on an open uchwała's electorate is relaxed by a later migration.                                                                                                                                                                                                   | High   | Medium     | PRD `## Success Criteria` → Guardrails ("nikt spoza rejestru nie oddaje głosu"); roadmap `S-03` record (a guard was already found bypassable during review and reproduced end to end before the fix) and roadmap `S-05` record (a second instance of the same shape: a status guard widened to admit two legitimate new transitions admitted them for **every** authenticated writer, so a signed-in administrator could set an outcome through the data API with no votes behind it — reproduced, then closed in the same change. Two instances of a shape is materially stronger evidence than one); hot-spot dir `supabase/migrations/` (9 file changes/30d); interview Q1, Q3                                                                                                                                    |
| 4   | One właściciel's weight is counted twice in a single uchwała — via a duplicate link issued for that uchwała, or via the vote-finality guarantee being loosened.                                                                                                                                                                                                                                    | High   | Medium     | interview Q1 (double vote in one uchwała; more than one link per uchwała); PRD `## Functional Requirements` domain rule "Jeden właściciel = jeden głosujący… głosuje raz"; roadmap `S-03` recorded residual (the write denial rests on policies, with no accompanying revoke); hot-spot dir `supabase/migrations/`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 5   | A właściciel's vote is stored or tallied as the opposite choice, or is silently not stored at all, while the page still reads as success.                                                                                                                                                                                                                                                          | High   | Medium     | interview Q1 ("głos za zostanie potraktowany jako głos przeciw", "głos użytkownika nie zostanie policzony"); PRD FR-005 and US-01 acceptance criteria (właściciel must receive confirmation the vote was saved); interview Q3 (voting routes named as low-confidence); hot-spot dir `src/pages/vote/`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 6   | Owner personal data — another person's name, metraż, udział, e-mail address, or vote — becomes readable from the unauthenticated voting surface.                                                                                                                                                                                                                                                   | High   | Medium     | PRD `## Success Criteria` → Guardrails ("dane właścicieli nie wychodzą poza budynek") and `## Non-Functional Requirements`; roadmap `S-02` / `S-03` records (the single anon surface was widened by two columns, and widening is the expected direction of travel); hot-spot dir `supabase/migrations/`; interview Q3                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 7   | A hit and a miss on a voting link become distinguishable — status, headers, body, or redirect differ between a real token, an unknown token, and a still-draft uchwała — turning the link into an oracle for "is this address a voter".                                                                                                                                                            | Medium | Medium     | PRD Guardrails; roadmap `S-02` "Do przemyślenia" and `S-03` record (all three response headers must precede token resolution); interview Q3; hot-spot dir `src/pages/vote/`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 8   | An administrator cannot get a budynek and its rejestr lokali into the system at all — the form or the import refuses a legitimate real-world list, or a failed import leaves the budynek permanently unusable because v1 offers no way to re-import or edit. Nothing downstream is reachable: no uchwała, no links, no votes.                                                                      | High   | High       | user, 2026-08-04; PRD FR-011, FR-001, and `## Non-Goals` ("bez edycji rejestru" — the rejestr is static in v1, so a bad import is not recoverable through the product); roadmap `S-01b` Unknowns, both still open (which file format a zarządca actually holds, and whether a total off 100% after rounding is rejected or accepted with a warning); hot-spot dir `src/lib/` (14 file changes/30d)                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 9   | A voting token — a bearer credential that needs no session — is retained outside the application: it travels in the URL path, so the platform's log store keeps every opened link for up to 7 days, readable by anyone holding dashboard access. Nothing enforces the other half either: no assertion stops a future code path from writing a token into a log line, an error body, or a redirect. | High   | High       | recorded hazard, `context/foundation/system-state.md` §Workers Logs and voting tokens (reproduced: observability enabled plus the token in the path yields 7-day retention, and the "no token in a log line" guarantee is a property of the source with nothing enforcing it); PRD `## Success Criteria` → Guardrails (the link is personal and per-lokal); roadmap `S-02` / `S-03` records (no token may appear in any HTML response — the same containment rule, enforced there by column grants)                                                                                                                                                                                                                                                                                                                  |

**Ordering note.** Rows are ordered by impact × likelihood **except #8**, which was
added on 2026-08-04 after the initial write and is appended rather than inserted,
because §3 references risk numbers and the schema forbids renumbering. By score it
sorts alongside #1 and #2 at the top of the map — read it there. **#9 is appended
for the same reason**, on 2026-08-06; by score it belongs at the top too.

**Abuse lens coverage.** Authorization / subject-binding: #3. Credential
misdelivery: #1. Credential retention and handling: #9. Untrusted input: #8. PII
leakage: #6. Information disclosure through response
differences: #7. Resource abuse (daily send limits, mass-triggering of side
effects) is folded into #1's response guidance rather than given its own row —
the provider caps the channel and the PoC building sits well under the cap, so a
standalone row would pad the map.

**Not modelled as a risk, deliberately.** An administrator reading another
building's rows: the `authenticated` policies are `using (true)` by decision in
v1 (no roles model exists, so there is nothing to scope to). A test today would
assert a restriction that does not exist. The rule that _does_ hold — own-data-only
on the unauthenticated surface — is #6. Revisit when the v2 roles model lands.

### Risk Response Guidance

| Risk | What would prove protection                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Must challenge                                                                                                                                                                                                                                                                                                                                                                                     | Context `/10x-research` must ground                                                                                                                                                                                                                                                                                                               | Likely cheapest layer                                                                                                                                      | Anti-pattern to avoid                                                                                                                                                                                                                                                                                                                                           |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #1   | A re-run or partially-failed fanout delivers each właściciel exactly their own link, exactly once per uchwała; owners with no address are surfaced to the administrator, not silently dropped                                                                                                                                                                                                                                                                                                                                                                     | "The send succeeded because the call returned"; "re-running is safe because the link insert is idempotent" — link idempotency is not send idempotency; and "an owner can simply be sent their link again" — a link already sent is never re-attempted                                                                                                                                              | The per-owner send-state record, how a resumed run re-derives the owner↔token pairing, how a run that dies part-way through resumes, how a send that succeeded while its status write did not is told apart from one that never happened, the read path that can see tokens at all, and how the daily-limit error is surfaced rather than retried | integration (against the local stack)                                                                                                                      | Asserting only the count of sends; mocking the pairing step, which is the thing under test                                                                                                                                                                                                                                                                      |
| #2   | A registry whose areas force rounding still totals exactly 100%; ties resolve identically on a re-parse of the same bytes; a vote's recorded weight stays authoritative over any later recomputation; and two owners voting at the same moment both end up recorded, with the crossing of the threshold settling the uchwała exactly once — what proves that last clause is the **order** in which the vote path takes its locks, the strongest lock on the uchwała acquired before the vote row is inserted, and the assertion must fail if that step is removed | "The shares sum to 100%, therefore each share is right"; "the tally can safely recompute from the current registry"; "the threshold is reachable through one code path only" — it is reachable by any writer the guards do not bind                                                                                                                                                                | The allocation's tie-break rule and what it depends on, the snapshot's stated contract, whether the threshold is compared against the building total or against udziały cast, and where in the vote path each lock is taken relative to the insert                                                                                                | split — unit for the allocation (pure, no infrastructure); contract for the threshold and the ordering property                                            | Lifting the expected value out of the allocation code — the oracle must come from FR-006 / FR-007, not from the implementation under test. And treating the lock-ordering step as redundant: a foreign key already takes a weaker lock on the same parent row, so taking a stronger one earlier reads like tidying — removing it is exactly what dropped a vote |
| #3   | With an uchwała open, every route to changing who may vote fails — including delete-then-recreate, not only direct mutation                                                                                                                                                                                                                                                                                                                                                                                                                                       | "One guard covers it" — review already found a guard bypassable through a different operation; and "widening a guard to admit a legitimate new transition is a narrow change" — a guard widened for the caller the author had in mind is widened for every caller that reaches it                                                                                                                  | Which operations each guard binds, which _caller_ each binds (a definer function bypasses policies entirely), and what a caller reaching the data API directly can attempt                                                                                                                                                                        | contract (pgTAP, exercised as `anon` and as `authenticated`)                                                                                               | Testing only the operation the guard is named after                                                                                                                                                                                                                                                                                                             |
| #4   | A second vote by the same właściciel on the same uchwała fails at every layer independently, and no właściciel ends up holding two links for one uchwała                                                                                                                                                                                                                                                                                                                                                                                                          | "The unique constraint covers it" — the layers bind different callers, and a policy edit can silently remove one without the others noticing                                                                                                                                                                                                                                                       | Each finality mechanism and the caller it binds; whether the write denial rests on policies alone or also on grants                                                                                                                                                                                                                               | contract (pgTAP)                                                                                                                                           | Asserting one mechanism and assuming the rest; a test that would still pass if the write grants were re-opened                                                                                                                                                                                                                                                  |
| #5   | A vote is retrievable afterwards carrying the same choice the właściciel pressed, and a write that fails is never presented as a stored vote                                                                                                                                                                                                                                                                                                                                                                                                                      | "A 200 or a redirect means the vote landed"; "the confirmation screen proves persistence"                                                                                                                                                                                                                                                                                                          | The two-step confirm path and which step performs the write, what the reader sees on re-opening the link, and how a failed write is signalled without breaking #7                                                                                                                                                                                 | integration                                                                                                                                                | Asserting the rendered confirmation instead of the persisted row                                                                                                                                                                                                                                                                                                |
| #6   | The unauthenticated surface returns the reader's own data and nothing about any other właściciel, across every column it exposes                                                                                                                                                                                                                                                                                                                                                                                                                                  | "It is `security definer` and narrow, therefore safe" — narrowness is a property of the current return list, not of the mechanism                                                                                                                                                                                                                                                                  | Exactly which columns the anon surface returns today, and what joins sit behind each of them                                                                                                                                                                                                                                                      | contract (pgTAP)                                                                                                                                           | Snapshotting the current return shape without asserting the _rule_ (own-data-only), so a later widening passes review unchallenged                                                                                                                                                                                                                              |
| #7   | An unknown token, a draft-uchwała token, and a forged choice produce identical status, headers, and redirect to what a real token's miss branch produces                                                                                                                                                                                                                                                                                                                                                                                                          | "A more specific error message is a usability improvement"                                                                                                                                                                                                                                                                                                                                         | Where response headers are set relative to token resolution, and every branch that can emit a differing status, header, or query string                                                                                                                                                                                                           | integration                                                                                                                                                | Asserting only the body — a test blind to headers and status is blind to the actual leak                                                                                                                                                                                                                                                                        |
| #8   | A registry file carrying the messiness of a real zarządca's export — Polish diacritics, a decimal comma, `;` separators, CRLF, a byte-order mark, trailing blank rows, one address held by one person across several lokale — either imports cleanly or is refused with a message naming the offending line. And a refused import leaves the budynek importable again, not half-populated and permanently locked                                                                                                                                                  | "The import succeeded because the call returned"; "a rejected import is harmless." The second is the dangerous one: re-import is refused by product decision and v1 has no registry editing, so a partial write turns a recoverable mistake into a dead budynek. Also challenge "our fixture CSV is representative" — it was authored alongside the parser, so it cannot fail for the right reason | Whether the whole import is one transaction or can leave rows behind on failure; what the already-populated check considers "populated"; which rejections name the offending line and which are opaque; whether the downloadable template and the parser can drift apart; what the building-create uniqueness rule treats as a duplicate          | unit for the parse half (pure, no infrastructure); contract for the atomicity and recoverability half — that behaviour is the database's, not the parser's | Round-tripping the project's own template as the only input, which tests the generator against itself; asserting the happy path and never the refusal messages; treating a rejection as pass without checking what state it left behind                                                                                                                         |
| #9   | No code path in the product emits a token anywhere except the message addressed to the właściciel who owns it — not into a log line, an error body, a redirect target, or a third-party client's request record — and the property is enforced by something that fails when a later change breaks it, rather than by the current source happening to be clean                                                                                                                                                                                                     | "There is no `console.` in the voting modules, therefore tokens are not logged" — the platform records the request URL whatever the application does, so the retention half is untouched by any of this; and "the source is clean today" is an observation, not a guarantee                                                                                                                        | Every path that can carry a token outward — error handlers, redirect targets, any client that logs its own requests — and whether observability can be narrowed without losing the log store that `deploy.yml` health failures get diagnosed from                                                                                                 | static assertion over the voting modules (unit-level, no infrastructure); the retention half has no test layer at all and is recorded in §7 instead        | Matching on `console.log` and calling the risk covered — retention happens with a spotless codebase, so a green assertion here must never be read as "tokens are not retained"                                                                                                                                                                                  |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder via
`/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| #   | Phase name                            | Goal (one line)                                                                                                                                                                                                                                                                                           | Risks covered                                        | Test types                                                                                       | Status      | Change folder                                           |
| --- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------- | ------------------------------------------------------- |
| 1   | Runner bootstrap and share arithmetic | Prove a real-world registry file parses or is refused legibly — nothing downstream is reachable until it does — and pin the udział allocation that parse feeds; the threshold comparison that turns those udziały into an outcome is Phase 2's                                                            | #8 (parse half), #2 (allocation half)                | unit                                                                                             | not started | `context/changes/test-environment-bootstrap/` (runner)  |
| 2   | Database contract tests               | Prove the electorate, vote finality, own-data-only, and registry-import atomicity rules hold as `anon` and as `authenticated`, that the outcome threshold is measured against the whole building rather than against the udziały cast, and that two owners voting at the same moment both end up recorded | #2 (threshold half), #3, #4, #6, #8 (atomicity half) | contract                                                                                         | not started | `context/changes/test-environment-bootstrap/` (harness) |
| 3   | Voting-path integration               | Prove a vote round-trips with the choice the właściciel pressed, that a hit and a miss stay indistinguishable, and that no branch of these routes emits a token                                                                                                                                           | #5, #7, #9                                           | integration (e2e only if no cheaper layer reaches the two-step confirm); static assertion for #9 | not started | —                                                       |
| 4   | Quality gates and fanout retrofit     | Prove the send-state and owner↔link pairing rules hold against the fanout as it shipped, and lock the floor in CI                                                                                                                                                                                         | #1, cross-cutting                                    | integration, gates, AI-native PR review                                                          | not started | —                                                       |

**Harness landed ahead of the tests, 2026-08-05.** At the product owner's
direction, `context/changes/test-environment-bootstrap/` installed _both_ harnesses
— Vitest for Phases 1 and 3, pgTAP for Phase 2 — and wired both CI gates, without
writing the tests either phase exists to buy. Each layer carries a smoke test that
proves the harness and deliberately asserts nothing about the domain. Both Status
cells above therefore read `not started`, and they mean it literally: **no risk in
§2 is covered yet.** Their Change-folder cells name the change that bought the
harness, not one that bought a test. What changed is that covering a risk is now a
matter of writing a test rather than of choosing a tool, and the §5 gates are
already in place to enforce it the moment one exists. The status cell this replaced
claimed Phase 1 was `change opened` against
`context/changes/testing-share-arithmetic/`, a folder that existed on no branch;
correcting that was one of the two defects `context/changes/test-plan-refresh-2026-08-05/`
was opened to fix, and it is fixed here instead because this change is what made the
cell answerable.

**Order rationale.** Phase 1 first because nothing was testable until a runner
existed, and standing one up is the half of that phase which has since landed; and
because the share modules are pure and dependency-free — the highest signal per
unit of cost in the repository, on the top hot-spot directory. Risk #8's
parse half sits in that phase not because it is cheap enough to ride along, but
because it is the precondition the rest of the rollout stands on: an administrator
who cannot get a budynek and its rejestr into the system reaches no uchwała, no
links and no votes, so every later phase asserts behaviour a refused import puts
out of reach. That its parse half is also the cheapest thing in the repository to
assert — pure, file-in / values-out code in the same directory as the allocation —
is what makes it affordable to put first, not why it goes there. Its atomicity half
cannot ride along — "what state does a refused import leave behind" is a database
question, so it lands in Phase 2. Phase 2 next
because that is where the risk actually concentrates: the second hot-spot
directory, named in interview Q3, forward-only with no rollback, and the only
layer able to bind callers the application layer cannot reach. Phase 3 depends
on Phase 1's runner and Phase 2's fixtures. Risk #9's testable half joins Phase 3
rather than getting a phase of its own: it reads the same branches of the same
voting routes that #7 already forces a reader through — every status, header, and
redirect target the routes can emit — so the two ride one pass over that code. It
needs no infrastructure and therefore no new gate; a Vitest assertion runs under
the `unit` gate that has been required since 2026-08-05. Phase 4 last because it depends on
Phase 3's integration harness — and, now, because there is no longer a hand-off to
make: `S-04` shipped on 2026-08-04, so the phase **retrofits** assertions onto a
slice already running in production instead of writing the gate that slice's own
plan had to satisfy. That is a cost this rollout incurred rather than a preference
it expressed — the highest-scored risk in §2 reached production with nothing in
front of it, and Phase 4 buys the floor back after the fact.

## 4. Stack

The classic test base for this project. AI-native tools carry a `checked:` date
so future readers can see which lines need re-verification.

| Layer                | Tool                                                                            | Version                                        | Notes                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| unit + integration   | **Vitest** — `npm test`                                                         | 4.1.10                                         | Installed 2026-08-05. Config is `vitest.config.ts`, `environment: "node"`, collecting `src/**/*.test.ts`. **Not** wired through `getViteConfig()`, which this row recommended until 2026-08-05 and which does not work in this project — see the note below the table; checked: 2026-08-05                                                                                  |
| database contract    | **pgTAP** via `supabase test db` — `npm run test:db`                            | pgtap 1.3.3 (server-side), Supabase CLI 2.98.2 | Installed 2026-08-05. Tests live in `supabase/tests/database/*.test.sql`. Role switching verified working (`set local role anon`), which is the whole basis of Phase 2. Requires Docker and the local stack; the extension is created inside each test's own transaction, never in a migration; checked: 2026-08-05                                                         |
| API mocking          | not planned                                                                     | —                                              | The boundaries that matter here are Postgres and the mail binding. Postgres is exercised for real via the local stack (Phase 2); the mail binding sits in §7 negative space. A mocking library would add a layer with nothing to mock.                                                                                                                                      |
| e2e                  | conditional — see Phase 3                                                       | —                                              | Astro's guide names Playwright and Cypress. Neither is installed and neither is adopted by default: Phase 3 promotes to e2e **only** if integration cannot reach the two-step confirm path; checked: 2026-08-04                                                                                                                                                             |
| accessibility        | not planned                                                                     | —                                              | Excluded with UI testing generally; see §7                                                                                                                                                                                                                                                                                                                                  |
| (optional) AI-native | LLM review of migration and anon-surface diffs at PR time — checked: 2026-08-04 | n/a                                            | **When NOT to use:** whenever the check is expressible as a pgTAP assertion. Phase 2's deterministic tests win on cost and reliability. This row exists only for _new_ surfaces no existing assertion covers — a table added without the full per-operation × per-role policy shape, a grant to `anon`, or a widening of the anon return list beyond the reader's own data. |

**`getViteConfig()` is wrong for this project, and this row recommended it for a
day.** Astro's testing guide is written for Astro generally; this project runs the
Cloudflare adapter, which registers `@cloudflare/vite-plugin`, and that plugin
rejects the `resolve.external` list Vitest sets on its `ssr` environment. The run
dies at startup before collecting a test. Passing `{ adapter: undefined }` as
`getViteConfig()`'s second argument does not help — Astro's inline config merges
over the file config rather than unsetting keys in it. The working shape is
`defineConfig` from `vitest/config` plus `vite-tsconfig-paths`, which reads `@/*`
from `tsconfig.json` so the alias cannot drift from the one the app builds against.
Nothing the current suite needs is lost: the modules Phase 1 targets are
dependency-free by design. **Phase 3 must revisit this** — an integration test that
renders an Astro component needs the Astro pipeline back, and the answer is most
likely a second Vitest project rather than a retry of `getViteConfig()`.

**Consequence recorded, and discharged 2026-08-05.** `CLAUDE.md` stated as a hard
rule that "There is no test runner… never report that tests passed." Phase 1's
runner made that line false, and it was rewritten in the same change — an agent
reading the stale rule would have refused to run the suite that exists. The
replacement keeps the half that is still true: a green `npm test` currently proves
the harness runs, not that any domain rule holds.

**Stack grounding tools (current session):**

- Docs: **Context7, via the `ctx7` CLI** — resolved `/withastro/docs` and `/supabase/supabase`; read Astro's testing guide (Vitest via `getViteConfig()`, Playwright/Cypress for e2e) and Supabase's pgTAP guide (`supabase test db`, role-switching helpers for RLS assertions); checked: 2026-08-04
- Search: **none used** — web search is available in this session but the primary sources answered the stack questions directly; checked: 2026-08-04
- Runtime/browser: **no Playwright MCP in session** — Playwright would be a dependency to add, not a tool already present. Not used; checked: 2026-08-04
- Provider/platform: **no GitHub, Supabase, or Cloudflare MCP in session**. The `gh`, `supabase`, and `wrangler` CLIs are available locally and are what Phase 4's gates will invoke; checked: 2026-08-04

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.
"Required after §3 Phase `<N>`" means the gate is enforced once that rollout
phase lands; before that, the gate is planned.

| Gate                                      | Where                                                        | Required?                                                         | Catches                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| lint + typecheck                          | local + CI (`ci.yml`, `deploy.yml`)                          | required — already wired                                          | syntactic and type drift; the type-aware pass needs `astro sync` first                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| build                                     | local + CI                                                   | required — already wired                                          | build-time breakage before deploy                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| unit                                      | local (`npm test`) + CI (`ci.yml`, `deploy.yml`)             | **required — wired 2026-08-05**                                   | _Eventually:_ udział allocation regressions — the **allocation half of #2 only**, since the threshold comparison lives in the database layer and belongs to the gate below; a registry file that a real zarządca could plausibly hand over failing to parse, or being refused without naming the offending line (#8); a code path emitting a voting token outside the message addressed to its owner (#9 — a unit-level assertion, so it needs no gate of its own). _Today:_ nothing but harness breakage — the only unit test is a smoke test. The gate is enforcing early on purpose, so the first real test is protected the day it is written                                                                                                                                               |
| database contract                         | local (`npm run test:db`) + CI (`ci.yml`, `db-contract` job) | **required — wired 2026-08-05**                                   | _Eventually:_ electorate, finality, and own-data-only regressions (#3, #4, #6); an uchwała settled against the udziały cast rather than against the whole building, and a vote lost because two właściciele voted at the same moment (#2, threshold and ordering halves); a failed import leaving a budynek half-populated and therefore permanently locked (#8). _Today:_ harness breakage, plus one thing no other workflow checks — `supabase start` applies every migration to a **fresh** database, so this job proves the migration chain applies from zero, which matters because migrations reach production by hand and are forward-only. The cost this row flagged during Phase 2 (Docker and a migrated local stack inside CI, "which no current workflow provides") is now provided |
| voting-path integration                   | CI on PR                                                     | required after §3 Phase 3                                         | vote round-trip and hit/miss indistinguishability regressions (#5, #7)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| e2e on the confirm flow                   | CI on PR                                                     | conditional — only if §3 Phase 3 promotes                         | the two-step confirm crossing, if integration cannot reach it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| fanout gate                               | CI on PR                                                     | required after §3 Phase 4, enforced against the fanout as shipped | link misdelivery and non-idempotent re-runs (#1)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| AI-native migration / anon-surface review | CI on PR                                                     | recommended after §3 Phase 2                                      | new surfaces no deterministic assertion covers yet (see §4 for when NOT to use)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| post-deploy health assertion              | `deploy.yml` after `wrangler deploy`                         | required — already wired                                          | a Worker that deploys but cannot reach Supabase. Known limit: it certifies the version live when it ran, and a second, unlinted deploy path can replace that version seconds later                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once the
relevant rollout phase ships; before that, the sub-section names the pattern it
will carry.

### 6.1 Adding a unit test

**Mechanics (settled 2026-08-05).** Put the file next to the module it exercises,
named `<module>.test.ts` — `vitest.config.ts` collects `src/**/*.test.ts`. Import
Vitest's helpers explicitly (`import { describe, expect, it } from "vitest"`);
globals are not enabled, which keeps the type-aware lint pass happy without a
config exception. Reach the module under test through the `@/*` alias, same as
application code. Run with `npm test`, or `npm run test:watch` while writing.
`src/lib/smoke.test.ts` is the shortest complete example.

**Substance — still owed, see §3 Phase 1.** The two patterns this section was
opened for are not written yet: asserting udział allocation against an independent
oracle (FR-006 / FR-007), including the rounding and the tie-break rule itself —
what those udziały then decide is asserted in §6.2, because the threshold lives in
the database layer; and asserting that a registry file parses or is refused
legibly, with fixtures authored _against the format a zarządca actually uses_
rather than round-tripped from the project's own downloadable template. The
anti-pattern §2 names for Risk #2 applies to whoever writes the first one: the
expected value must come from FR-006 / FR-007, never from the allocation code.

### 6.2 Adding a database contract test

**Mechanics (settled 2026-08-05).** Put the file in
`supabase/tests/database/<subject>.test.sql`. Every file is self-contained and
must open with its own transaction and its own extension line:

```sql
begin;
create extension if not exists pgtap;
select plan(<n>);
-- assertions
select * from finish();
rollback;
```

The extension line is per-file on purpose — pgTAP is never added to
`supabase/migrations/`, because migrations here reach production by hand and are
forward-only, so test scaffolding must not enter them. The `rollback` is what makes
the suite safe to run against a long-lived local stack holding hand-made state.
Assert as a specific caller with `set local role <role>;` … `reset role;` — verified
working for `anon`. Run with `npm run test:db`, which needs Docker and the local
stack up.

**Substance — still owed, see §3 Phase 2.** The patterns this section was opened
for are not written yet: asserting a rule _as a specific role_, the
delete-then-recreate bypass shape, how to write a test that fails if a write
denial is loosened — which matters specifically because `S-03` left the `votes`
write denial resting on policies with no accompanying `revoke` — and asserting the
outcome threshold, including the near-threshold uchwała where one rounding decision
changes the result. That last one sits here rather than beside the allocation in
§6.1 because the comparison is expressed once, in the database layer, and because
the property that makes it survive two simultaneous voters is the order in which
the vote path takes its locks, which no unit test can observe.

### 6.3 Adding an integration test for a voting route

TBD — see §3 Phase 3. Will carry the pattern for asserting persistence rather
than rendered confirmation, and for asserting status and headers — not only
bodies — so a hit/miss leak is visible.

### 6.4 Adding a test for a new API endpoint

TBD — see §3 Phase 3. Will carry the request → response _and_ side-effect
pattern, plus the rule for when an endpoint's failure mode justifies e2e instead.

### 6.5 Adding a test for a new table or migration

TBD — see §3 Phase 2. Will carry the checklist a new table must satisfy before
merge: the per-operation × per-role policy shape, the `anon` denial, what to
assert when a definer function is introduced, and — for any write path that
refuses to run twice — what state a _failed_ run must leave behind.

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
  moved deliverability to v2 by decision. Note the boundary: _deliverability_ is
  excluded, but _who receives which link_ is Risk #1 and is very much tested.
  Re-evaluate when deliverability re-enters scope in v2. (Source: Phase 2
  interview Q5, PRD `## Non-Goals`.)
- **Platform-side retention of voting tokens** — the token travels in the URL
  path, so the platform's log store keeps every link an owner opens for up to
  seven days. No test reaches that store, and no code change in this repository
  shortens it: the only fix is moving the token out of the path, which is a
  schema-sized change. Excluded as **untestable, not as acceptable** — the half
  that _is_ testable (no code path of ours emits a token) is Risk #9.
  Re-evaluate if the token leaves the URL path, or if dashboard access widens
  beyond the person who already sees every token of their buildings on the
  resolution page. (Source: recorded hazard, `system-state.md` §Workers Logs and
  voting tokens.)
- **v1 non-restrictions asserted as restrictions** — building-scoped access for
  authenticated callers, the roles model, registry editing, per-uchwała
  thresholds, and the paper channel are all explicit v1 non-goals. Writing tests
  against them would assert behaviour the product deliberately does not have.
  Re-evaluate per item as each leaves `## Non-Goals`.

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-08-06
- Stack versions last verified: 2026-08-06 — Vitest and the Supabase CLI re-checked
  against the installed tree; the server-side pgTAP version keeps its 2026-08-05
  check, which needs the local stack running to repeat
- AI-native tool references last verified: 2026-08-06

**Four entries below carry the date 2026-08-06, and they are four separate acts.**
Newest first: this refresh, which re-derived Risks #1 and #2 against shipped code;
the §3 / §5 re-read that walked every risk through to a phase and a gate; the
addition of Risk #9; and the §1 hot-spot correction. Read them in that order. The
refresh itself appended no risk row — #9 came from the re-read, not from it.

**Refresh, 2026-08-06 — the scheduled re-derivation against `S-04` and `S-05`.**
The trigger this ledger set for itself on 2026-08-04 — "after roadmap `S-04`
ships" — fired on 2026-08-04, and `S-05` landed the day after. Both of the two
highest-scored risks had been scored against code that did not exist, so both were
re-derived against code that now does. **Risk #1** keeps `High | High`: the
per-owner send state and the resume-rather-than-restart rule are facts now rather
than open Unknowns, and a production run demonstrated them, but the failure
vocabulary went out unexercised because the provider's failure conditions cannot be
produced on demand — a slice shipping is not the same as a slice being tested.
**Risk #2** keeps `High | High` and gains the mode it was missing: a vote cast and
never recorded subtracts from the tally exactly as a mis-weighted one does. The two
failure modes `S-05` reproduced were **folded into existing rows rather than
appended** — the concurrent-vote deadlock into #2, where it is the same wrong-udziały
outcome by another route, and the widened status guard into #3, where it is a second
instance of a shape that row already describes. Consequential edits: §2 (rows #1,
#2, #3 and their three Risk Response Guidance rows); §3 (Phase 1's goal narrowed to
the registry parse and the allocation, Phase 2's widened to the threshold and the
lock-ordering property, `#2` shown split across the two, Phase 4 rescoped, the order
rationale's registry and Phase 4 clauses rewritten); §5 (the `unit`, `database
contract` and `fanout gate` rows); §6.1 and §6.2 (the near-threshold framing moved
to where the threshold now lives); the document header.

**The renumber this refresh was planned to carry is withdrawn** — a decision, not
an omission. It would have re-assigned every risk number so the registry blocker led
the map. Since it was planned, the map has taken two appends under the opposite
convention (#8 and #9, both with an ordering note telling the reader to read them at
the top), and the numbers are now cited from §3, §5, §7 and four amendments here. A
renumber would invalidate all of that to buy a reading order the note already
supplies. If it is ever made, it is its own change with its own review, never a side
effect of a refresh — and it must not break `§1 principle #3`, which is a numbered
_principle_ and will be hit by any find-and-replace over risk numbers.

**Two further no-ops, recorded so the next refresh does not re-open them.** §7 was
read and deliberately left unchanged: its "v1 non-restrictions" bullet is about the
absent roles model, and a database guard is not a role, so that bullet does not
excuse skipping anything the refresh touched. And this refresh **appended no risk
rows** — the map's move from eight rows to nine was Risk #9, a separate act recorded
in its own amendment below. §1's hot-spot figure was already corrected by the time
the refresh reached it, and §4's runner row was already settled by PR #39 the other
way round from what this refresh had planned to write, so both were left alone.

**§3's two prose Status cells restored.** PR #39 fixed the folder Phase 1 pointed
at but left Phases 1 and 2 reading `runner landed; tests not started` and `harness
landed; tests not started`. Status is a closed vocabulary the orchestrator parses on
every invocation, and a prose cell is not misread but unread. Both now read `not
started`, which is what they mean — a harness exists, no test does. The paragraph
under the table carries the nuance the prose was reaching for.

**The scheduled-refresh mechanism was used once, worked, and was deliberately not
replaced.** Its paragraph is removed rather than re-dated: a second date would be a
guess at when the next slice matters, and the four standing condition-based triggers
below already fire on the events that would justify one.

**Amendment, 2026-08-06 — §3 and §5 re-read against the risk map.** Walking every
risk through phase → test type → gate turned up one hole and one dead row. The
hole: Risk #9 had no phase, and now has Phase 3, because its testable half reads
the same route branches #7 already forces a reader through, and a unit-level
assertion rides the `unit` gate rather than earning a new one. The dead row:
`post-edit hook` sat in §5 as `recommended after §3 Phase 1` while mapping to no
risk, declaring its own configuration out of scope, and disclaiming any CI role —
and no `hooks` section exists in `.claude/settings.json` or `settings.local.json`,
so nothing was ever going to act on it. Removed rather than left as a row that
recommends nothing. `AI-native migration / anon-surface review` moved from
`after Phase 4` to `after Phase 2`: it covers what the deterministic #3 / #6
assertions cannot reach, so its trigger belongs the moment those assertions exist,
not two phases later — the anon surface has widened twice already. Edits: §3
(Phase 3 row and the order rationale), §5 (unit gate, AI-native row, `post-edit
hook` removed).

**Amendment, 2026-08-06 — Risk #9 added.** The map had no row for secret
handling, and the product's central secret is a bearer credential that travels in
a URL path. `system-state.md` §Workers Logs and voting tokens has recorded since
`S-03` that the platform retains every opened link for seven days and that the
"no token in a log line" guarantee is a property of the source with nothing
enforcing it; neither half had reached this file — a grep for `log` returned
nothing across all eight sections. Appended rather than inserted, per the ordering
note. The retention half is untestable and is recorded in §7; the emission half is
Risk #9 and is cheap to assert. Its phase was assigned the same day — see the
amendment below.

**Amendment, 2026-08-06.** §1 attributed 68 commits to the scoped hot-spot scan.
68 is the repo-wide count for that window; 19 of them touched `src/` or
`supabase/`. Corrected, together with the unit on §2's per-directory figures: 14
and 9 are file changes inside those directories, not commits (10 and 6
respectively). No risk's impact, likelihood, or ordering moves — the metric is the
same one for every directory, so their relative churn is unchanged. Recorded here
because §1–§5 are otherwise frozen between refreshes.

**Amendment, 2026-08-05.** `context/changes/test-environment-bootstrap/` installed
the harnesses §4 had only named, and wired the gates §5 had only planned. Edits:
§3 (Phase 1 and 2 Status and Change-folder cells, plus a note above the order
rationale), §4 (the unit and database-contract rows, and a new note recording that
`getViteConfig()` cannot be used with the Cloudflare adapter), §5 (both gate rows
moved to required), §6.1 and §6.2 (mechanics filled in; substance still owed).
Recorded here because §1–§5 are otherwise frozen between refreshes. **No risk in §2
became covered** — only smoke tests exist.

**Amendment, 2026-08-04.** Risk #8 (an administrator cannot get a budynek and its
rejestr into the system) was added at the user's direction after the initial
write, outside the normal `--refresh` path. Consequential edits: §2 risk map and
response guidance, §3 Phases 1 and 2 (risks covered, goals, order rationale), §5
unit and database-contract gates, §6.1 and §6.5. Recorded here because §1–§5 are
otherwise frozen between refreshes, and a reader comparing this file against its
first commit should be able to see why it moved.

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
