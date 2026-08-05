# System state — the evidence behind the rules

The long form of what `CLAUDE.md` states in one line each. Every entry here is a
decision that has already been made, an invariant that is already load-bearing, or an
incident that already happened — with the evidence that made it a rule, so a future
change can weigh it rather than rediscover it.

**Who owns what**

- `CLAUDE.md` owns the **rules** — one to three sentences each, read at the start of
  every session. It points here.
- **This file** owns the **evidence** — reproductions, timestamps, the argument that
  settled a decision, and the residuals left open.
- `README.md` owns **procedure** — how to stand the stack up, which commands in which
  order, what to paste where.
- `context/foundation/roadmap.md` owns **build status** — the "At a glance" table is the
  only place a slice is marked done. Do not restate it here or in `CLAUDE.md`.
- `context/changes/<change-id>/` owns **one change** — its plan, research and review.

Update convention is `foundation/`'s: edit in place. When a rule here is superseded,
correct it rather than dating a copy.

---

## Voting-link fanout (`S-04`)

The fanout mails each owner their own link, resumes rather than restarts, and derives its
status instead of storing it. `S-04` added four columns to `public.voting_links` —
`sent_at`, `last_attempt_at`, `last_error_code`, `attempt_count` — plus
`POST /api/buildings/<id>/resolutions/<resolutionId>/send`. Six things are load-bearing:

- **`sent_at is null` is the entire resume.** The endpoint sends **sequentially** and
  writes each owner's status **before the next send starts**. That ordering is the single
  constraint in the slice: batching the writes would halve the round trips and lose
  resumability, so a run dying at owner 60 would have sent 60 messages and recorded none.
  A closed tab costs at most one owner. Do not make it concurrent — Cloudflare rate-limits
  sending, and a tripped limit converts a slow success into a partial failure someone has
  to repair by hand.
- **Status is derived, never stored.** `sent_at` set → _Wysłano_; `attempt_count > 0` with
  no `sent_at` → _Błąd_ plus `describeSendFailure(last_error_code)`; `attempt_count = 0` →
  _Niewysłane_. There is deliberately no `status` column: it would be a second
  representation to keep in agreement with the timestamps, which is the failure mode this
  project twice used triggers to avoid. `voting_links_send_state_check` refuses a row
  carrying both `sent_at` and `last_error_code`, and that constraint holds **only because a
  sent link is never re-attempted** — whoever builds the per-owner "send again" button v1
  omits is the person who breaks it.
- **`public.unsent_voting_links(uuid)` is the fanout's only way to read a token,** and the
  project's second `security definer` **read**. `20260802214500` revoked `select (token)`
  from `authenticated`, so an invoker function would inherit the same denial. It is granted
  to `authenticated` only, takes one `resolution_id`, and returns only unsent rows — so it
  cannot enumerate a building, and any given token stops being reachable through it the
  moment it is used. It does **not** make tokens unobtainable by a determined
  administrator; that needs the v2 roles model. **When a roles model lands, this function
  is a hole** — it must gain the same building scoping the policies gain, in the same
  change.
- **A column added to `voting_links` is invisible until it is added to the column grant.**
  The four columns above needed `grant select (…) to authenticated` in the same migration,
  to `authenticated` **only** — not `anon`, departing from the existing grant, because send
  state is administrator data. Miss this and the page gets `42501` with RLS as the obvious
  wrong suspect. `20260802214500`'s header predicted exactly this.
- **The error-code table ships only partly exercised, and that is recorded rather than
  hidden.** `E_BINDING_MISSING` was walked end to end on production; Cloudflare's own
  failure codes (`E_RECIPIENT_SUPPRESSED`, `E_RATE_LIMIT_EXCEEDED`,
  `E_DAILY_LIMIT_EXCEEDED`, `E_DELIVERY_FAILED`) cannot be produced on demand, so their
  Polish sentences are **untested in production** — the first real failure is their test.
  Header codes are deliberately unmapped: the fanout sends no custom headers, so a
  confident sentence for one would describe something nobody has seen. The fallback names
  the raw code instead.
- **An owner with no e-mail address is not a failure.** They get no link (`open.ts` filters
  on the address), appear in their own block on the resolution page, are summarised as
  `bez adresu e-mail: N`, and never join the failure count — their udziały still count
  toward the `S-05` threshold. Separately, a send that succeeds while its status write
  fails is counted as `unrecorded` and warned about, because that is the one state that
  produces a **duplicate** message on the next press.

Measured on production 2026-08-04: **≈2 s per send**, so a 70-owner building is roughly
**two minutes** of a pending request. That is a UX cost, not a platform limit — Workers
Paid allows 10,000 subrequests per invocation against this workload's ~140. **Do not add a
`limits` block to `wrangler.jsonc`**; it would cap something two orders of magnitude from
its ceiling.

## Resolutions and voting links (`S-02`)

A resolution freezes when the vote opens, and the voting link is a credential nobody is
shown. `S-02` added `public.resolutions` (number unique per building, `status`
`draft`/`open`, `opened_at`) and `public.voting_links` (one row per owner per resolution,
`token` = 43 URL-safe chars from 32 random bytes, minted by `src/lib/voting-token.ts`).
Five things about it are load-bearing:

- **Weight is per owner, not per unit.** A person holding two flats gets one link and one
  summed `share_bps`. `public.owners` was already one row per person, which is what makes
  that free.
