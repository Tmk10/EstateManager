# Resolution with Voting Links Implementation Plan

## Amendment — 2026-08-02, after the Phase 3/4 implementation review

**The administrator never sees a voting link.** Triage of finding F10 in
`reviews/impl-review-phase-3-4.md` replaced the design below: a token is a bearer credential,
so rendering all of a building's tokens into an administrator's browser made that browser a
second copy of every voter's identity. The links are now created and **stored**, and nothing
reads them back out until `S-04` sends them by e-mail. This slice's deliverable is the links
existing in the database, not an administrator holding them.

What this supersedes, section by section — the original text is left in place as the record of
what was planned and why:

- **Overview** and **User Journey step 3**: "readable on screen and passable by hand" and the
  owner → link table with "the full URL and a copy button" no longer describe the build. The
  table remains, with a **Status linku** column reading _Wystawiony_ in place of the URL.
- **Section 6, Copy button** (`src/components/resolutions/CopyLinkButton.tsx`): **removed**.
  The file is deleted; the slice now ships no `.tsx` and no client island at all, which also
  disposes of review finding F9.
- **Success criterion** "the copy button copies the same URL that is displayed as text":
  **withdrawn**, replaced by _no voting token appears in any HTML response_.
- **Phase 3 check 3.8** is superseded for the same reason and re-marked below.
- **New migration**, not in the original plan:
  `supabase/migrations/20260802214500_restrict_voting_link_token_select.sql` revokes
  column-level `select (token)` on `public.voting_links` from `authenticated` **and** `anon`,
  so the rule survives a future `.select()` string that asks for it.

Consequence accepted with the change: `S-02` ships with **no delivery path**. Until `S-04`
builds the fanout, a link reaches nobody except by reading the database directly. This
contradicts the reason `roadmap.md` gave for splitting `S-02` from `S-04` — that `S-03` could
be validated on one manually passed link — and that entry has been corrected. `S-02` is an
intermediate step toward `S-03` and `S-04` (decision, 2026-08-02); the links existing in the
database is what it owes them.

## Overview

Roadmap slice `S-02`. An administrator writes a resolution (uchwała) for a building whose
registry is imported, reviews it as a draft, opens the vote, and from that moment holds one
individual voting link **per owner** — readable on screen and passable by hand. Opening the
link without a session shows the resolution and the reader's own weight, and nothing else.

Two things make this slice different from `S-01` and `S-01b`, and both are the reason it is
worth planning carefully rather than typing:

1. **It creates the product's only identity mechanism.** PRD `## Open Questions` no. 1 is
   still open — whether an electronically adopted resolution is legally valid, and what
   identification it requires. Until it closes, possession of the link _is_ the voter's
   identity. The strength of the guardrail "nikt spoza rejestru nie oddaje głosu" is decided
   here, not in `S-03`.
2. **It opens the first unauthenticated read path in the schema.** Every table today denies
   `anon` on all four operations, deliberately and explicitly. An owner votes with no
   session, so that denial has to be pierced — once, narrowly, and in a way a reviewer can
   check by reading one function signature.

## Current State Analysis

What exists (verified in the tree, not assumed):

- `public.buildings`, `public.owners`, `public.units` with 8 RLS policies each —
  `authenticated` unconditional, `anon` denied on every operation
  (`supabase/migrations/20260802072737_create_units_and_owners.sql:139-264`).
- `public.owners` is **one row per person, not per unit**. The migration says so in its own
  table comment: _"An owner holding two units gets one row, so S-04 sends them one message
  rather than two"_ (`:48-51`). Identity is the e-mail address where there is one, enforced
  by the partial unique index `owners_building_id_email_key` (`:56-58`).
- `units.share_bps` is integer hundredths of a percent, totalling exactly 10000 per
  building, asserted at commit by two deferred constraint triggers (`:284-395`).
- `owners.email` is nullable on purpose, with the consequence already written down:
  _"What they lose is the S-02 voting link, not their weight in the tally"_ (`:31-34`).
- The composite foreign key `units_owner_same_building_fkey` (`:98-102`) is the pattern for
  expressing the PRD guardrail "dane właścicieli nie wychodzą poza budynek" as schema rather
  than as a rule someone has to remember.
- `security definer` precedent exists and is bounded: `assert_building_registry` and
  `building_units_area_total` are `definer` with `set search_path = ''` and `execute` revoked
  from `public`/`anon`; the **write** path `import_building_units` is deliberately `invoker`
  (`CLAUDE.md`, Current state).
- Form endpoints take form data and answer with `context.redirect()` carrying
  `?error=<message>` (`src/pages/api/buildings/index.ts:14-16`), and map SQLSTATE to Polish
  at the endpoint (`src/pages/api/buildings/[id]/units.ts:18-24`).
- `src/middleware.ts:10` — `PROTECTED_ROUTES` is the only auth gate, matched with
  `startsWith`. `/buildings` and `/api/buildings` are both covered.
- `src/lib/shares.ts` exports `TOTAL_BPS`, `formatShareBps`, `formatSquareMetres`; it is
  dependency-free so it can be executed with `node --experimental-strip-types`.

What is missing: resolutions, voting links, any status/lifecycle concept, and any route that
serves a caller without a session.

One correction the slice has to carry: **PRD and roadmap describe a link per unit, and the
product decision taken during planning is a link per owner** (2026-08-02). An owner holding
several units votes once, with their shares summed. The schema already anticipates this; the
foundation documents do not. Phase 1 fixes them before any code cites them.

