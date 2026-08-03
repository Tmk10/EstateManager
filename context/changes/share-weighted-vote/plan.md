# Share-Weighted Vote (S-03) Implementation Plan

## Overview

The owner opens their individual link, reads the uchwała, and casts a final `za` or `przeciw`
weighted by the summed udziały of their lokale. This is the roadmap's north star (`S-03`): the
only place the product's central claim — *blokadą jest nieobecność, a nie sprzeciw* — can be
confirmed or refuted.

`S-02` built the path up to the click and stopped there. `src/pages/vote/[token].astro:102`
currently renders *"Oddawanie głosów nie jest jeszcze dostępne"*. This plan replaces that panel
with the vote, and carries in the two schema gaps the `S-02` implementation review marked
blocking.

## Current State Analysis

**What exists.** `public.resolutions` and `public.voting_links` (migration `20260802181500`), one
link per **owner** per resolution, token = 32 CSPRNG bytes as 43 base64url characters
(`src/lib/voting-token.ts`). `public.resolve_voting_link(text)` is `security definer`, `stable`,
`set search_path = ''`, and is the project's only door for a caller with no session: one opaque
token in, one fixed narrow row out, zero rows for both an unknown token and a token whose
resolution is still a draft — indistinguishably. Migration `20260802214500` revoked column-level
`select (token)` from `authenticated` **and** `anon`, so the administrator never sees a link.

**What is missing.** Nothing writes a vote, and nothing can: `anon` is denied on all four
operations on every table in the schema, and a policy cannot see a bearer token, so there is no
RLS-shaped way to let an unauthenticated voter insert.

**Two blocking gaps, named by the `S-02` review** (`reviews/impl-review-phase-3-4.md:243`,
roadmap `S-03` Unknowns, `Block: yes`):

1. Nothing refuses `update voting_links set owner_id = …`. The composite foreign key
   `voting_links_owner_same_building_fkey` permits reassigning a live token to a different person
   **within the same building**. Harmless while no votes exist; a way to swap the voter the moment
   they do.
2. Nothing refuses `delete from resolutions` on an open resolution, which cascades its links away.
   `assert_resolution_frozen` is a `before update` trigger and never sees a delete.

**Constraints inherited and not up for renegotiation here.**

- The registry is static in v1: `import_building_units` raises `EM002` on re-import and there is
  no edit screen. Shares therefore cannot move under a cast vote.
- `resolutions.status` is `draft` or `open` only. `passed` / `rejected` arrive with `S-05`; the
  check constraint `resolutions_status_known` is deliberately a check, not an enum, so widening it
  later is ordinary DDL.
- `opened_at` is the Worker's clock, not `now()` (review finding F5). Nothing in this plan
  differences it against a database-generated timestamp.
- No test runner. Verification is `npx astro sync && npm run lint && npm run build`, plus
  PostgREST probes and rendered HTML.

### Key Discoveries

- **`resolve_voting_link`'s return list IS the visibility contract for the internet**
  (`20260802181500_create_resolutions_and_voting_links.sql:397`). Its own stated standard for what
  may be added is *"the reader's own data"* — which their own cast vote is. Extending it is the
  consistent move; adding a second definer function would split one contract across two places.
- **Postgres will not `create or replace` a function whose return type changes.** Adding columns
  to `resolve_voting_link` means `drop function` then `create function`, inside the migration's
  transaction, and re-issuing the `revoke` / `grant` pair — a dropped function takes its ACL with
  it.
- **Zero rows is the entire error model** of the unauthenticated path, and the vote page's first
  stated property is that every failure renders identically (`src/pages/vote/[token].astro:15-19`).
  Any new branch that answers differently before a token has resolved turns the token space into
  something worth probing.
- **Column-level grants on `voting_links` are now the operative privilege.** A column added to
  that table in a later migration is not readable by `authenticated` until it is named in the
  grant (`20260802214500…sql:16-19`). This plan adds no column there, but the votes table's own
  grants must be written knowing that a table-level `select` outranks a column-level revoke.