- **The freeze is a trigger, not a screen.** `assert_resolution_frozen` raises `EM006` when
  content changes after open and `EM007` on `open → draft`. The two gaps this bullet used
  to name — repointing a live link at another person, and deleting an open resolution to
  cascade its links away — were closed by `S-03` before it stored a vote; see
  [The vote write path](#the-vote-write-path-s-03).
- **`public.resolve_voting_link(text)` is the only crack in the schema for `anon`** —
  `security definer`, `set search_path = ''`, returning exactly one narrow row (resolution
  content, the reader's own name, the reader's own share) and nothing else. An unknown
  token and a still-draft token both return `[]`, indistinguishably; that indistinguishability
  is the property, so anything that makes a hit and a miss differ — an error page, a
  header, a redirect — breaks it. It also has a debugging cost, paid once already on
  2026-08-02: a token believed genuine rendered the neutral page and read as a live defect,
  and `security definer`, `force row level security`, RLS, PostgREST's schema cache and
  project identity were all ruled out before the actual cause — the string was not any
  token in the table. **When a voting link "does not work", compare it byte-for-byte
  against the stored `voting_links.token` first, before inspecting any read path.** That
  comparison needs `service_role`, because migration `20260802214500` leaves no other
  reader of that column. Verified live the same day: the two real links return 1801 / 1800
  bytes carrying each reader's own name and share, a made-up token 989 bytes, and no token
  appears in any of the three.
- **`/vote/<token>` is deliberately _not_ in `PROTECTED_ROUTES`,** the only route for which
  that is true. Owners have no account (PRD `## Access Control`), so adding it would
  redirect every voting link to the sign-in screen. What protects it is the token plus the
  narrowness of the resolver, not the route table. Do not "fix" the omission —
  `src/middleware.ts` says so at the array.
- **No token appears in any HTML response, and the database enforces it.** The
  administrator's resolution page reads `select("owner_id")` and reports only _Wystawiony_
  / not issued; migration `20260802214500` revokes table-level `select` on `voting_links`
  from `authenticated` **and** `anon`, then re-grants every column except `token`. That
  ordering matters — a column-level `revoke` does nothing while a table-level grant stands.
  Consequences to remember: `select=*` on that table is now `42501`, so projections must
  name columns; a column added by a later migration is **invisible** until added to the
  grant; and `S-04`'s fanout must read tokens through a `security definer` function, which
  narrows the surface to one reviewable function without making tokens unobtainable by a
  determined administrator (that needs the v2 roles model). Also: `opened_at` is written
  from the **Worker's** clock, not `now()`, because supabase-js posts values rather than
  SQL expressions — `S-05` settled that by putting `decided_at` on the database clock and
  forbidding the subtraction outright; see
  [Outcome and threshold](#outcome-and-threshold-s-05).

## The vote write path (`S-03`)

A vote is written by one `security definer` function, and it is the project's first definer
_write_. `S-03` added `public.votes` and `public.cast_vote(p_token text, p_choice text)` —
the entire write path, reachable by `anon`, taking a token and a choice and **nothing
else**. It resolves the link, sums the owner's units and inserts the row itself; the
browser never names an owner, a resolution or a weight. That inverts the project's
no-definer rule on purpose, and the argument is in the migration at
`20260803090500_create_votes.sql:244`: the rule protects the **registry's** write path,
where `import_building_units` stays `invoker` so an invisible building raises `EM001`,
whereas here there is no caller identity to preserve — `anon` is denied on every table and
a policy cannot see a bearer token. The alternative, an `anon` insert policy, needs the
browser to post its own `owner_id` and `share_bps` under a `using (true)` predicate. Five
consequences worth carrying:

- **`public.votes` denies `insert` / `update` / `delete` to _both_ roles**, where every
  other table grants them to `authenticated`. Deliberate — _głos jest ostateczny_ — so do
  not "fix" it back to consistency. Finality is enforced three times because each binds a
  different caller: `unique (resolution_id, owner_id)` binds everything, the six `false`
  policies bind PostgREST callers, and `assert_vote_immutable` (`EM010`) binds `cast_vote`
  itself, which as `security definer` bypasses RLS entirely. **Residual:** the write denial
  is policies only — no `revoke` was written, so Supabase's default table-level grants still
  stand behind them. Verified denied through PostgREST for both roles; the exposure is to a
  future edit flipping `votes_insert_authenticated` to `true`, which would read like
  restoring consistency. The fix is one line.
- **`EM008`–`EM013` fix the electorate of an open resolution under every operation.**
  `EM008` refuses changing a link's `token` / `owner_id` / `resolution_id`; `EM009` refuses
  deleting a non-draft resolution; `EM010` refuses any update or delete of a vote; `EM011`
  refuses a `p_choice` outside `('for','against')` **before any lookup**, so it
  distinguishes nothing about the token space; `EM012` refuses issuing a _new_ link on a
  non-draft resolution; `EM013` refuses deleting one. `EM012`/`EM013` came out of the Phase
  1 review and are not optional garnish — without them `EM008` was bypassable by
  delete-then-insert, reproduced end to end through PostgREST before the fix: an
  administrator could plant a token of their choosing and cast a binding vote at another
  owner's full weight. `EM012` lets an owner who already holds a link pass through, so
  `open.ts`'s `on conflict do nothing` upsert stays idempotent.
- **`share_bps` is snapshotted onto the vote and is authoritative over any later
  recomputation** (`comment on table public.votes`). The registry cannot move in v1, so it
  changes no outcome today; it exists so `S-05`/`S-06` read what a vote _was worth when
  cast_. `S-05` now does exactly that — `resolution_tally` sums this column while its
  denominator comes from the registry, **two sources that agree only by construction in
  v1**. A release that lets udziały move must revisit that pairing before it revisits
  anything else, and must not silently reweigh votes already cast.
- **`resolve_voting_link` was widened, not duplicated** — `own_vote_choice` and
  `own_voted_at`, the reader's own data, the same standard `owner_share_bps` already met.
  Adding columns changes the return type, so Postgres needs `drop function` then
  `create function`, and **a dropped function takes its ACL with it**: the `revoke` /
  `grant` pair must be re-issued in the same transaction. No other owner's vote may ever
  join that list. Note the generated types call both new columns plain `string` — the
  generator reads the `returns table` declaration, not the left join behind it — so treat
  them as nullable in TypeScript regardless of what the types say.
- **The vote page sets `Cache-Control: private, no-store`, `X-Robots-Tag: noindex,
  nofollow` and `Referrer-Policy: no-referrer` _before_ it resolves the token.** `S-02`'s
  review recorded this as finding F4 and skipped it correctly — there was nothing to lose
  then. There is now: the page renders a receipt naming how someone voted. Headers that
  differ between a hit and a miss are as observable as bodies that do, which is why they
  cannot sit inside the resolved branch. The same rule governs `/api/vote/[token]`: an
  unknown token, a draft token and a forged `choice` all redirect to `/vote/<token>` with
  **no** `?error=`, and the page renders `?error=` only in states reached with a resolved
  token.

## Outcome and threshold (`S-05`)

An uchwała decides itself at the vote that decides it, in that vote's own transaction — the
threshold exists once, in SQL. `S-05` widened `resolutions.status` to `draft` / `open` /
`passed` / `rejected`, added `decided_at`, and added `public.resolution_tally(uuid)` plus a
trigger pair on `public.votes`. No TypeScript anywhere computes `sum * 2 > 10000`; the
screens print what `resolution_tally` returns. Seven things are load-bearing:

- **The denominator is the whole building, not the udziały cast.** `total_bps` is the
  constant `10000` — every building's units total exactly that, asserted by `EM003` at
  commit — so silence acts as a _no_, which is the product's central claim (PRD
  `## Business Logic`) and not an implementation shortcut. `for_missing_bps` /
  `against_missing_bps` are written as `(10000 / 2 + 1) - side`, floored at zero, so a side
  has won exactly when its missing figure reaches zero. Integer arithmetic throughout; no
  float appears in the file. FR-007 says _przekroczy_ — verified at the boundary, not near
  it: owners at 2501 + 2499 bps sum to exactly 5000 and the resolution stays `open`.
- **The row lock is taken in a `before insert` trigger, and moving it will look like
  removing a redundant trigger.** `public.votes` carries a composite FK to
  `public.resolutions`, so every insert takes `FOR KEY SHARE` on the parent on its way in.
  The plan put `FOR UPDATE` in the `after insert` trigger; two concurrent voters then both
  hold `KEY SHARE` and wait on each other — **reproduced on the first unstaggered attempt**
  (`40P01`), and the loser's vote is simply not recorded. The fix is lock **order**, not
  lock strength: `votes_lock_resolution` takes `FOR UPDATE` _before_ the insert, so the
  strongest lock is always acquired first. Twelve runs after the fix, no deadlock. Without
  any lock the outcome is wrong under READ COMMITTED — two votes each read a pre-threshold
  total and neither flips, leaving a cast majority on an open uchwała with nothing left to
  re-check it.
- **Storing the outcome closes the vote for free, and that is why it is stored rather than
  derived.** `cast_vote` already joins `and r.status = 'open'`, so the instant the status
  leaves `open` a late vote takes the _existing_ zero-row path — the same answer an unknown
  token gets. No new refusal, no new error code, and no new observable branch in the token
  space. A derived outcome would leave that gate open forever and need a second,
  hand-written refusal that **would** be observable. `FR-007` also says the decision
  _"zostaje oznaczona"_ — an event, which `S-06` has to timestamp, and a derived outcome
  has no when.
- **`EM014` exists because widening `EM007` handed the outcome to every writer, not just to
  the trigger.** `EM007` is a trigger on the table, not a permission on one function:
  teaching it `open → passed` / `open → rejected` taught them to everybody, and
  `resolutions_update_authenticated` is `using (true) with check (true)` with no
  `force row level security` in this schema. A signed-in administrator could `PATCH` a
  resolution to `passed` with no vote behind it, supplying `decided_at` in the same payload
  to satisfy `resolutions_decided_at_matches_status` — reproduced through PostgREST as
  `authenticated` before the fix. `20260805084000` refuses both transitions unless that
  side's `*_missing_bps` has reached zero; the honest flip satisfies it by construction.
  This was a defect, not a v1 roles-model residual: it was **impossible the day before**,
  and a forged flip also silently disenfranchises everyone who has not yet voted.
- **`resolution_tally` is `invoker` and `resolution_outcome_supported` is `definer`, on the
  same argument `20260802101500` settled.** A _display_ read should show a caller the rows
  they may see, and should narrow when the v2 roles model scopes
  `votes_select_authenticated`. An _assertion_ that aggregates only the caller's visible
  rows passes by not seeing the problem — scoped later, an invoker check would start
  approving outcomes a subset of the electorate supports. The wrapper exists so the
  threshold constant still appears exactly once, inside `resolution_tally`.
- **`decided_at` is on the database clock; `opened_at` is on the Worker's.** That was
  `S-02`'s open question for this slice and it is resolved by not asking it — `decided_at`
  is `now()`, on the same clock as `votes.created_at`, which is what it will ever be
  compared against. **Never difference `decided_at` against `opened_at`**: the interval is a
  real duration plus unknown clock skew. `resolutions_decided_at_matches_status` makes the
  timestamp and the status unable to disagree in either direction.
- **Four statuses mean `open` is no longer green.** `src/lib/resolutions.ts` owns
  `describeResolutionStatus` / `isResolutionDecided`: `draft` neutral, `open` **sky**,
  `passed` green, `rejected` rose (deliberately not styled as an error — an uchwała that
  falls is the ordinary outcome for ~85% of them). It takes `string`, not the union, because
  that is what a database read hands over, and its fallback says _Nieznany status_ rather
  than guessing — falling back to `open` would report an unknown state as one still
  accepting votes. The lookup uses `Object.hasOwn`, not `in`, or a status of `toString`
  indexes onto a function and reports as known. `/buildings/<id>/resolutions` needed **no**
  `PROTECTED_ROUTES` entry: the array already holds `"/buildings"` and is matched with
  `startsWith` — verified by a signed-out request answering `302`, not by reading the array.
  `/vote/<token>` also had to learn about the settled state, and the fix is in the **page**,
  never the endpoint: a never-voted owner on a decided uchwała used to see live buttons that
  silently did nothing forever, so the page now reads `resolution_status` (already in
  `resolve_voting_link`'s return list — nothing widened) and renders the outcome, with the
  decided check ordered _before_ `pendingChoice` so a stale `?wybor=za` cannot reach a
  confirm screen.

## Audit trail (`S-06`)

The audit trail reads a settled uchwała's votes back per owner, and every figure on it comes
from the snapshot rather than from today's registry. `S-06` (`finished-votes-archive`)
shipped 2026-08-05 as PR #40. Below _Bilans udziałów_ a settled uchwała now shows _Jak
zagłosowano_ (one row per vote, oldest first), _Kto nie oddał głosu_ (by name), and a
reconciliation closing at 100,00%. It is the **first slice whose behaviour is pinned by
tests** — `test-plan.md` §2's risks had zero coverage before it. Six things are
load-bearing:

- **The udział on a vote row is `votes.share_bps`, never a re-sum of the owner's units.**
  Today the two agree — the registry cannot move in v1 — so an implementation that re-summed
  would pass every manual check and be invisible. What pins it is a test, not a comment: a
  vote whose weight disagrees with its owner's lokale must report the snapshot. If a
  registry-edit path ever lands, that test is the thing standing between it and silently
  reweighing votes already cast.
- **The reconciliation is summed from the trail's own rows and must never be copied from
  `resolution_tally`.** Echoing the tally would make the two panels agree by construction and
  unable to catch a missing or double-counted owner. They sit side by side precisely so a
  discrepancy is visible.
- **All the arithmetic lives in `src/lib/resolution-trail.ts`, which is dependency-free**,
  like `shares.ts` and `units-csv.ts` and for the same reason. The page renders and folds
  nothing. That is what made the slice testable at all; a fold that creeps back into the
  `.astro` frontmatter is untestable by construction.
- **The depth decision is settled and is not a scope question any more: per owner, by name,
  settled uchwały only, administrator only.** No per-lokal breakdown — a vote carries a
  summed per-owner weight by design (`S-02`), and splitting it back would re-derive from the
  registry the thing the snapshot exists to be independent of. The other half of the barrier
  did **not** move: an owner never learns another owner's vote, on any surface, and
  `resolve_voting_link`'s comment now says that is permanent rather than pending. Do not read
  "S-06 has shipped" as licence to widen that list.
- **`EM015` came out of this slice and broke the plan's no-migration rule** —
  `20260805192000_owner_holds_units.sql`, an owner must hold at least one lokal, enforced by
  two **deferred** constraint triggers on the pattern `units_registry_check` set. The trail
  rendered a unit-less owner as `— (0,00%)`, seated in a settled electorate.
  `import_building_units` can never create one, but that was a property of the one write path
  and not of the schema. **`create constraint trigger` validates nothing that already
  exists**, so a database predating it keeps any such row — which is why
  `resolution-trail.ts` _also_ refuses to seat a zero-udział owner. Constraint stops the new,
  assembler survives the old; do not delete either half thinking it duplicates the other.
- **The whole slice needed no new grant, policy or function to read votes** —
  `votes_select_authenticated` is `using (true)` and no migration ever revoked column-level
  `select` there. So the read was already permitted, and what changed is only that the page
  asks for rows instead of a count. Worth knowing before assuming a similar read needs a
  migration.

## The unit registry and its arithmetic

The unit registry is written once, by one function, and the database checks the arithmetic.
`public.import_building_units(uuid, jsonb)` is the **only** write path into `public.units` /
`public.owners`; it is `security invoker` (a `definer` **write** path here would turn the
single write path into the single RLS bypass) and raises `EM001` when the building is not
visible, `EM002` when its registry is already populated — re-import is refused by product
decision, since changing udziały mid-vote would move the `S-05` threshold — and `EM005` when
one e-mail address carries more than one owner name. That last rule is **one address, one
person**: rows sharing an e-mail collapse into a single owner, so two names behind one
address would store one and silently drop the other. It is enforced twice on purpose —
`src/lib/units-csv.ts` rejects the file first and names both offending lines, `EM005` is the
backstop for anything reaching the RPC directly. Co-ownership is a later version.

Shares are stored as **integer basis points** in `units.share_bps`, 10000 to a building, so
the threshold comparison stays exact arithmetic rather than float comparison.
`buildings.total_area_m2` mirrors `sum(units.area_m2)` and is `null` until a registry is
imported. Neither aggregate is maintained by convention: two **deferred** constraint triggers
(`units_registry_check`, `buildings_registry_check`) assert both at commit and raise `EM003` /
`EM004`. Deferred is load-bearing — an immediate trigger would check row 1 of a 70-row insert
against a total of ~1.4% and fail.

**`src/lib/shares.ts` decides every future vote outcome, and nothing tests it.** Udziały are
computed by the largest remainder method in integer arithmetic, tie-broken by **file order** —
which is what makes a re-parse of the same bytes reproduce identical shares, and therefore
what lets the confirm endpoint recompute rather than trust the shares a browser posts back.
Never make that tie-break depend on anything float-derived or on iteration order.
`src/lib/units-csv.ts` is its partner: it exports `CSV_HEADERS`, which
`src/pages/api/buildings/units-template.csv.ts` emits verbatim, so the template an
administrator downloads cannot drift from what the parser accepts. Both modules are
dependency-free on purpose, so they can be executed directly with
`node --experimental-strip-types`.

### Why two registry reads are `security definer`

`public.assert_building_registry(uuid)` and `public.building_units_area_total(uuid)` were
flipped to `definer` on 2026-08-02 because an invoker assertion aggregates only the rows the
**caller** can see. Today `units_select_authenticated` is `using (true)` so it made no
difference; the moment `S-02` scopes that policy it would have, silently — demonstrated
before the fix: with the policy set to `using (false)` an import committed two units at 10000
bps with `total_area_m2` **null** and raised nothing, because the null sent the assertion
down its no-units early return. The no-definer rule protects the **write** path, and
`import_building_units` is still `invoker` precisely so a building the caller cannot see is
`EM001`. These two write nothing, take only a `uuid`, return `void` / `numeric`, keep
`set search_path = ''`, and have `execute` revoked from `public` and `anon` and granted to
`authenticated` only. Do not "fix" them back to invoker; verify instead by setting the units
select policy to `using (false)` and confirming an off-total registry still fails at commit.
The registry is static in v1: `update` / `delete` policies exist because the convention
demands one per operation, not because any screen uses them.

## RLS shape

**RLS is proven, not just declared, on `public.buildings`.** Eight policies — four
`authenticated` (predicate `true`; PRD v1 has no roles model, every user is an administrator)
and four `anon` (predicate `false`). Verified through PostgREST rather than by reading
`pg_policy`: anon `select` returns `[]`, anon `insert` fails `42501`. Copy this shape for
every new table, and note that `update` needs **both** `using` and `with check` — `using`
gates which rows may be touched, `with check` gates what they may become.

**`public.units` and `public.owners` repeat that shape — eight policies each, and
`authenticated` is still unscoped.** `S-01`'s migration predicted that `S-01b` would introduce
`building_id` scoping. It deliberately did not: PRD v1 has no roles model and no table binding
a user to a building, so a predicate that resolves to `true` for every caller would read as a
restriction at review time while restricting nothing. What actually protects owner personal
data in v1 is the explicit `anon` denial plus the composite foreign key
`units_owner_same_building_fkey`, which makes a unit pointing at an owner from another
building **unrepresentable** rather than merely discouraged — the PRD guardrail _"dane
właścicieli nie wychodzą poza budynek"_ as schema. Real scoping arrives with the v2 roles
model; `units_building_id_idx` exists now so that predicate lands on an indexed column.

## Schema, migrations and generated types

**Migrations are applied by hand — nothing in CI does it.** Procedure and its three rules are
in `README.md` §Applying migrations to production. What that section does not say: this is
open residual **G14** in `context/changes/deployment/deployment.md`. Push the migration
**before** the code that depends on it — reversed, production serves code querying a table
that does not exist. Forward-only: `wrangler rollback` reverts code, never schema.

**`src/db/database.types.ts` is generated, committed, and never regenerated by CI.** Run
`npm run db:types` (needs the local stack up) after every migration and commit it in the
**same commit** as the migration — the same discipline `worker-configuration.d.ts` needs, and
for the same reason. It is excluded from ESLint (Supabase's generator does not emit
Prettier-formatted output); TypeScript still checks it. Worth knowing before trusting it: a
wrong **table** name and a wrong column in an **insert/update** payload are both compile
errors, but a wrong column inside a `.select("…")` string is **not** — this version of
`supabase-js` does not type-check the projection string.

## Deploy paths

**Auto-deploy works, and the gate is proven — but it is not the only way code reaches
production.** Every push to `main` runs `.github/workflows/deploy.yml`
(`npm ci → astro sync → lint → npm test → build → wrangler deploy → assert /api/health`). The
negative case was demonstrated on 2026-08-01: a deliberate lint error failed the job at
`npm run lint` with build, `wrangler deploy` and the health assertion all **skipped** (runs
`30713400532` red, `30713455557` green). That in-job ordering is proven, and only as long as
nobody reorders the workflow.

**Cloudflare Workers Builds is a second, ungated deploy path — nobody in this repo configured
it, and it wins the race about half the time.** The Cloudflare dashboard is connected to this
GitHub repo directly (GitHub App `cloudflare-workers-and-pages`, check name
`Workers Builds: estate-manager`, discovered 2026-08-02). It is **not** in
`.github/workflows/` and not in `wrangler.jsonc`; it is dashboard-side configuration, so
nothing in a checkout hints that it exists. What it does, verified against the Cloudflare
deployments API rather than assumed:

- **On every push to `main` it builds and deploys, independently of GitHub Actions.** All
  five pushes on 2026-08-02 produced **two** production deployments seconds apart. Tell them
  apart by author: `wrangler deploy` from `deploy.yml` authenticates with
  `CLOUDFLARE_API_TOKEN` and lands with an **empty** author, while Workers Builds lands under
  the **Cloudflare account owner's e-mail** (this repo is public — the address is deliberately
  not written down here; read it from `npx wrangler deployments list`). The final merge that
  day: version `9fbf5120` deployed at `14:57:54` (Actions) and `43d45ec5` at `14:58:02`
  (Workers Builds). **Which one ends up serving traffic is a race** — Workers Builds landed
  last at `09:58`, `14:58` and `06:21`, Actions last at `08:52` and `09:12`.
- **It does not run `npm run lint`, so it is not stopped by what stops `deploy.yml`.** On
  `11968c0` — the commit carrying the deliberate lint error — `ci` and `deploy` both failed at
  `18:50:0x` UTC and `Workers Builds: estate-manager` reported **success** at `18:50:23`. The
  Cloudflare API only returns the ten most recent deployments, so whether that build also
  _deployed_ can no longer be read back; on the evidence of every later push, assume it did.
  This means the "live version untouched" claim in
  `context/changes/deployment/deployment.md`'s gate demonstration is **not established** — the
  health check stayed `200` because an unused module-scope const builds and runs fine, not
  because nothing shipped. Correct that record before citing it.
- **On a pull-request branch it uploads a version but does not deploy.** PR #15's branch
  produced version `50a8c6e5` at `14:52` that never entered the deployments list. Preview URLs
  are enabled on the subdomain (`previews_enabled: true`).
- Its build configuration (command, branch filter, build-time env vars) is **not readable from
  here**: `/accounts/<id>/builds/*` rejects wrangler's OAuth token, so the settings live in the
  dashboard under Workers → estate-manager → Settings → Builds. Two things worth checking there
  before relying on any of this: whether it has the `SUPABASE_URL` / `SUPABASE_KEY` build
  variables `deploy.yml` passes, and whether disconnecting it — leaving `deploy.yml` as the
  single, linted path — is what you actually want.

**A green deploy means the app answers.** `deploy.yml`'s final step curls `/api/health` and
fails the job on anything but `200` (5 retries, 5s apart). This is the only check that can
catch a missing or rotated **Workers Secret** — CI builds with GitHub secrets while the
running Worker reads platform secrets the build never sees. A red assertion needs a human:
`503` means _either_ missing credentials _or_ Supabase unreachable, and there is deliberately
no auto-rollback. Note what the race above does to it: on 2026-08-02 the assertion passed at
`14:57:57` against version `9fbf5120`, which Workers Builds replaced five seconds later — a
green assertion certifies the version that was live when it ran, not necessarily the one
serving traffic afterwards.

Deployed and live at https://estate-manager.estate-manager.workers.dev (Workers **Paid** since
2026-08-01 — `F-02` needed it, Email Sending is unavailable on Free). Identifiers were renamed
to `estate-manager` on 2026-08-01. Prerequisites, deployment log and residuals:
`context/changes/deployment/deployment.md`.