## Desired End State

An administrator signed in to the live Worker can:

1. Open a building with an imported registry and create a resolution — number, title, body —
   which lands as a **draft**: visible only to them, editable, with no links in existence.
2. Correct the draft, then press _Uruchom głosowanie_. The resolution flips to **open** and
   every owner in that building **who has an e-mail address** now has exactly one voting
   link.
3. See a table of owner → link: name, address, that owner's units, their summed share, the
   full URL and a copy button. Pressing _Uruchom głosowanie_ a second time changes nothing
   and creates no duplicates.
4. Paste a link into a private window and see the resolution and the reader's own weight,
   with no session — and see the identical "not found" answer for a made-up token, a
   truncated one, or a token whose resolution is still a draft. A valid token resolves to its
   own resolution and to that owner's data only; there is no URL manipulation — a different
   building id, an extra query parameter — that widens what one token returns.

Verified the way `S-01` verified RLS: through PostgREST as `anon`, not by reading
`pg_policy`, and on production, not only on the local stack.

### Key Discoveries:

- **Per-owner voting costs the schema nothing** because `public.owners` is already one row
  per person (`20260802072737_create_units_and_owners.sql:48-51`). The token attaches to an
  owner; the registry is untouched.
- **The threshold denominator is unaffected by skipping owners without an e-mail.** `S-05`
  measures against _all_ shares in the building, so an owner who receives no link simply
  never votes — which is the PRD's own reading of silence, not a falsified denominator.
- **`text` + check constraint beats an enum for `status`.** `S-05` will add `passed` and
  `rejected`; widening a check constraint is ordinary DDL inside the migration transaction,
  while `alter type ... add value` carries restrictions that make it awkward in a
  single-transaction migration file.
- **`resolve_voting_link` returning zero rows is the whole error model.** Unknown token,
  draft resolution, and deleted building all produce the same empty result, so the page
  cannot leak the difference between "no such token" and "token exists but you are early".
- **`Astro.url.origin`, never a hardcoded hostname.** The links are built in the page and
  must work on `localhost:4321`, on the `*.workers.dev` host, and on whatever domain comes
  later.
- **`/vote` must stay out of `PROTECTED_ROUTES`.** Every other route added so far has gone
  in; this is the first one that must not, so it needs a comment saying it is deliberate.

## What We're NOT Doing

- **Casting a vote.** No "za"/"przeciw" buttons, no `votes` storage, no write path from the
  unauthenticated side. That is `S-03`, and `/vote/<token>` is built so it grows two buttons
  rather than being rewritten.
- **Sending anything by e-mail.** `S-04`. The mail channel exists (`F-02`) and is deliberately
  not called here.
- **Counting anything.** No tally, no threshold, no "brakuje X% do progu". `S-05`.
- **Closing a resolution.** No `passed`/`rejected` status values, no expiry — a link stays
  valid and the resolution's status answers whether voting is still open.
- **Editing or deleting a resolution after it opens.** The database refuses; there is no UI
  either way. Deleting a _draft_ is also out of scope — an unwanted draft is left alone.
- **Scoping `authenticated` policies to a building.** Explicitly declined; see Phase 2.
- **Exporting links to a file.** The screen is the only place they exist.
- **Registry editing of any kind.** Unchanged from `S-01b`: static in v1.

## Implementation Approach

Five phases, ordered so that each one is verifiable before the next depends on it:

1. **Foundation documents first.** The per-owner rule is a domain decision, and domain
   decisions live in the PRD. Doing this first means the migration's comments cite a document
   that already agrees with them, and `S-03`/`S-05`/`S-06` read one consistent rule.
2. **Schema and the access contract**, including the `security definer` resolver, in one
   migration. The unauthenticated contract is proven through PostgREST in this phase, before
   any page exists to hide a mistake behind.
3. **The administrator's path**, built on existing form/redirect patterns.
4. **The unauthenticated page**, which is thin because Phase 2 did the hard part.
5. **Production and the record.**

The one decision that shapes Phase 3: **opening a vote is two application queries, not one
RPC** (decided during planning, against the recommendation). The failure mode that choice
carries — an open resolution with an incomplete set of links, silently disenfranchising
owners — is removed by ordering rather than by transaction: insert the links first, flip the
status last. A crash in between leaves tokens attached to a still-draft resolution, which is
invisible to everyone and repaired by pressing the button again. `unique (resolution_id,
owner_id)` makes the repeat safe.

## Critical Implementation Details

**State sequencing.** Links are inserted _before_ the status flips. This is the only ordering
that makes a partial failure harmless, and it is the reason `resolve_voting_link` filters on
`status <> 'draft'` — a token for a draft resolution exists legitimately and must resolve to
nothing.

**Token handling.** 32 bytes from `crypto.getRandomValues`, base64url-encoded without
padding, giving 43 URL-safe characters. It is a bearer secret in a URL path: the page it
lands on must contain no outbound links (a `Referer` header would carry the token to a third
party), and the token must never be written to a log line or an error message.

**Timing & lifecycle.** The freeze trigger fires on `update` of `public.resolutions`, so it
also guards paths that do not exist yet. It must permit `draft → open` while refusing any
change to `number`/`title`/`body` once `status <> 'draft'`, and refusing `open → draft`.
Without it, "głos jest ostateczny" would rest on the UI not offering an edit button.