- **`security definer` bypasses RLS entirely.** Denying writes in the votes policies constrains
  PostgREST callers only; it does not constrain `cast_vote`. Finality therefore needs a trigger as
  well as policies — the two are not redundant, they cover different callers.
- **Astro's `security.checkOrigin` runs before middleware.** A form POST without an `Origin`
  header gets `403`, not the response under test. Every `curl` probe of the vote endpoint needs
  `-H "Origin: <origin>"`.
- **`/api/vote` is public by omission.** `PROTECTED_ROUTES` (`src/middleware.ts:18`) matches with
  `startsWith` and lists `/api/buildings`, not `/api/vote`. That is correct and must be commented,
  next to the existing note explaining why `/vote` is absent.
- **supabase-js does not type-check `.select()` projection strings** (CLAUDE.md). A wrong column
  inside one is not a build error. Grep, don't trust the compiler.

## Desired End State

An owner holding a valid link for an open resolution can, with no account and no JavaScript:
read the uchwała, press `Za` or `Przeciw`, confirm on a second screen that names their choice and
warns the vote is final, and land on a receipt showing which way they voted, when, and with what
weight. Returning to the link later shows that same receipt. A second cast is impossible — refused
by a unique constraint, by policies, and by a trigger.

The administrator's resolution page reports how many owners have voted, out of how many hold
links — a count of people, explicitly labelled as not the share balance.

Verified by: the local end-to-end path, PostgREST probes proving `anon` cannot reach `public.votes`
directly, and one real vote cast through the production Worker.

## What We're NOT Doing

- **No tally, no threshold, no outcome.** `S-05` owns the share balance, the 50% comparison, and
  the `passed` / `rejected` statuses (FR-007, FR-008). Nothing here sums votes or writes a status.
- **No e-mail.** `S-04` owns the fanout. Tokens are read by hand from the database for verification.
- **No per-owner voted/not-voted breakdown** on the admin page. That pulls in the question of
  whether the administrator may see *how* someone voted, which `S-06` is scoped to answer.
- **No withdrawal, no vote change, no "wstrzymuję się".** PRD: the vote is final and there are two
  options.
- **No roles model.** `voting_links_*_authenticated` and the new `votes_select_authenticated` stay
  `using (true)`. The `S-02` review's second prerequisite (`Block: no` for one account) is a hard
  prerequisite for a **second** administrator account and remains open.
- **No change to the building-delete cascade race** flagged in `20260802181500…sql:117-122`. No
  product path deletes a building.
- **No move of the token out of the URL path.** Workers Logs persists it for 7 days regardless
  (finding F3, accepted as risk). Schema-sized work, still deferred.

## Implementation Approach

One `security definer` function is the whole write path, mirroring `resolve_voting_link` in shape
and in argument. The client sends a token and a choice; it never names an owner, a resolution, or
a weight. The function resolves the link itself, sums the owner's units itself, and writes one row.

That is the project's **first `security definer` write**, and CLAUDE.md's no-definer rule exists to
prevent exactly that — so the migration must argue it, not assume it. The argument: the rule
protects the single write path into the registry, where `import_building_units` stays `invoker`
precisely so an invisible building raises `EM001`. Here there is no caller identity to preserve —
`anon` is denied on every table by design, and the alternative (an `anon` insert policy) requires
the browser to post its own `owner_id` and the bearer token as a column, which is strictly worse
than what `S-02` already rejected.

Finality is enforced three times, at three different callers: a unique constraint on
`(resolution_id, owner_id)`, policies denying `insert` / `update` / `delete` to both roles, and a
trigger refusing `update` and `delete` outright — the last being the only one `cast_vote` itself is
subject to.

The weight is snapshotted onto the vote row. The registry cannot move in v1, so this changes no
outcome today; it exists so that `S-06` can show *which* udziały made a result (`## Non-Functional
Requirements`) by reading the votes, rather than by reconstructing what the shares happen to be at
the time someone asks.

## Critical Implementation Details

**Ordering across the two migrations.** The hardening migration must apply before the votes
migration. Both are forward-only (`supabase db push` has no rollback; `wrangler rollback` reverts
code, never schema), so each file runs in a single transaction and the filename timestamps carry
the order.