## Transactional mail

**The channel works, proven from production (2026-08-01).** `F-02` connected Cloudflare Email
Service through the native `send_email` binding — no API key. Mail goes out from
`glosowanie@estatemanager.dev` (our own domain; Cloudflare has no provider test domain). First
production send: `messageId <zp7Un3ZRDflfWr2q1xX3WSCOh3YQE04aIPGy@estatemanager.dev>`, fired by
a signed-in administrator through `POST /api/email/test`, which stays in the repo as a live
smoke test on a **beta** API. Cloudflare's real quota is **200 messages/day**. Record:
`context/changes/transactional-mail-channel/change.md`. Setup procedure and the binding's shape:
`README.md` §Transactional email.

**A missing `EMAIL` binding does not fail the deploy — deliberately, and that decision is now
overdue for revisit.** `/api/health` reports `"email":"ok"|"missing"` inside its `200` and the
config-status banner shows it, but neither flips the status code. **Demonstrated on production
2026-08-04**, not just argued: with the binding removed, `/api/health` returned
`200 {"status":"ok","email":"missing"}` and the fanout recorded `E_BINDING_MISSING` against
every owner while the deploy stayed green. `S-04` has made the channel load-bearing, so the
argument that held for a beta channel no longer covers a building whose owners are waiting for
a link. Propagation lag seen the same day: `/api/health` kept reporting the previous binding
state for ~15 s after a deploy, so retry before believing it.