---

## Phase 1: PRD and roadmap say "per owner"

### Overview

Correct the foundation documents so that the rule implemented by the next four phases is
written where `S-03`, `S-05` and `S-06` will read it. No code in this phase.

### Changes Required:

#### 1. PRD domain rules

**File**: `context/foundation/prd.md`

**Intent**: Replace the per-unit voting rule with the per-owner rule, dated and justified,
in the same register as the existing entries — the document records _why_ a decision changed,
not only what it now says.

**Contract**: In `## Functional Requirements` → "Ustalenia domenowe wiążące powyższe
wymagania", the bullet **"Jeden lokal = jeden głosujący"** becomes a per-owner statement:
one owner is one voter, an owner holding several units votes once, and their units' shares
are summed into a single weight. Współwłasność of a single unit remains out of v1 — that
non-goal is unrelated and stays. Add the date (2026-08-02) and the reason: the registry
already stores one row per person keyed by e-mail, so a per-unit link would send the same
person several messages and let them vote several times.

#### 2. PRD user story and acceptance criteria

**File**: `context/foundation/prd.md`

**Intent**: `US-01` currently promises a link that "nie pozwala oddać głosu w imieniu innego
lokalu". Restate the guarantee at the owner level so the acceptance criterion matches what
`S-03` will be tested against.

**Contract**: In `### US-01`, the Given clause speaks of an owner in the registry rather than
an owner "przypisany do lokalu"; the acceptance criterion about the individual link says the
link does not allow voting on behalf of another **owner**. The criterion "Głos jest ważony
udziałem lokalu" becomes the sum of the owner's units' shares. `FR-005` and `FR-006` keep
their numbers and their Socratic annotations untouched — only the wording of the rule moves.

#### 3. PRD non-goals

**File**: `context/foundation/prd.md`

**Intent**: Record what the per-owner rule does _not_ buy, so it is not mistaken for
co-ownership support.

**Contract**: Under `## Non-Goals`, the existing bullet "Bez modelowania współwłasności
lokalu" gains a sentence distinguishing the two cases: one person holding several units is
supported (one vote, summed weight); several people holding one unit is not.

#### 4. Roadmap slice S-02

**File**: `context/foundation/roadmap.md`

**Intent**: The `S-02` outcome promises a link per unit. Restate it per owner and record the
resolved unknown about link permanence.

**Contract**: In `### S-02`, the **Outcome** line reads per owner. The **Unknowns** entry
about link permanence is marked resolved (2026-08-02): the link is permanent, and whether a
vote may still be cast is answered by the resolution's status, because `FR-007` gives voting
no end date. The dependency table row for `S-02` and the `Status:` line are updated in
Phase 5, not here.

Two further per-unit statements live outside `### S-02` and must move with it, or the next
slice is planned from a line this change just contradicted:

- the `## At a glance` slices table row for `S-02` ("dysponuje indywidualnym linkiem dla
  **każdego lokalu**") — restate per owner, matching the corrected Outcome
- the `### S-03` **Outcome** line ("udział **jego lokalu** jest doliczony do wyniku") —
  becomes the sum of that owner's units' shares. Only the weighting phrase changes; `S-03`'s
  scope, refs, unknowns and risk paragraph stay as they are, because `S-03` is not being
  planned here.

Nothing else in `roadmap.md` is touched in this phase.

### Success Criteria:

#### Automated Verification:

- Prettier is satisfied: `npx prettier --check context/foundation/prd.md context/foundation/roadmap.md`
- The superseded phrasing survives in exactly one place, the non-goal §3 deliberately keeps:
  `grep -c "Jeden lokal = jeden głosujący" context/foundation/prd.md` returns `1`, and
  `grep -n` shows it is the `## Non-Goals` bullet, not the domain rule. `shape-notes.md` is a
  dated historical record and is not searched: it keeps the phrase, correctly, and Phase 1
  does not touch it.

#### Manual Verification:

- Reading `## Functional Requirements` end to end, the per-owner rule is unambiguous about
  the summed weight and does not contradict `FR-006`
- The distinction between "one person, several units" (supported) and "several people, one
  unit" (not supported) is legible to someone who has not read this plan
- No slice in `roadmap.md` still describes the link or the vote weight per unit — `S-02`'s
  table row and Outcome and `S-03`'s Outcome all read per owner

---

## Phase 2: Schema and the unauthenticated access contract

### Overview

One migration adds both tables, their RLS policies, the content-freeze trigger and the single
function through which a caller with no session may read. Types are regenerated in the same
commit.

### Changes Required:

#### 1. The migration

**File**: `supabase/migrations/<timestamp>_create_resolutions_and_voting_links.sql`

The timestamp must sort after `20260802101500`. Forward-only and wrapped in one transaction,
like every migration before it; the header comment states purpose, affected objects, and why
the `definer` function exists.

**Intent**: Create the two tables the slice needs, express the cross-building guardrail as
schema rather than as a rule, freeze a resolution's content once voting opens, and open
exactly one narrow door for the unauthenticated reader.

**Contract**:

`public.resolutions`

- `id uuid primary key default gen_random_uuid()`
- `building_id uuid not null references public.buildings (id) on delete cascade`
- `number text not null`, `title text not null`, `body text not null` — each with a
  trimmed-non-empty check, matching `owners_full_name_not_blank`
- `status text not null default 'draft'` with `check (status in ('draft', 'open'))`.
  Text plus check rather than an enum: `S-05` widens this list, and widening a check
  constraint is ordinary DDL inside a transaction.
- `opened_at timestamptz`, with a check binding it to the status: null exactly when
  `status = 'draft'`
- `created_at timestamptz not null default now()`
- `unique (id, building_id)` — not redundant with the primary key; it is the target of the
  composite foreign key below, mirroring `owners_id_building_id_key`
- Unique index `resolutions_building_id_number_lower_key on (building_id, lower(number))` —
  case-insensitive, following the precedent set by
  `20260802063954_buildings_case_insensitive_unique.sql`. Violation is SQLSTATE `23505`, which
  the endpoint maps to Polish.

`public.voting_links`

- `id uuid primary key default gen_random_uuid()`
- `resolution_id uuid not null`, `owner_id uuid not null`, `building_id uuid not null`
- `token text not null` with a format check `^[A-Za-z0-9_-]{43}$` (32 random bytes,
  base64url, unpadded) — a cheap backstop against a truncated or non-random value arriving
  from a future code path
- `created_at timestamptz not null default now()`
- Unique index `voting_links_token_key on (token)` — this is also the lookup index for
  `resolve_voting_link`, so it is load-bearing twice
- `unique (resolution_id, owner_id)` — one link per owner per resolution, and what makes
  re-running the open action idempotent
- Two composite foreign keys instead of two simple ones:
  `(resolution_id, building_id) → resolutions (id, building_id)` and
  `(owner_id, building_id) → owners (id, building_id)`, both `on delete cascade` from the
  resolution side and `on delete restrict` from the owner side. The denormalised
  `building_id` exists only to carry them, and it buys the same thing
  `units_owner_same_building_fkey` bought: a link pairing an owner with another building's
  resolution is **unrepresentable**, not merely discouraged.
- Index on `owner_id` for `S-04`'s per-owner send state

RLS: `enable row level security` on both tables and **sixteen policies**, eight per table,
one per operation per role — `authenticated` unconditional (`true`), `anon` denied
(`false`), `update` carrying both `using` and `with check`. Copied verbatim in shape from
`public.units`, including writing `anon` out explicitly rather than relying on implicit
deny.

**The prediction at `20260802072737_create_units_and_owners.sql:146-154` is deliberately not
fulfilled, and the migration must say so in a comment.** That comment predicted `S-02` would
scope the `authenticated` policies to a building "when the per-unit token finally gives the
unauthenticated path a subject to scope TO". It turns out the token identifies an **owner**,
not a logged-in user, and it is consumed by a `definer` function that bypasses policies
entirely — so it gives the _authenticated_ side no subject at all. PRD `## Access Control`
still states that v1 has no roles model and every user in the database is an administrator,
and there is still no table binding a user to a building. A predicate that resolves to `true`
for every caller would read as a restriction while restricting nothing. Scoping waits for the
v2 roles model. Say this in the migration, or the next reader will believe the old comment.

Content freeze — trigger function `public.assert_resolution_frozen()`, `security invoker`,
`set search_path = ''`, fired `before update on public.resolutions for each row`:

- raise `EM006` when `old.status <> 'draft'` and any of `number`, `title`, `body`,
  `building_id` differs from `old`
- raise `EM007` when the status transition is anything other than `draft → open` or a
  no-op (in particular `open → draft`)
- English message, Polish mapping at the endpoint — same split as `EM001`–`EM005`

The resolver — `public.resolve_voting_link(p_token text)`:

- `returns table (resolution_number text, resolution_title text, resolution_body text,
resolution_status text, owner_full_name text, owner_share_bps integer,
owner_unit_numbers text[], building_name text)`
- `language sql`, `stable`, `security definer`, `set search_path = ''`
- Joins `voting_links → resolutions → owners → buildings`, aggregates that owner's
  `units.share_bps` into `owner_share_bps` and their `unit_number`s into
  `owner_unit_numbers`, filtered by `vl.token = p_token and r.status <> 'draft'`
- `revoke execute ... from public;` then `grant execute ... to anon, authenticated;`
- A `comment on function` stating that **this return list is the entire visibility contract
  for a caller with no session** — no e-mail address, no other owner, no per-unit area, no
  vote — and that adding a column to it widens what the internet can read

`definer` here does not contradict the project's no-definer rule, and the comment should say
why: the rule protects the **write** path (`import_building_units` stays `invoker`), while
this function writes nothing, takes one opaque token, returns a fixed narrow row, and is the
only alternative to giving `anon` a `select` policy on `voting_links` — which, since a policy
cannot know the token, would mean `using (true)` and a listable table of every secret in the
building.

#### 2. Generated types

**File**: `src/db/database.types.ts`

**Intent**: Regenerate so the new tables and the RPC are typed.

**Contract**: `npm run db:types` against the local stack, committed **in the same commit as
the migration**. Note the known limit before relying on it: a wrong column inside a
`.select("…")` string is not a compile error in this version of `supabase-js`, so the
projection strings in Phases 3 and 4 need reading, not just compiling.

### Success Criteria:

#### Automated Verification:

- Migration applies to a clean local stack: `npx supabase db reset`
- Type generation is clean and the diff contains both new tables:
  `npm run db:types && git diff --stat src/db/database.types.ts`
- Type-aware lint and build pass: `npx astro sync && npm run lint && npm run build`

#### Manual Verification:

Only the checks that run against a freshly reset stack live here. Everything needing an
**existing** resolution or voting link is verified in Phase 3 instead — see the note below.

- Through PostgREST as `anon`: `select` on `resolutions` and on `voting_links` returns `[]`;
  `insert` on either returns `42501`
- A second resolution with the same `number` in the same building fails with `23505`; the
  same number in a different building succeeds

**Where the rest of the security surface is verified, and why not here.** Four checks — the
resolver's happy path, its two indistinguishable failure modes, the `EM006` / `EM007` freeze,
and the composite foreign key refusing a cross-building link — all need a resolution in a
particular state and a link whose token satisfies `^[A-Za-z0-9_-]{43}$`. Nothing creates
either until Phase 3. Rather than hand-write throwaway fixture SQL that exercises a path no
product code takes, they are listed in **Phase 3's** Manual Verification, run against rows the
real screens created. The cost is accepted knowingly: between the migration landing and Phase
3's screens working, the unauthenticated contract is written but unproven, so Phase 3 is not
complete until those four pass. Do not treat Phase 2 as done-and-safe on the two checks above
alone.

---

## Phase 3: The administrator's path — draft, launch, links

### Overview

Three screens' worth of behaviour on the existing form → endpoint → redirect pattern: create
a draft, correct it, open the vote, and read the links.

### Changes Required:

#### 1. Token generation

**File**: `src/lib/voting-token.ts`

**Intent**: One dependency-free function producing the bearer secret, kept separate so it can
be executed directly with `node --experimental-strip-types` — the only way arithmetic and
encoding get exercised in this repo.

**Contract**: `createVotingToken(): string` — 32 bytes from `crypto.getRandomValues`,
base64url-encoded without padding, 43 characters, matching the database's format check. No
imports outside the Web Crypto global. Never accept a length or an alphabet parameter: a
caller-tunable secret length is how a 4-byte token eventually ships.

#### 2. Create a draft

**Files**: `src/pages/buildings/[id]/resolutions/new.astro`,
`src/pages/api/buildings/[id]/resolutions/index.ts`

**Intent**: A form with three fields — numer uchwały, tytuł, treść — that writes a draft and
returns to the resolution's page.

**Contract**: The endpoint follows `src/pages/api/buildings/index.ts` exactly: form data,
per-field trim and required/length validation with Polish messages naming the field,
`context.redirect()` back to the form with `?error=`, never a JSON body. Insert
`{ building_id, number, title, body }` and let `status` default to `draft`. Map `23505` to
"Uchwała o tym numerze już istnieje w tym budynku."; keep every other SQLSTATE's own message
rather than flattening it. On success redirect to `/buildings/<id>/resolutions/<new id>`.
The page refuses to render the form when the building has no registry, and says why — a
resolution with no owners to link has nothing to open.

#### 3. Resolution page — draft and open states

**File**: `src/pages/buildings/[id]/resolutions/[resolutionId].astro`

**Intent**: One page with two faces. A draft shows the editable content and the launch
button; an open resolution shows the frozen content and the owner → link table.

**Contract**: Loads the resolution scoped by both `id` and `building_id`, so a resolution id
from another building is "not found" rather than a cross-building read. Reuses the existing
not-found handling, including mapping `22P02` (invalid uuid in the URL) to "Nie znaleziono
uchwały." rather than to a database message.

Draft state: the three fields in a form posting to the edit endpoint, plus a _Uruchom
głosowanie_ form posting to the open endpoint, with a sentence saying what launching does and
that the content can no longer be changed afterwards.

Open state: the content read-only, `opened_at` shown, and a table with one row **per owner**
— name, e-mail, that owner's unit numbers joined into one cell, their summed share via
`formatShareBps`, the absolute link built from `Astro.url.origin`, and a copy button. Owners
of the building **without** an e-mail address are listed below the table in a short block
saying they have no link and must be handled outside the application — silence here would
make a missing row look like a bug. Sort owners by name with
`localeCompare(…, "pl", { numeric: true })`, matching the registry table's treatment of unit
numbers.

#### 4. Edit a draft

**File**: `src/pages/api/buildings/[id]/resolutions/[resolutionId]/index.ts`

**Intent**: Update number, title and body while the resolution is a draft.

**Contract**: Same validation as create. The `update` is scoped by `id`, `building_id` **and**
`status = 'draft'`, so an open resolution updates zero rows and never reaches the trigger;
`EM006`/`EM007` are still mapped, because a backstop that is not mapped reads as a crash. Zero
rows affected redirects back with "Uchwała jest już w głosowaniu i jej treści nie można
zmienić."

#### 5. Open the vote

**File**: `src/pages/api/buildings/[id]/resolutions/[resolutionId]/open.ts`

**Intent**: Create the missing links, then flip the status — in that order.

**Contract**: Two application queries by design, sequenced so a partial failure is harmless.

1. Load the resolution scoped by `id` + `building_id`. Not found → redirect with the
   standard message.
2. Load the building's owners with a non-null e-mail. Zero of them → redirect with "Żaden
   właściciel w tym budynku nie ma adresu e-mail — nie ma komu wystawić linku." and do
   **not** flip the status.
3. Insert one row per owner with a freshly generated token, **conflict-tolerant at the
   statement level**: `on conflict (resolution_id, owner_id) do nothing`, which in
   supabase-js is `upsert` with `ignoreDuplicates: true`. This is load-bearing, not
   tidiness. A plain multi-row insert aborts **entirely** on the first unique violation, so
   a double-clicked button would leave the losing request having written nothing while still
   proceeding to flip the status — an open resolution with a partial link set, which is the
   exact failure this ordering exists to prevent. Catching `23505` afterwards does not help:
   by then the whole statement has rolled back.
4. Re-read the link count for this resolution and compare it with the owner count from step 2. They disagree → redirect with "Nie udało się wystawić linków dla wszystkich
   właścicieli. Spróbuj ponownie." and leave the status alone. This turns "open implies a
   complete set of links" from an argument in this plan into something the code checks.
5. `update` the resolution to `status = 'open'`, `opened_at = now()`, scoped by
   `status = 'draft'` so a second press is a no-op rather than a re-opening.
6. Redirect to the resolution page.

The token must never appear in an error message or a log line. Two concurrent presses are
still two writers: the re-read in step 4 narrows that window rather than closing it, and only
a transaction would close it — which is the RPC this slice deliberately does not use.

#### 6. Copy button

**File**: `src/components/resolutions/CopyLinkButton.tsx`

**Intent**: Copy one link to the clipboard — the only interactive element in the slice, so
the only `.tsx`.

**Contract**: Props `{ url: string }`. Uses `navigator.clipboard.writeText` with a visible
confirmation state that reverts. Merges classes with `cn()` from `@/lib/utils`. Renders the
URL as text next to the button so the link is usable when the clipboard API is unavailable —
this is the manual-handover path, and it must not depend on a browser API.

#### 7. Building page entry point

**File**: `src/pages/buildings/[id]/index.astro`

**Intent**: Reach the new screens, and see the building's resolutions.

**Contract**: Below the registry table, a "Uchwały" section listing this building's
resolutions — number, title, status, `opened_at` — each linking to its page, with an empty
state and a _Nowa uchwała_ button. The button and the section appear only when the registry
is imported, matching the existing empty-state block that offers the CSV import instead.

### Success Criteria:

#### Automated Verification:

- Type-aware lint and build pass: `npx astro sync && npm run lint && npm run build`
- Token generator produces 43 URL-safe characters and no two equal values across a large
  sample: `node --experimental-strip-types` against `src/lib/voting-token.ts`

#### Manual Verification:

- Creating a resolution with a duplicate number in the same building shows the Polish
  duplicate message and no row is written; the same number in another building is accepted
- A draft can be corrected and the change is visible after reload
- _Uruchom głosowanie_ produces exactly one link per owner with an e-mail address; owners
  without one are listed separately as having no link
- Pressing _Uruchom głosowanie_ a second time changes nothing: same tokens, same count,
  no error
- After opening, the content is no longer editable anywhere in the UI, and `opened_at` shows
- The copy button copies the same URL that is displayed as text
- An owner holding two units appears **once**, with both unit numbers and their summed share

Carried over from Phase 2 (see its Manual Verification note) — the schema-level security
surface, now runnable because real resolutions and links exist. These are PostgREST probes,
not UI steps, and Phase 3 is not complete without them:

- Through PostgREST as `anon`: `rpc/resolve_voting_link` with a token copied from an **open**
  resolution returns exactly one row, containing no e-mail address and no other owner's data
- The same call with (a) a made-up token, (b) a token whose resolution is still a draft
  returns `[]` in both cases — indistinguishable from each other
- Updating `title` on an open resolution raises `EM006`; setting an open resolution back to
  `draft` raises `EM007`; updating the title of a draft succeeds
- Inserting a `voting_links` row pairing an owner with a resolution from another building
  fails on the composite foreign key

---

## Phase 4: `/vote/<token>` — the path with no session

### Overview

One public page that resolves a token through the Phase 2 function and shows the resolution.
No vote is cast; `S-03` adds two buttons to this page rather than replacing it.

### Changes Required:

#### 1. The public route

**File**: `src/pages/vote/[token].astro`

**Intent**: Turn a token into the reader's own view of the resolution, and everything else
into one indistinguishable answer.

**Contract**: Calls `supabase.rpc("resolve_voting_link", { p_token: token })` with the
ordinary anon client — no session is expected and none is required. Zero rows, an unparseable
token, an RPC error and an unconfigured client all render the **same** neutral page: the
resolution cannot be found, contact the administrator. No status code branching that
distinguishes them, no token echoed back into the markup, no outbound links anywhere on the
page (a `Referer` header would carry the token off-site).

On success it shows: building name, resolution number and title, the body preserving its line
breaks, the reader's own name, their unit numbers and their summed share via
`formatShareBps`, and a sentence stating that voting is not yet available and will open from
this same link. Nothing else — the return list of the function is the ceiling, and the page
must not join to anything to widen it.

#### 2. Keep the route public, on purpose

**File**: `src/middleware.ts`

**Intent**: `PROTECTED_ROUTES` is the only auth gate and every route so far has been added to
it. This is the first that must not be.

**Contract**: No change to the array; add a comment naming `/vote` as deliberately public,
because an owner has no account in v1 and adding it there would make every voting link
redirect to the sign-in screen. Without the comment, the next person to read this file will
"fix" the omission.

### Success Criteria:

#### Automated Verification:

- Type-aware lint and build pass: `npx astro sync && npm run lint && npm run build`
- `/vote` is not a protected route: `grep -c '"/vote"' src/middleware.ts` returns `0` — the
  path appears in the file only as the unquoted `/vote` inside the explanatory comment, which
  `grep -n '/vote' src/middleware.ts` shows and which is the point of the check

#### Manual Verification:

- A valid token opened in a private window (no session) renders the resolution
- A made-up token, a truncated token, and a token whose resolution is still a draft all
  render the identical neutral page
- Page source contains no e-mail address, no other owner's name, no per-unit area, and no
  share other than the reader's own
- Signing out and revisiting the link still works — the page never depends on a session
- The page contains no outbound links

---

## Phase 5: Production and the record

### Overview

Apply the migration before the code that needs it, land the PR, prove the path on the live
Worker, and write down what happened.

### Changes Required:

#### 1. Apply the migration to production

**Intent**: Migrations are applied by hand and nothing in CI does it (open residual `G14`).

**Contract**: `npx supabase db push` from a linked checkout, **before** the merge that
deploys the code. Reversed, production serves a page querying a function that does not exist.
Forward-only: `wrangler rollback` reverts code, never schema.

#### 2. Pull request

**Intent**: Every change gets its own branch and PR; the merge is the production deploy.

**Contract**: Branch off up-to-date `main`, `gh pr create --base main`, `ci.yml` green before
merge, `gh pr merge --squash --delete-branch`. Commit, push/PR and merge are three separate
approvals, waited for rather than assumed.

#### 3. Live walkthrough

**Intent**: The unauthenticated path fails in exactly the place where `astro dev` and workerd
diverge, so it has to be exercised where it actually runs.

**Contract**: On the live Worker: create a resolution, open the vote, copy a link, open it in
a private window, then try a made-up token and a truncated one. Confirm a valid token returns
only its own owner's data, and that appending query parameters to the link does not widen it.
Record the outcome, including the `/api/health` check afterwards.

#### 4. The record

**Files**: `context/changes/resolution-with-voting-links/change.md`,
`context/foundation/roadmap.md`, `CLAUDE.md`

**Intent**: Update the three places that describe project state, and nowhere else.

**Contract**: `change.md` → `status: done` with the date. `roadmap.md` → `S-02` status `done`,
plus a **Zrealizowane** paragraph in the shape `S-01` and `S-01b` use, and the dependency
table row for `S-02`. `CLAUDE.md` → one entry under "Current state" covering the per-owner
rule, the two new tables, the `definer` resolver and its grant to `anon`, and the fact that
`/vote` is deliberately outside `PROTECTED_ROUTES`. `CLAUDE.md` is the only place these facts
live — do not duplicate them into `README.md`.

### Success Criteria:

#### Automated Verification:

- CI is green on the PR (`npm ci → astro sync → lint → build`)
- After merge, `deploy.yml` is green including its `/api/health` assertion

#### Manual Verification:

- The migration was applied to production with `db push` **before** the merge that deployed
  the code
- The full path works on the live Worker, including the private-window read of a link
- A made-up token on production renders the neutral page rather than an error page
- `roadmap.md`, `change.md` and `CLAUDE.md` agree with each other and with the code

---

## Testing Strategy

There is no test runner in this project — no `npm test`, no framework, no test files. The
gates are `npx astro sync && npm run lint && npm run build`, direct execution of dependency-free
modules with `node --experimental-strip-types`, PostgREST probes for anything security-shaped,
and manual steps. Never report that tests passed.

### Executable modules:

- `src/lib/voting-token.ts` — length, alphabet, and absence of collisions across a large
  sample

### PostgREST probes (the security surface):

Only the first runs in Phase 2. The rest need a resolution and a link that exist, so they run
in **Phase 3** against rows the real screens created — Phase 2's Manual Verification says why.

- `anon` reads and writes on `resolutions` and `voting_links` → `[]` and `42501`
- `rpc/resolve_voting_link` as `anon`: valid open token → exactly one row; unknown token →
  `[]`; draft token → `[]`
- The returned row contains no e-mail address and no data belonging to another owner
- `EM006` / `EM007` from the freeze trigger; `23505` from the per-building number index; the
  composite foreign key refusing a cross-building link

### Manual Testing Steps:

1. Sign in, open a building with an imported registry, create a resolution with a number,
   title and body.
2. Create a second resolution with the same number → Polish duplicate message.
3. Correct the draft's title; reload and confirm it stuck.
4. Press _Uruchom głosowanie_. Confirm one row per owner with an e-mail, correct summed
   shares, and a separate list of owners without an address.
5. Press it again. Confirm nothing changed and no error appeared.
6. Copy a link, open it in a private window, confirm the resolution renders with the reader's
   own weight and nothing else.
7. Alter one character of the token → the same neutral page.
8. Take a valid token from a different building's resolution → it renders **that** resolution
   and only that owner's data. Appending a building id or any other query parameter to a link
   changes nothing about what it returns. (A token is globally unique and carries its own
   scope — this step checks that scope, not a cross-building rejection the design does not
   have.)
9. Confirm the open resolution offers no edit path anywhere in the UI.
10. Repeat 4, 6 and 7 against the live Worker after deploy.

## Performance Considerations

Nothing here is hot. A 70-unit building yields at most 70 owners and 70 link rows per
resolution; the open action is two statements plus one multi-row insert. `resolve_voting_link`
is a single indexed lookup on `voting_links_token_key` followed by three joins and one
aggregate over that owner's units — the only query in the product reachable without
authentication, and the one that should stay cheap as buildings grow. The links table on the
administrator's screen renders every row at once; at PoC size that is right, and it is the
first place `infrastructure.md` §G1 ("cost grows with data, not traffic") will show up if a
building ever holds hundreds of owners.

## Migration Notes

Forward-only, one transaction, applied by hand with `npx supabase db push` before the code
that depends on it. `src/db/database.types.ts` is regenerated and committed in the same
commit as the migration. No existing rows are touched: both tables are new and the only
change to an existing object is none — `buildings`, `owners` and `units` are read, never
altered. Rollback of the schema is not available; a bad migration is corrected by a further
forward migration.

## References

- Roadmap slice: `context/foundation/roadmap.md` → `### S-02`
- Product rules: `context/foundation/prd.md` → `## Functional Requirements`, `## Access Control`
- Prior slice, same shape: `context/changes/building-units-import/plan.md`
- RLS pattern and guardrail-as-schema: `supabase/migrations/20260802072737_create_units_and_owners.sql:98-102,139-264`
- `definer` precedent and its bounds: `supabase/migrations/20260802101500_registry_assertion_security_definer.sql`
- Form endpoint pattern: `src/pages/api/buildings/index.ts:14-56`
- SQLSTATE → Polish mapping: `src/pages/api/buildings/[id]/units.ts:18-24`
- Auth gate: `src/middleware.ts:10`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: PRD and roadmap say "per owner"

#### Automated

- [x] 1.1 Prettier check passes on `prd.md` and `roadmap.md` — 8ae9ba0
- [x] 1.2 Superseded phrasing survives in `prd.md` exactly once, as the non-goal — 8ae9ba0

#### Manual

- [ ] 1.3 Per-owner rule is unambiguous about summed weight and consistent with FR-006
- [ ] 1.4 "One person, several units" vs "several people, one unit" distinction is legible
- [ ] 1.5 No slice in `roadmap.md` still describes the link or the weight per unit

### Phase 2: Schema and the unauthenticated access contract

#### Automated

- [x] 2.1 Migration applies to a clean local stack (`npx supabase db reset`) — 80cb479
- [x] 2.2 `npm run db:types` regenerates cleanly and includes both new tables — 80cb479
- [x] 2.3 `astro sync && lint && build` pass — 80cb479

#### Manual

- [x] 2.4 `anon` gets `[]` on select and `42501` on insert for both new tables — 80cb479
- [x] 2.5 Duplicate resolution number in one building fails `23505`; allowed across buildings — 80cb479

### Phase 3: The administrator's path — draft, launch, links

#### Automated

- [x] 3.1 `astro sync && lint && build` pass — 6ca7e3d
- [x] 3.2 `voting-token.ts` executed directly: 43 URL-safe chars, no collisions in a large sample — 6ca7e3d

#### Manual

- [x] 3.3 Duplicate number rejected with the Polish message; accepted in another building — 6ca7e3d
- [x] 3.4 Draft can be corrected and the change persists — 6ca7e3d
- [x] 3.5 Launch produces one link per owner with an e-mail; owners without one listed separately — 6ca7e3d
- [x] 3.6 Second launch press is a no-op with no error and no duplicate tokens — 6ca7e3d
- [x] 3.7 Content is uneditable after launch and `opened_at` is shown — 6ca7e3d
- [~] 3.8 ~~Copy button copies the URL displayed as text~~ — SUPERSEDED by the amendment at the
      top of this plan. The copy button is gone. Replaced by: **no voting token appears in any
      HTML response, and `select=token` on `voting_links` is refused by the database for both
      `authenticated` and `anon`** — verified through PostgREST, `42501 permission denied`,
      while `select=owner_id` returns `200` and `resolve_voting_link` still resolves for `anon`
- [x] 3.9 An owner with two units appears once, with both units and their summed share — 6ca7e3d
- [x] 3.10 `resolve_voting_link` as `anon` returns one narrow row for a valid open token — 6ca7e3d
- [x] 3.11 Unknown token and draft token both return `[]`, indistinguishably — 6ca7e3d
- [x] 3.12 `EM006` on content change after open; `EM007` on `open → draft` — 6ca7e3d
- [x] 3.13 Composite foreign key refuses a cross-building link — 6ca7e3d

### Phase 4: `/vote/<token>` — the path with no session

#### Automated

- [x] 4.1 `astro sync && lint && build` pass — 4ec1bbf
- [x] 4.2 `grep -c '"/vote"' src/middleware.ts` returns `0` — the path is only in the comment — 4ec1bbf

#### Manual

- [x] 4.3 Valid token renders in a private window with no session — 4ec1bbf
- [x] 4.4 Made-up, truncated and draft tokens all render the identical neutral page — 4ec1bbf
- [x] 4.5 Page source leaks no e-mail, no other owner, no foreign share — 4ec1bbf
- [x] 4.6 Page works while signed out — never depends on a session — 4ec1bbf
- [x] 4.7 Page contains no outbound links — 4ec1bbf

### Phase 5: Production and the record

#### Automated

- [ ] 5.1 CI green on the pull request
- [ ] 5.2 `deploy.yml` green after merge, including the `/api/health` assertion

#### Manual

- [ ] 5.3 Migration applied to production with `db push` **before** the merge
- [ ] 5.4 Full path walked on the live Worker, including the private-window read
- [ ] 5.5 Made-up token on production renders the neutral page
- [ ] 5.6 `change.md`, `roadmap.md` and `CLAUDE.md` updated and mutually consistent