**Error-model boundary.** Neutral before the token resolves; specific after. Concretely: the page
and the endpoint may name a failure only on a code path reached *after* `cast_vote` or
`resolve_voting_link` returned a row. Everything else — unknown token, malformed token, draft
resolution, RPC error, unconfigured client — renders the existing neutral page with the same `200`.
The two regimes must be named in a comment where they meet, or a later reader will collapse them.

**Headers before the branch.** `Cache-Control` / `X-Robots-Tag` / `Referrer-Policy` must be set
before `view` is resolved. Headers that differ between a hit and a miss are as observable as body
differences and would break the page's own first stated property — this is the constraint finding
F4 recorded when the work was skipped in `S-02`.

**The confirm step is a GET.** Pressing `Za` navigates to `/vote/<token>?wybor=za` — a read with no
side effect, which keeps the browser's back button and a double-tap harmless. Only the confirm
screen POSTs. An unresolvable token renders the neutral page whatever the query string says.

---

## Phase 1: Schema — hardening, `public.votes`, and the one write door

### Overview

Close the two gaps `S-02`'s review marked blocking, then add the votes table and the single
function that writes to it. Extend the unauthenticated read contract with the reader's own vote.

### Changes Required:

#### 1. Hardening migration

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_harden_voting_links_and_resolutions.sql`

**Intent**: Make "a live token cannot be reassigned" and "an open resolution cannot be deleted"
properties of the database rather than of the absence of a UI button — the same argument
`assert_resolution_frozen` already makes for resolution content. Both become reachable attacks the
moment votes exist.

**Contract**: A `before update` trigger function on `public.voting_links` raising `EM008` when
`token`, `owner_id` or `resolution_id` is `distinct from` its old value; a `before delete` trigger
function on `public.resolutions` raising `EM009` when `old.status <> 'draft'`. Both `security
invoker` (they decide nothing about visibility), both `set search_path = ''`, both with English
exception messages and a `comment on function` explaining the code — matching `EM001`–`EM007`.
Note that `building_id` on `voting_links` is deliberately *not* in the frozen list: it is
denormalised solely to carry the two composite foreign keys, and both would reject a cross-building
change anyway.

#### 2. Votes migration

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_create_votes.sql`

**Intent**: Create the table that records a vote, the policies and trigger that make it immutable,
and the one function through which a caller with no session may write it.

**Contract**:

`public.votes` — `id`, `resolution_id`, `owner_id`, `building_id`, `voting_link_id`, `choice`,
`share_bps`, `created_at default now()`. Constraints: `unique (resolution_id, owner_id)` (one vote
per owner per resolution — the identity of a vote); `check (choice in ('for', 'against'))` as a
check constraint, not an enum, for the same reason `resolutions_status_known` is;
`check (share_bps > 0)`; composite foreign keys to `resolutions (id, building_id)` and
`owners (id, building_id)` in the shape `voting_links` uses, so a vote pairing an owner and a
resolution from different buildings is unrepresentable; a plain foreign key to `voting_links (id)`
recording the route the vote took. `created_at` is the **database's** clock — unlike `opened_at`,
which finding F5 recorded as the Worker's.

Eight policies, one per operation × role, following the established shape with one deliberate
deviation that must be commented: `select` is `true` for `authenticated` (S-05 reads the tally) and
`false` for `anon`; **`insert`, `update` and `delete` are `false` for both roles**. The only writer
is `cast_vote`, which is `security definer` and therefore not subject to them. State in the comment
that this departs from every other table in the schema on purpose — "głos jest ostateczny" — so a
later reader does not "fix" it back to `true`.

A `before update or delete` trigger on `public.votes` raising `EM010` unconditionally. Not
redundant with the policies: `cast_vote` runs as the function owner and bypasses RLS, so this is
the only constraint that binds the write path itself.