## Auth and accounts

**Administrator login is verified on production (2026-08-01).** The full round trip ran against
the live Worker — sign in → `/dashboard` → survives a reload → sign out → `/dashboard` bounces
to `/auth/signin` — in `curl` and in a browser. First successful production login; it proves
cookie-based `@supabase/ssr` sessions work on workerd. Record:
`context/changes/deployment/deployment.md`.

**No self-service registration — by product decision (2026-08-01).** `/auth/signup`,
`/auth/confirm-email` and `src/pages/api/auth/signup.ts` are **gone** — `F-01` deleted them;
all three now return `404` in production. Consequence: Supabase Site URL (runbook step B7) and
email confirmation are no longer blockers, because no product flow sends a confirmation link.
The dashboard procedure for creating an account is in `README.md` §Auth routes.

**Local seeds an admin, production never does, and the asymmetry is deliberate** — a code path
that mints administrators against production is a standing risk to the owner-data guardrail; do
not "fix" it. Rationale and procedure: `README.md` §Local and production create accounts
differently. The seed **has now run** (`S-01`, 2026-08-02): its `auth.users` assumptions hold,
verified the only way that proves anything — by signing in, not by selecting the row.

## Workers Logs and voting tokens

**Workers Logs is the one place voting tokens are persisted, and no code change in this repo can
stop that.** `wrangler.jsonc` sets `"observability": { "enabled": true }`, and Workers Logs
records each invocation's request URL. A voting token travels in the path (`/vote/<token>`), so
every link an owner opens lands in Cloudflare's log store for up to **7 days** (the product's
maximum retention) and is readable by anyone with dashboard access. The application code holds
the line — no `console.` in any voting module, no error path interpolates a token — so the
guardrail is a property of the **source**, not of the running system; do not cite "the token
never reaches a log line" as an established fact about production. The audience this widens to
is Cloudflare-dashboard holders, who today are the same person who already sees every token of
their buildings on the resolution page. The only fix that makes the literal claim true is moving
the token out of the URL path, which is a schema-sized change, not a comment change. Turning
observability off is not free either — it is the log store `deploy.yml`'s `/api/health` failures
get diagnosed from.

## Building modules UI (`S-09` level 2)

`/buildings/<id>` is an index of that building's modules, not a screen with the registry on it.
`S-09` level 2 (`multi-module-ui`) shipped 2026-08-05, out of roadmap order on the product
owner's instruction. Four things follow:

- **`src/lib/building-modules.ts` is the registry, and it is the point of the slice.** Adding a
  module is an entry in `BUILDING_MODULES` plus its route — never an edit to the building page's
  markup. If adding one ever requires touching that markup, the file has stopped doing its job.
  Two rules in it are decisions, not description: only modules that **exist** appear (no
  "wkrótce" rows — PRD `## Non-Goals` parks the rest), and "module" means navigational, not
  commercial.
- **The registry moved to `/buildings/<id>/units`; the uchwały list stays at
  `/buildings/<id>/resolutions`.** Both were already protected the moment they existed —
  `PROTECTED_ROUTES` matches with `startsWith` and contains `"/buildings"`, so **no entry was
  added**. That is the rare case where the only auth gate needed nothing; verified by request
  against a local Worker (anon → `302 /auth/signin` on both, with `/dashboard` → `302` and `/` →
  `200` as controls), not by reading the array. The CSV import endpoint and page now redirect to
  `/buildings/<id>/units`, because `/buildings/<id>` is no longer the registry.