`public.cast_vote(p_token text, p_choice text)` — `security definer`, `volatile`,
`set search_path = ''`, fully qualified references, `revoke execute … from public`, `grant execute
… to anon, authenticated`. It resolves the token to its link and resolution, requires
`r.status = 'open'`, sums the owner's `units.share_bps`, and inserts one row `on conflict
(resolution_id, owner_id) do nothing`. It returns a **narrow** row describing the outcome —
whether this call recorded the vote or one already existed, plus the stored choice and
`created_at` — and **zero rows** when the token does not resolve or the resolution is not open, so
that the neutral case stays indistinguishable exactly as `resolve_voting_link`'s does. An invalid
`p_choice` is the one input the caller controls and is rejected before any lookup, since it cannot
distinguish anything about the token space.

The `on conflict do nothing` is load-bearing, for the same reason `open.ts`'s upsert is: it makes a
double submit return the existing vote rather than raising `23505` on a path that must not leak
whether a row exists.

`public.resolve_voting_link(text)` — dropped and recreated with two columns added:
`own_vote_choice` and `own_voted_at`, both nullable, sourced from a left join to `public.votes` on
the resolving owner and resolution. Re-issue the `revoke` / `grant` pair after the recreate; a
dropped function takes its ACL with it. Update the `comment on function` — it currently states the
return list *is* the visibility contract, so it must say why a vote belongs there (it is the
reader's own, the same standard `owner_share_bps` already meets) and that no other owner's vote
may ever join it.

#### 3. Generated types

**File**: `src/db/database.types.ts`

**Intent**: Keep the committed types in step with the schema, in the same commit as the migrations
— the discipline CLAUDE.md records for both this file and `worker-configuration.d.ts`.

**Contract**: Regenerate with `npm run db:types` against a local stack that has both migrations
applied. The `Functions` block must show `cast_vote` and the widened `resolve_voting_link`.

### Success Criteria:

#### Automated Verification:

- Both migrations apply cleanly against a reset local stack: `npx supabase db reset`
- `npm run db:types` produces a diff containing `cast_vote` and the two new
  `resolve_voting_link` columns
- Type checking and linting pass: `npx astro sync && npm run lint`
- Build passes: `npm run build`

#### Manual Verification:

- `update voting_links set owner_id = …` raises `EM008`; `update … set created_at = …` still
  succeeds, proving the trigger is scoped and not a blanket refusal
- `delete from resolutions` raises `EM009` on an open resolution and succeeds on a draft
- `update votes` and `delete from votes` both raise `EM010`, as `postgres`
- `cast_vote` with an unknown token, a truncated token, and a draft resolution's token all return
  zero rows — indistinguishably
- `cast_vote` twice with the same token returns the same stored choice both times, and
  `select count(*) from votes` shows one row
- Through PostgREST as `anon`: `select` on `votes` returns `[]`, `insert` fails `42501`; as
  `authenticated`: `select` returns rows, `insert` fails `42501`
- `resolve_voting_link` still returns zero rows for an unknown token, and returns the reader's own
  vote once one exists

**Implementation Note**: pause for manual confirmation before committing.

---

## Phase 2: The voting path — page and endpoint

### Overview

Replace the "not yet available" panel with the three-state voting flow, and add the endpoint that
calls `cast_vote`. No JavaScript, no client island.

### Changes Required:

#### 1. The vote endpoint

**File**: `src/pages/api/vote/[token].ts`

**Intent**: Take the confirmed choice from the confirm screen, call `cast_vote`, and redirect back
to the vote page. The only write path an unauthenticated caller can reach.

**Contract**: `POST`, form data not JSON, responding with `context.redirect()` — the shape every
form endpoint in this app uses (`src/pages/api/auth/signin.ts`, `.../resolutions/[resolutionId]/open.ts`).
Reads `choice` from the form; redirects to `/vote/<token>` on success, and to
`/vote/<token>?error=<message>` on a named failure. Zero rows from `cast_vote` redirects to
`/vote/<token>` with **no** error parameter, so an unresolvable token lands on the same neutral
page it would have rendered anyway.

The token must not appear in any error message or log line. The file needs the same header comment
`open.ts` carries, scoping that rule to this repository's source and naming the Workers Logs
exception.

#### 2. Middleware note

**File**: `src/middleware.ts`

**Intent**: Record that `/api/vote` is public by omission, deliberately, beside the existing note
explaining the same for `/vote`.

**Contract**: Comment only — no change to `PROTECTED_ROUTES`. `startsWith` matching means adding
`/api/vote` would break every vote; say so.

#### 3. The vote page

**File**: `src/pages/vote/[token].astro`

**Intent**: Grow three states out of the existing single state, without weakening any of the three
properties its header comment declares.

**Contract**: Set `Cache-Control: private, no-store`, `X-Robots-Tag: noindex, nofollow` and
`Referrer-Policy: no-referrer` on `Astro.response.headers` **before** the `view` branch. Consume
the widened `resolve_voting_link` return. Then render exactly one of:

- **receipt** — when `own_vote_choice` is set: the uchwała, "Zagłosowałeś: Za / Przeciw", the date
  via `formatResolutionDate`, and the weight via `formatShareBps`. This is both FR-005's
  confirmation and the answer to the second-visit question the roadmap left open.
- **confirm** — when `?wybor` names a valid choice and no vote exists: the choice stated back in
  words, a visible warning that the vote is final and cannot be changed or withdrawn, a POST form
  to the endpoint carrying the choice in a hidden field, and a way back to the buttons.
- **buttons** — otherwise: a `method="get"` form with two submits, `name="wybor"`, values `za` and
  `przeciw`, replacing the panel at `:102`.

An unrecognised `?wybor` value falls through to buttons rather than erroring — it is caller-
controlled and says nothing about the token. The `?error=` message is rendered only in the two
states reached after the token resolved; the neutral branch ignores it entirely.

The three header properties hold unchanged: one answer for every failure, the token never echoed
into the markup, and **no outbound links anywhere** — which the new forms must respect (they post
to a same-origin path, and no anchor is added).

### Success Criteria:

#### Automated Verification:

- `npx astro sync && npm run lint && npm run build` clean
- `grep -c '"/api/vote"' src/middleware.ts` → `0`
- No `console.` and no token interpolation in the new files (grep)

#### Manual Verification:

- Full local path against `npm run dev`: open a token read from the local database, press `Za`,
  confirm, land on the receipt showing the right choice, date and weight
- Reload the receipt and open the link in a fresh browser profile — the receipt persists
- Press `Przeciw` on a second owner's token; both rows land with the right weights and the sum of
  the two `share_bps` matches the two owners' registry shares
- An unknown token, a truncated token, a draft resolution's token, and any `?wybor` value on each
  of them all render the identical neutral page with `200`
- Response headers carry all three values, and are **identical** between a resolving and a
  non-resolving token
- `curl` POST to the endpoint without `Origin` returns `403` (checkOrigin), and with `Origin` but
  an unknown token redirects to the neutral page with no error parameter
- Direct POST with a forged `choice` value is refused without revealing whether the token exists
- The page renders and votes correctly with JavaScript disabled

**Implementation Note**: pause for manual confirmation before committing.

---

## Phase 3: The administrator's vote count

### Overview

One number on the resolution page: how many owners have voted, out of how many hold links.

### Changes Required:

#### 1. Resolution detail page

**File**: `src/pages/buildings/[id]/resolutions/[resolutionId].astro`

**Intent**: Give the administrator visible evidence that votes are landing, without building any
part of `S-05`.

**Contract**: In the non-draft branch, alongside the existing `Właścicieli z linkiem` figure, add
`Zagłosowało N z M właścicieli` — `N` from a `count: "exact", head: true` read of `votes` scoped to
the resolution, `M` from `linkedOwners.length`. Reuse the existing `Promise.all` read rather than
adding a fourth round trip.

The copy must say it counts **people, not udziały**, and a comment must record why: the outcome
rule counts only shares, so a people-count sitting on the outcome's page is a temporary
convenience that `S-05` replaces with the share balance (FR-008). No per-owner voted marker, no
choice, no percentage — those carry the privacy question `S-06` is scoped to answer.

### Success Criteria:

#### Automated Verification:

- `npx astro sync && npm run lint && npm run build` clean
- The `voting_links` projection still names columns and still excludes `token` (grep — supabase-js
  does not type-check projection strings)

#### Manual Verification:

- With two of three linked owners voted, the page reads `Zagłosowało 2 z 3 właścicieli`
- The draft branch is unchanged, and the page still shows no token anywhere
- The count does not appear before the vote is opened

**Implementation Note**: pause for manual confirmation before committing.

---

## Phase 4: Production — migrations, deploy, one real vote

### Overview

Apply the schema to production **before** the code that depends on it, then prove the north star
against the live Worker.

### Changes Required:

#### 1. Migration push

**File**: — (operational)

**Intent**: Nothing in CI applies migrations (open residual **G14** in
`context/changes/deployment/deployment.md`). Reversed ordering serves code querying a table that
does not exist.

**Contract**: `npx supabase db push` from a linked checkout, both migrations, **before** the PR is
merged. Forward-only: `wrangler rollback` reverts code, never schema.

#### 2. Change record

**File**: `context/changes/share-weighted-vote/change.md`

**Intent**: Record what this slice decided and what it left open, in the form `S-02`'s record takes
— so `S-05` and `S-06` plan against the real behaviour rather than against this plan's intentions.

**Contract**: `## Notes` gains: the first `security definer` **write** and the argument for it;
`share_bps` snapshotted and declared authoritative over any later recomputation; the votes table's
deliberate policy deviation; `EM008`–`EM010`; the second-visit and confirm-step decisions and that
they were the user's calls; the reversal of finding F4 (headers now set) with the reason the stakes
moved; and the still-open `S-02` prerequisite that `voting_links_*_authenticated` is `using (true)`,
making the v2 roles model a hard prerequisite for a second administrator account.