- **`src/components/buildings/BuildingHeader.astro` carries the state "I am in building X"** —
  breadcrumbs and building identity. The roadmap names _this_, not the cards, as the substance of
  the slice: without it level 2 is loose screens sharing a URL prefix. It carried the modules as a
  strip of tabs until 2026-08-05; the strip is gone because the rail draws the same list, and its
  `activeModule` prop is now `inModule`, which decides one thing only — whether the breadcrumb's
  building name links back to the overview.
- **The voting module is listed even when the registry is empty**, where the old building page
  hid the uchwały section until import — structure used to disappear along with its content. The
  "co jest pierwsze" answer moved into `/buildings/<id>/resolutions`, which now guards on an
  empty registry itself rather than relying on the caller to hide the link.
- **The tiles are gone from `/buildings/<id>` too** (2026-08-05, same instruction that produced
  the rail). What is left is a _Stan budynku_ list carrying what the tiles held besides
  navigation — how far each module has got, and the one thing to do next when it has not started.
  It still loops over `BUILDING_MODULES`, so the first bullet above holds unchanged.

## Module navigation (the left rail)

Modules are a rail down the left of every signed-in screen, and both levels of them come out of a
registry. Shipped 2026-08-05 on the product owner's instruction, replacing the tiles that sat in
the middle of `/dashboard` and `/buildings/<id>`. `src/components/SideNav.astro` draws it;
`src/lib/app-modules.ts` is the level-1 registry, the twin of `building-modules.ts` and the half
of `S-09` level 1 that `/dashboard` previously faked with two hand-written tiles. Five things are
load-bearing:

- **The rail's only input is the path.** `currentBuildingId` / `currentBuildingModuleId` (in
  `building-modules.ts`) read the building and the module out of `/buildings/<id>/…`, so not one
  of the eight screens under that prefix passes navigation state — the rail takes no props at all.
  `src/lib/app-modules.test.ts` pins both, because a rail that marks the wrong module looks like a
  working rail in every screenshot.
- **`SideNav.astro` contains no module names**, including which module has submodules:
  `appModuleSubmodules` answers that. The moment adding a module needs a line of markup there, the
  registries have stopped doing their job.
- **Exactly one item is filled at a time** — the deepest one the reader is on. A module whose
  submodule is open takes weight without a background, and `aria-current="page"` sits on that one
  item only. Filling both reads as two current pages.
- **The topbar is no longer navigation.** It kept a copy of _Budynki_ / _Pomoc_ until the rail
  landed; two lists of the same destinations, one above the other, is how an interface starts to
  feel larger than the product behind it. It now carries the wordmark, the address and _Wyloguj_.
- **`nav={false}` opts a page out**, and `/` is its only caller. A signed-out reader never gets
  the rail regardless — every module route is behind the auth gate, so the rail would offer an
  anonymous visitor a column of redirects to the sign-in screen. `/vote/<token>` still renders its
  own document and must not use `AppShell` at all; the rail makes that case worse, not better,
  since every link on it needs a session the owner does not have.

## Product name (`S-08`)

The product's visible name is "EstateManager", and it lives in exactly two files. `S-08`
(`landing-page-identity`) shipped 2026-08-05: `/` shows the name and the sentence _Twój portal
do zarządzania nieruchomościami_, and nothing else. Three things follow:

- **`src/components/Welcome.astro` is gone** and `src/pages/index.astro` holds its own markup,
  like every other page here. The starter's three feature cards and its separate _Sign In_ button
  went with it; `Topbar` still carries sign-in, so the page describes and admits in the same
  breath.
- **The page gained the product's one picture on 2026-08-05** — `src/components/PencilSkyline.astro`,
  a row of five blocks of flats drawn as if in pencil. It is inline SVG generated from a `BLOCKS`
  array, not hand-written markup: the wobble is `feTurbulence` + `feDisplacementMap`, the shading
  is one `<pattern>`, and the whole scene is stamped twice — firmly, then faintly and offset —
  through two filters with **different seeds**, because a doubled line that displaces identically
  reads as a printing error rather than as a hand. Three consequences: it is `aria-hidden`, since
  the heading beside it already names the product; it strokes `currentColor`, so it never pins a
  grey the palette does not know about; and it fetches nothing, which is what keeps it legal under
  this app's CSP. Move the skyline by editing `BLOCKS`, never the markup below it.
- ~~**The cosmic styling stays, as a decision.**~~ **Reversed on 2026-08-05**, on the product
  owner's instruction, hours after `S-08` recorded it. The starter's dark gradient, its purple
  accents and its `bg-cosmic` utility are gone from every screen — see
  [Design system](#design-system). `S-08`'s reasoning still holds and is why the reversal was done
  in one pass rather than per screen: the question was asked precisely so `S-09` level 1 would not
  face two visual languages, and answering it twice would have produced exactly that.
- **The name is copy, not an identifier.** `src/pages/index.astro`'s heading and
  `src/layouts/Layout.astro`'s default `title` (was `"10x Astro Starter"`) are the only two places
  it appears as product text. Changing it there is a copy edit and does **not** touch the
  `estate-manager` rename rule — that governs the Worker name, the project name and the manifests,
  which are a different string with a different blast radius.

## Design system

There is one design system now, it lives in two files, and a screen that names a raw colour has
broken it. Shipped 2026-08-05 on the product owner's instruction, reversing `S-08`'s "cosmic
stays" decision. `src/styles/global.css` holds the palette as oklch tokens — a light, near-neutral
chrome with one institutional blue accent — and `src/lib/ui.ts` holds the class vocabulary every
screen draws from (`CARD`, `BUTTON_PRIMARY`, `TABLE_*`, `BADGE_TONES`, `ALERT_TONES`). Five things
are load-bearing:

- **Colour carries meaning or it is grey.** The chrome is chroma ≤ 0.02. Saturated colour is spent
  only on the accent and on the four states the domain already assigns meaning to, and
  `BADGE_TONES` is the one table that assigns them: neutral = nothing yet, info/sky = live,
  success/emerald = _podjęta_, danger/rose = _upadła_, warning/amber = look at this.
  `src/lib/resolutions.ts` no longer carries its own class strings — it imports them — so the green
  on a status badge and the green on a vote row in the trail cannot drift apart. That was the
  specific risk its own comment named.
- **An uchwała that falls is not an error, and the shape is what says so.** `ALERT_TONES.danger`
  (rose) and `ALERT_TONES.error` (red) are nearly the same hue and could never be told apart by
  colour; what separates them is that a fallen uchwała is a *pill* and a failure is a *block with
  `role="alert"`*. Do not "simplify" the two into one tone.
- **`src/components/AppShell.astro` owns every page's outer geometry** — document, persistent
  topbar, the module rail, and one content column at one of three widths from `WIDTHS`. Eleven
  pages each had their own wrapper before it, and had already drifted into three paddings. Since
  the rail landed it has two geometries, not one: rail plus content inside `SHELL_CONTAINER` for a
  signed-in reader, a centred column for everyone else. The `min-w-0` on the content column is
  load-bearing — without it a `wide` table refuses to shrink beside the rail and pushes the whole
  page sideways instead of scrolling inside its wrapper. **`/vote/<token>` must not use it**, and its page comment says why: `AppShell` carries links, and a click on one would put a
  voting token into a `Referer`. That page renders its own document and its wordmark is
  deliberately plain text, not a link.
- **`src/lib/ui.ts` imports nothing**, so `resolutions.ts` can take its tones from it without
  breaking that module's dependency-free promise. Keep it that way — the moment it imports
  something, three `src/lib` modules stop being executable on their own.
- **The auth surface is Polish now.** `SignInForm`'s four validation messages and the
  sign-in/sign-out labels were the last English copy in the product, against the Polish-copy rule.
  `<html lang>` moved from `en` to `pl` in the same pass, which is what stops a screen reader
  pronouncing Polish names with English phonetics.

## Test environment

A test environment exists as of 2026-08-05. It was empty of tests on purpose; `S-06` wrote the
first two suites into it the same day — and note that both were written **before** the code they
cover, which is the pattern to copy. `context/changes/test-environment-bootstrap/` installed
Vitest 4.1.10 (`vitest.config.ts`, `npm test`, `src/lib/smoke.test.ts`) and pgTAP
(`supabase/tests/database/smoke.test.sql`, `npm run test:db`), and wired both gates: `ci.yml`
gained `npm test` plus a parallel `db-contract` job (`supabase/setup-cli` → `supabase start` →
`supabase test db`), and `deploy.yml` gained `npm test` only — a `supabase start` in front of every
production deploy would add minutes to the path that matters most to re-prove what the PR already
proved.

Scope was harnesses and gates, **not** the tests: `context/foundation/test-plan.md` §3 Phase 1's
udział-allocation oracle and Phase 2's contract suite are both still unwritten, and the Status
cells say so. The gates are enforcing early deliberately, so the first real test is protected the
day someone writes it. Two facts that will otherwise be rediscovered the hard way:

- **`getViteConfig()` cannot be used here** — the wiring Astro's own testing guide recommends, and
  which test-plan §4 recommended until this change. The Cloudflare adapter's Vite plugin rejects
  the `resolve.external` list Vitest sets on its `ssr` environment and the run dies before
  collecting a test (`{ adapter: undefined }` does not help; Astro's inline config merges rather
  than unsets). `vitest.config.ts` uses plain `defineConfig` plus `vite-tsconfig-paths`.
- **pgTAP is created inside each test file's own transaction**, never in a migration, because
  `supabase/migrations/` is applied to production by hand and is forward-only — a new `.test.sql`
  that omits `create extension if not exists pgtap` fails on a fresh database.

## Known advisories

- `astro@6.3.1` carries a high-severity reflected XSS (range `<=7.0.9`) with no fix in the 6.x
  line. Accepted for now — see the residuals table in
  `context/changes/deployment/deployment.md` before upgrading.