### Success Criteria:

#### Automated Verification:

- CI green on the pull request (`ci.yml` runs lint + build on `pull_request`)
- After merge, `deploy.yml` green including the `/api/health` assertion

#### Manual Verification:

- Migrations applied to production before the merge, confirmed by reading the schema back
- One token read from the production project and one **real vote** cast through the live Worker,
  end to end, in a browser
- The receipt renders on production and survives a reload
- Response headers on the production vote page carry all three values
- `deploy.yml`'s health assertion certifies the version that was live when it ran — note the
  Workers Builds race (CLAUDE.md) and confirm which version is actually serving with
  `npx wrangler deployments list`
- CLAUDE.md "Current state" updated with what S-03 shipped

**Implementation Note**: pause for manual confirmation before committing.

---

## Testing Strategy

There is no test runner in this project and none is introduced here. Verification is:

### Automated:

- `npx astro sync && npm run lint && npm run build` after every phase
- `npx supabase db reset` proving both migrations apply from empty

### Database-level (manual, as `postgres` and through PostgREST):

- Every raise path: `EM008`, `EM009`, `EM010`
- Every zero-row path of `cast_vote` and `resolve_voting_link`, checked to be indistinguishable
- Both roles against `public.votes` for all four operations

### Manual Testing Steps:

1. `npx supabase db reset`, then create a building, import the units CSV, create a resolution and
   open the vote through the UI.
2. Read two tokens directly from `public.voting_links` as `postgres` (the only source until `S-04`).
3. Vote `Za` on the first: buttons → confirm → receipt. Reload; the receipt persists.
4. Vote `Przeciw` on the second. Check both rows' `share_bps` against the registry.
5. Re-submit the confirm form for the first owner; the receipt is unchanged and no second row lands.
6. Probe the neutral path: unknown token, 42-character token, a draft resolution's token, each with
   and without `?wybor` — all identical, `200`, identical headers.
7. Repeat step 3 with JavaScript disabled.
8. On production after deploy: one real vote, end to end.

## Migration Notes

Two forward-only migrations, applied in filename order, each in one transaction. `db push` runs
before the code that depends on them reaches `main` (residual **G14**). `resolve_voting_link` is
dropped and recreated inside the second transaction, so no window exists in which the
unauthenticated read path is missing.

`src/db/database.types.ts` is regenerated and committed in the same commit as the migrations.

## References

- Roadmap slice: `context/foundation/roadmap.md:174-188` (`S-03`, north star)
- Blocking prerequisites: `context/changes/resolution-with-voting-links/reviews/impl-review-phase-3-4.md:209-245` (F10)
- Prior slice: `context/changes/resolution-with-voting-links/plan.md`
- Read contract: `supabase/migrations/20260802181500_create_resolutions_and_voting_links.sql:340-408`
- Token grant posture: `supabase/migrations/20260802214500_restrict_voting_link_token_select.sql`
- Endpoint pattern: `src/pages/api/buildings/[id]/resolutions/[resolutionId]/open.ts`
- Share arithmetic: `src/lib/shares.ts`
- PRD: `## Functional Requirements` FR-005, FR-006; `## Non-Functional Requirements`;
  `## Success Criteria` → Guardrails

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not
> rename step titles.

### Phase 1: Schema — hardening, `public.votes`, and the one write door

#### Automated

- [x] 1.1 Both migrations apply cleanly against a reset local stack
- [x] 1.2 `npm run db:types` produces a diff containing `cast_vote` and the two new `resolve_voting_link` columns
- [x] 1.3 Type checking and linting pass
- [x] 1.4 Build passes

#### Manual

- [x] 1.5 `update voting_links` raises `EM008` on frozen columns and succeeds otherwise
- [x] 1.6 `delete from resolutions` raises `EM009` when open, succeeds when draft
- [x] 1.7 `update votes` and `delete from votes` both raise `EM010`
- [x] 1.8 `cast_vote` returns zero rows for unknown, truncated and draft-resolution tokens, indistinguishably
- [x] 1.9 `cast_vote` twice returns the same stored choice and leaves one row
- [x] 1.10 PostgREST: `anon` select `[]` / insert `42501`; `authenticated` select rows / insert `42501`
- [x] 1.11 `resolve_voting_link` unchanged for unknown tokens, returns the reader's own vote once cast

### Phase 2: The voting path — page and endpoint

#### Automated

- [ ] 2.1 `npx astro sync && npm run lint && npm run build` clean
- [ ] 2.2 `grep -c '"/api/vote"' src/middleware.ts` → `0`
- [ ] 2.3 No `console.` and no token interpolation in the new files

#### Manual

- [ ] 2.4 Full local path: buttons → confirm → receipt with the right choice, date and weight
- [ ] 2.5 Receipt persists across a reload and a fresh browser profile
- [ ] 2.6 Second owner votes the other way; both weights match the registry
- [ ] 2.7 Every neutral case renders identically with `200`, for every `?wybor` value
- [ ] 2.8 All three headers present and identical between resolving and non-resolving tokens
- [ ] 2.9 `curl` without `Origin` → `403`; with `Origin` and an unknown token → neutral page, no error parameter
- [ ] 2.10 Forged `choice` refused without revealing whether the token exists
- [ ] 2.11 The whole path works with JavaScript disabled

### Phase 3: The administrator's vote count

#### Automated

- [ ] 3.1 `npx astro sync && npm run lint && npm run build` clean
- [ ] 3.2 The `voting_links` projection still names columns and still excludes `token`

#### Manual

- [ ] 3.3 With two of three linked owners voted, the page reads `Zagłosowało 2 z 3 właścicieli`
- [ ] 3.4 The draft branch is unchanged and no token appears anywhere
- [ ] 3.5 The count does not appear before the vote is opened

### Phase 4: Production — migrations, deploy, one real vote

#### Automated

- [ ] 4.1 CI green on the pull request
- [ ] 4.2 `deploy.yml` green after merge, including the `/api/health` assertion

#### Manual

- [ ] 4.3 Migrations applied to production before the merge, read back from the schema
- [ ] 4.4 One real vote cast through the live Worker, end to end, in a browser
- [ ] 4.5 The receipt renders on production and survives a reload
- [ ] 4.6 Production response headers carry all three values
- [ ] 4.7 The serving version confirmed against the Workers Builds race
- [ ] 4.8 CLAUDE.md "Current state" and `change.md` updated
