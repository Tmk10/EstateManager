# Voting Link Email Fanout Implementation Plan

## Overview

Roadmap slice `S-04`. An administrator who has opened a vote presses _Roześlij linki_ and
every owner in the building who has an e-mail address receives one message carrying the
resolution's full text and that owner's individual voting link. The request returns when the
last send has settled; the owner→link table then shows, per owner, whether their message went
out. Pressing the button again **resumes** — it sends only to owners not yet reached — because
Cloudflare offers no idempotency key and a second link to the same owner is the one failure
this slice must not have.

This is the change that turns a single verified click (`S-03`) into a measurable signal: the
PRD's success criterion — over 50% of all shares voting "za" through the electronic channel
alone — is unmeasurable until links reach owners without the administrator carrying them by
hand.

## Current State Analysis

**`S-02` is planned but not implemented, and this plan is written against its plan.** Verified
in the tree, not assumed: `supabase/migrations/` holds five migrations ending at
`20260802101500_registry_assertion_security_definer.sql`; there is no `resolutions` table, no
`voting_links` table, no `src/pages/vote/`, and no `src/lib/voting-token.ts`. The `## Progress`
section of `context/changes/resolution-with-voting-links/plan.md` is entirely unchecked and the
roadmap lists `S-02` as `proposed`. Every schema reference below therefore cites a **contract
that exists on paper only**. Phase 0 exists to convert that from an assumption into a check.

What does exist and is load-bearing here:

- **`public.owners` is one row per person, keyed by e-mail.** Its own table comment says why:
  _"An owner holding two units gets one row, so S-04 sends them one message rather than two"_
  (`supabase/migrations/20260802072737_create_units_and_owners.sql:48-51`). The partial unique
  index `owners_building_id_email_key` (`:56-58`) enforces it. This slice needs no de-duplication
  logic — the registry already did it.
- **`owners.email` is nullable on purpose** (`:31-34`): _"What they lose is the S-02 voting
  link, not their weight in the tally."_ An owner with no address is not a failure of this
  fanout and must never be recorded as one.
- **`src/lib/email.ts` is the only module importing `cloudflare:workers`**, exports `SENDER`
  (locked to `glosowanie@estatemanager.dev` by `wrangler.jsonc:27-34`), `isEmailConfigured()`,
  the `SendResult` union, and `describeSendError()` which extracts Cloudflare's string `.code`.
  It deliberately carries **no retry and no error classification**: _"one send cannot exercise
  the table, and an unproven mapping in production is worse than none. S-04 builds it against a
  real fanout"_ (`src/lib/email.ts:50-55`).
- **Form endpoints take form data and answer with `context.redirect()` carrying `?error=`**,
  mapping provider error codes to Polish at the endpoint
  (`src/pages/api/buildings/[id]/units.ts:18-24`). No JSON error bodies outside `/api/health`
  and `/api/email/test`.
- **`src/middleware.ts:10` — `PROTECTED_ROUTES` is the only auth gate.** `/api/buildings`
  already covers everything this slice adds, so no entry is needed; `/vote` stays deliberately
  outside it (`S-02` Phase 4).
- **Dependency-free modules are the only thing this repo can test.** `src/lib/shares.ts` and
  `src/lib/units-csv.ts` import nothing so they can run under `node --experimental-strip-types`.
  There is no test runner.

What is missing: any send state, any message, any classification of Cloudflare's error codes,
and any administrator-facing answer to "who actually got their link".

### Key Discoveries:

- **The roadmap's stated blocking unknown is answered by the platform docs.** `S-04`'s Unknowns
  ask whether 70 `EMAIL.send()` calls fit one Worker invocation and whether they count against
  the subrequest limit. Cloudflare Workers **Paid** allows **10,000 subrequests per invocation**
  (Free is 50) and up to **5 minutes of CPU**, both adjustable through `limits` in
  `wrangler.jsonc`. This project has been on Paid since 2026-08-01. Even counting the per-owner
  status write, a 70-owner building is ~140 subrequests against a 10,000 ceiling. The unknown is
  closed on documentation; what remains is **wall-clock latency**, which is a UX problem, not a
  platform limit.
- **CPU time is not the constraint and `limits` needs no change.** Waiting on the binding is
  I/O, not CPU; the CPU cost here is string building. Do not add a `limits` block to
  `wrangler.jsonc` — it would cap something that is not near its ceiling while implying it is.
- **Freezing makes the "text in two places" objection disappear.** `S-02`'s `EM006` trigger
  refuses any change to `number`/`title`/`body` once `status <> 'draft'`, and this fanout only
  runs on an open resolution. The text in the message therefore **cannot** diverge from the text
  on `/vote/<token>` — the usual argument against embedding content in mail does not apply here.
- **Adding columns to `voting_links` does not widen the unauthenticated contract.**
  `resolve_voting_link` is `security definer` with an explicit eight-column return list; new
  table columns do not enter it. This is checked in Phase 1 rather than assumed, because that
  function is the only thing the internet can call.
- **`E_BINDING_MISSING` is the only failure this slice can deliberately produce**, which makes
  the decision to record it like any other failure do double duty: it is also the only way to
  exercise the record-and-continue path, the Polish mapping and the resume, without waiting for
  a real Cloudflare failure. See Phase 4.
- **The resolution body is administrator-authored free text on its way into an HTML mail.**
  It must be escaped before interpolation. This is the first place in the project where
  user-supplied text is rendered somewhere Astro's own escaping does not reach.

## What We're NOT Doing

- **Reminders (`FR-010`).** Explicitly `nice-to-have` in the PRD and parked in the roadmap. No
  scheduler, no cron trigger, no second round. The unpark trigger is low turnout, not this slice.
- **Retrying inside the run.** No backoff loop, no second immediate attempt. A failure is
  recorded and the administrator presses the button again — the resume path _is_ the retry.
- **A per-owner "send again" button.** Resume covers never-sent and failed owners. An owner who
  deleted the message cannot be re-sent to from the UI in v1.
- **A daily send counter.** The real quota is 200/day and the PoC building is 70.
  `E_DAILY_LIMIT_EXCEEDED` surfaces to the administrator like any other code.
- **Making `/api/health` fail on a missing `EMAIL` binding.** `CLAUDE.md` parks that decision
  until the channel is load-bearing for a real building; a test building is not that, and a beta
  channel blocking every unrelated deploy is a larger blast radius than this slice earns.
- **Deliverability work.** Spam-folder placement is a v2 non-goal. Both `html` and `text` go out
  because it is free and improves scoring, not because this slice promises inbox placement.
- **Sending on `S-02`'s launch action.** Opening a vote creates links and sends nothing.
- **Anything about `S-03`, `S-05` or `S-06`.** No vote casting, no tally, no archive view.
- **Registry editing**, including adding a missing e-mail address to an owner. Static in v1.

## Implementation Approach

Five phases. Phase 0 exists only because the slice this one stands on has not been built; it is
a gate, not construction work.

1. **Verify the inherited contract** before writing anything against it.
2. **Send state in the schema**, as columns on `S-02`'s own table rather than a new one. Status
   is *derived* from the columns rather than stored alongside them, so there is no second thing
   to keep consistent.
3. **The message**, split so that composition is dependency-free and therefore executable, and
   only the send itself touches the binding.
4. **The fanout**, sequential, resumable, recording per-owner state as it goes.
5. **Production**, against a small test building with inboxes we control, then the record.

The decision shaping Phase 3: **the administrator waits.** A 70-owner run is tens of seconds of
wall clock. `ctx.waitUntil` was rejected because its 30-second budget is a hard cap a 70-owner
run may exceed, and because a background failure is invisible until someone reloads. The cost is
a long-pending request, and it is paid down not by making the request shorter but by making its
interruption harmless: state is written **after each send**, so a browser timeout, a closed tab
or a dead connection costs at most one owner's status, and the button picks up where it stopped.

## Critical Implementation Details

**State sequencing.** The status write happens after each individual send, never batched at the
end. Batching would halve the database round trips and destroy resumability: a run that dies at
owner 60 would have sent 60 messages and recorded none, and the resume would send all 60 again.
This is the single ordering constraint in the slice.

**Sequential, not concurrent.** Sends are awaited one at a time. Concurrency would shorten the
wall clock but Cloudflare rate-limits sending (`E_RATE_LIMIT_EXCEEDED` is a documented code with
"use exponential backoff" as its remedy), and a run that trips the rate limit converts a slow
success into a partial failure the administrator has to repair. Sequential is also what keeps
the per-owner writes ordered and the code readable.

**Token handling, inherited from `S-02`.** The token is a bearer secret. It must never appear in
a log line, in an error message, in the redirect query string, or in the run summary. It appears
in exactly two places: the `voting_links` row and the message body.

**Escaping.** `resolutionBody` is free text from the administrator. In the `text` part it is
interpolated as-is; in the `html` part every `&`, `<`, `>`, `"` and `'` is escaped and newlines
become paragraph breaks — before interpolation, not after.

---

## Phase 0: Confirm `S-02` delivered the contract this plan assumes

### Overview

`S-02` is unbuilt at the time of writing. This phase is a read-only gate: it establishes that
the schema, the token format and the screens match what the phases below were written against,
and stops the work if they do not. No files change.

### Changes Required:

#### 1. Verify the inherited schema and routes

**Files**: none — this phase reads

**Intent**: Turn every assumption this plan inherited from a sibling plan into something a
person has checked, before a migration is written on top of it.

**Contract**: Confirm each of the following. Any mismatch means this plan is revised before
Phase 1 begins — not worked around during implementation.

- `public.voting_links` exists with `id`, `resolution_id`, `owner_id`, `building_id`, `token`,
  `created_at`; `unique (resolution_id, owner_id)`; unique index on `token`
- `public.resolutions` exists with `number`, `title`, `body`, `status` constrained to
  `('draft', 'open')`, and `opened_at`
- Links exist **only for owners with a non-null e-mail** — `S-02`'s open action filters on it.
  If it instead creates links for every owner, Phase 3's resume query is wrong and must filter
  on the e-mail address rather than on send state alone
- One link per **owner**, not per unit — the per-owner rule reached `prd.md` as `S-02`'s Phase 1
  intended
- `src/pages/vote/[token].astro` exists and takes the token as the path segment, so the link is
  `${origin}/vote/${token}`
- `src/pages/buildings/[id]/resolutions/[resolutionId].astro` exists and renders the owner→link
  table Phase 3 adds a column to, plus the separate block listing owners with no address
- `resolve_voting_link` returns an explicit column list (Phase 1 depends on this)

### Success Criteria:

#### Automated Verification:

- Both tables exist in a migration:
  `grep -l "create table public.voting_links" supabase/migrations/*.sql` returns a file
- The token is a path segment: `ls src/pages/vote/\[token\].astro` succeeds
- The resolution page exists:
  `ls "src/pages/buildings/[id]/resolutions/[resolutionId].astro"` succeeds
- Working tree is green on a fresh sync: `npx astro sync && npm run lint && npm run build`

#### Manual Verification:

- Every bullet in the Contract above is confirmed against the delivered code, not against
  `S-02`'s plan
- Where the delivery differs from `S-02`'s plan, the difference is written into this plan
  before Phase 1 starts, and the phases below are re-read for anything it invalidates

**Implementation Note**: This phase is a gate. If `S-02` has not been implemented at all, stop
here — the remaining phases have nothing to attach to.

### Phase 0 Findings — executed 2026-08-04

The gate ran against delivered code. `S-02` **and** `S-03` both shipped (2026-08-02 / 2026-08-03),
so the tree this plan attaches to is two slices further along than the tree it was written
against. Nine migrations exist, ending at `20260803090500_create_votes.sql`. Automated checks
0.1–0.4 all pass: both tables exist in `20260802181500_create_resolutions_and_voting_links.sql`,
`src/pages/vote/[token].astro` and `src/pages/buildings/[id]/resolutions/[resolutionId].astro`
both exist, and `astro sync && lint && build` are green on the inherited tree.

Six findings. **F0-1 and F0-2 are blocking** and change Phase 1's contract; both are consequences
of `20260802214500_restrict_voting_link_token_select.sql`, a migration that did not exist when
this plan was written.

**F0-1 — The fanout has no way to read the token, and this plan never said how it would.**
Phase 3 step 3 says "Load this resolution's links where `sent_at is null`, joined to their
owner's `full_name` and `email`" and never names the token — because when this was written,
`authenticated` could select it. It no longer can:
`revoke select on public.voting_links from authenticated, anon` followed by a column grant of
exactly `(id, resolution_id, owner_id, building_id, created_at)` (`:42-47`). No `security
definer` function returns a token today — `resolve_voting_link` runs the other direction, taking
a token and returning content. That migration's own header predicted this slice would need one
(`:21-24`), and so does `CLAUDE.md`.

*Amendment*: **Phase 1 gains a second object** — one `security definer` function, granted to
`authenticated` only, returning the unsent links of one resolution with the data needed to send:
link id, token, owner full name, owner e-mail. Scoped to a single `resolution_id` argument so it
cannot enumerate a building, let alone the table. It is `definer` for the same reason
`assert_building_registry` is: an invoker function cannot read a column its caller has no grant
on. Record in the migration comment what this does **not** do — it does not make tokens
unobtainable by a determined administrator, which needs the v2 roles model this repo
deliberately lacks; it narrows the surface to one named, reviewable function.

**F0-2 — The four new send-state columns would be invisible on arrival.** The column grant above
is an explicit list, and the same migration warns that "a column added to this table in a later
migration is NOT readable by `authenticated` until it is added to the grant" (`:16-19`), and that
it "will look like an RLS bug to whoever meets it first". Phase 1's contract discusses RLS
policies and is silent on the grant, so following it literally produces four columns the
resolution page cannot read.

*Amendment*: the Phase 1 migration must
`grant select (sent_at, last_attempt_at, last_error_code, attempt_count) on public.voting_links
to authenticated` — **`authenticated` only, not `anon`**, which departs from the existing grant
(it names both roles) and is deliberate: send state is administrator data and the unauthenticated
path reads nothing from this table directly. `update` is unaffected — the revoke covered `select`
alone, so the default table-level `update` grant still stands behind the RLS policies.

**F0-3 — `resolve_voting_link` returns ten columns now, not eight.** `S-03` widened it with
`own_vote_choice` and `own_voted_at`. Success criterion 1.5 and Progress row 1.5 say "the same
eight keys"; the invariant is unchanged in substance — no send state leaks into the one function
the internet can call — but the number to check against is **ten**.

**F0-4 — Confirmed, no change: links exist only for owners with a non-null e-mail.**
`open.ts` step 2 filters `.not("email", "is", null)` before minting. Phase 0's contingency ("if it
instead creates links for every owner, Phase 3's resume query is wrong") does **not** trigger:
the resume may filter on send state alone.

**F0-5 — Confirmed, no change: the per-owner status write is legal on an open resolution.**
`assert_voting_link_frozen` (`EM008`) refuses changes to `token`, `owner_id` and `resolution_id`
only, and deliberately leaves every other column editable
(`20260803090000_harden_voting_links_and_resolutions.sql`). The fanout's write touches none of
the three. `EM012`/`EM013` govern *inserting* and *deleting* links on a non-draft resolution and
are not on this path.

**F0-6 — Phase 1's verification command conflicts with a standing instruction about this
machine.** Success criterion 1.1 and Progress row 1.1 say `npx supabase db reset`. The local
database holds hand-made test state that must not be destroyed; a snapshot sits at
`.claude/local-db-snapshot.sql`.

*Amendment*: apply the migration with `npx supabase migration up`, which applies pending
migrations without resetting. The criterion's intent — the migration applies cleanly from a
known state — is preserved; the reset is not the point of it.

---

## Phase 1: Send state on `voting_links`

### Overview

One migration adds four columns, one check constraint and one partial index to `S-02`'s table.
No new table, no new policies, no change to the unauthenticated contract. Types are regenerated
in the same commit.

### Changes Required:

#### 1. The migration

**File**: `supabase/migrations/<timestamp>_voting_links_send_state.sql`

The timestamp must sort after `S-02`'s migration. Forward-only, wrapped in one transaction, with
a header comment stating purpose, affected objects, and why status is derived rather than stored.

**Intent**: Record, per owner per resolution, whether their link has been mailed — enough to
resume an interrupted fanout and to answer "who got their link" on screen, and no more.

**Contract**: Four columns on `public.voting_links`:

- `sent_at timestamptz` — null until a send succeeds. **This column alone drives the resume**:
  the fanout selects links where it is null.
- `last_attempt_at timestamptz` — when the most recent attempt ran, successful or not
- `last_error_code text` — Cloudflare's string code (or our own `E_BINDING_MISSING`) from the
  most recent failed attempt; null when the last attempt succeeded or none has run
- `attempt_count integer not null default 0` with `check (attempt_count >= 0)`

Status is **derived, not stored**: `sent_at is not null` → wysłano; `sent_at is null and
attempt_count > 0` → błąd, showing `last_error_code`; `attempt_count = 0` → niewysłane. A stored
status column would be a second thing to keep consistent with the timestamps, which is the
failure mode this project has twice chosen triggers to avoid — here it is avoided by not
creating it.

One constraint expresses the invariant the resume depends on:
`constraint voting_links_send_state_check check (sent_at is null or last_error_code is null)` —
a link cannot be both delivered and carrying a live error. This holds only because a successfully
sent link is never re-attempted; say so in the constraint's comment, so that whoever adds a
per-owner resend later sees what they are breaking.

One partial index for the resume query:
`create index voting_links_unsent_idx on public.voting_links (resolution_id) where sent_at is null;`
Partial because the sent rows are exactly the ones the query never wants, and the index shrinks
to nothing as a fanout completes.

**No new RLS policies.** The four columns inherit `public.voting_links`'s existing eight
policies: `authenticated` unconditional — which is what lets the signed-in administrator write
these columns — and `anon` denied on all four operations, which is what keeps send state out of
reach of the unauthenticated `/vote` path. Say this in the migration comment; a reader who
counts policies after this migration should find the same sixteen `S-02` created, and should
know that is deliberate rather than an omission.

#### 2. Generated types

**File**: `src/db/database.types.ts`

**Intent**: Type the four new columns.

**Contract**: `npm run db:types` against the local stack, committed **in the same commit as the
migration**. Note the known limit before relying on it: a wrong column inside a `.select("…")`
string is not a compile error in this version of `supabase-js`, so Phase 3's projection strings
need reading, not just compiling.

### Success Criteria:

#### Automated Verification:

- Migration applies to a clean local stack: `npx supabase db reset`
- Types regenerate and carry the new columns:
  `npm run db:types && git diff src/db/database.types.ts | grep -c "sent_at"` is non-zero
- Type-aware lint and build pass: `npx astro sync && npm run lint && npm run build`

#### Manual Verification:

- Through PostgREST as `anon`: `select` on `voting_links` still returns `[]` and `insert` still
  fails `42501` — the new columns changed nothing about the anonymous contract
- `rpc/resolve_voting_link` as `anon`, with a token from an open resolution, returns a row with
  **the same eight keys as before this migration** — no send state leaked into the one function
  the internet can call
- Setting both `sent_at` and `last_error_code` on one row is refused by
  `voting_links_send_state_check`

**Implementation Note**: After automated verification passes, pause for confirmation that the
manual checks ran before starting Phase 2.

---

## Phase 2: The message and the send

### Overview

Composition is separated from sending so that the part with logic in it can actually be run.
`src/lib/email.ts` keeps its monopoly on `cloudflare:workers`; nothing else imports the binding.

### Changes Required:

#### 1. Message composition

**File**: `src/lib/voting-link-email.ts`

**Intent**: Build the Polish message for one owner, and translate a Cloudflare error code into a
sentence an administrator can act on. Dependency-free so it can be executed directly with
`node --experimental-strip-types` — following `src/lib/shares.ts` and `src/lib/units-csv.ts`,
which is the only form of testing this repository has.

**Contract**: Two exports, no imports.

`buildVotingLinkMessage(input): { subject: string; text: string; html: string }` where `input`
is `{ buildingName, resolutionNumber, resolutionTitle, resolutionBody, ownerFullName, voteUrl }`.

- Subject names the resolution and the building, in Polish, so the message is recognisable in a
  list of unread mail by someone who did not know a vote was happening — the PRD's secondary
  persona is _niezainteresowany i nieświadomy_, and a one-line message with a bare link reads
  as phishing to exactly that reader.
- Both parts carry: who it is addressed to, which building and which resolution, the **full
  resolution text**, and the link. Nothing about other owners, no share figures, no other
  owner's name — the NFR that an owner learns nothing about other owners applies to the message
  as much as to the page.
- The link is the only URL in the message.
- `text` preserves the body's line breaks as-is. `html` escapes `&`, `<`, `>`, `"` and `'` in
  **every** interpolated value — the body above all, which is administrator-authored free text
  going into someone's mail client — and only then converts line breaks to markup.

`describeSendFailure(code: string): string` maps the codes reachable from this call site to
Polish, and returns a sentence naming the raw code for anything else. Map at minimum:
`E_BINDING_MISSING` (ours — the send never happened), `E_SENDER_NOT_VERIFIED` and
`E_SENDER_DOMAIN_NOT_AVAILABLE` (configuration, not the owner), `E_RECIPIENT_SUPPRESSED` (this
address has bounced or reported spam — reach this owner on the paper channel),
`E_RATE_LIMIT_EXCEEDED` and `E_INTERNAL_SERVER_ERROR` (transient — press the button again),
`E_DAILY_LIMIT_EXCEEDED` (the daily quota is spent — continue tomorrow),
`E_DELIVERY_FAILED` (the address was rejected on delivery), `E_VALIDATION_ERROR` /
`E_FIELD_MISSING` (malformed request — a bug, say so). Do **not** invent Polish for the header
codes: this call site sends no custom headers, so they are unreachable, and a fabricated
sentence for an unreachable code is worse than showing the code. The fallback branch exists for
exactly that.

Why the map lives here and not in the endpoint, unlike the SQLSTATE map in
`src/pages/api/buildings/[id]/units.ts:18-24`: those codes are shown once, on a redirect. These
are rendered per row on a page, so the page needs the map — and the page must not import
`src/lib/email.ts`, which would pull `cloudflare:workers` into a component's import graph.

#### 2. Sending one message

**File**: `src/lib/email.ts`

**Intent**: One more function beside `sendTestEmail`, sharing the binding accessor and the error
describer.

**Contract**: `sendVotingLinkEmail(to: string, message: { subject; text; html }):
Promise<SendResult>`. Reuses `emailBinding()`, returns the existing `SendResult` union, never
throws, and returns `E_BINDING_MISSING` when the binding is absent — the same shape
`sendTestEmail` already uses. `from` is the exported `SENDER` constant and is not parameterised:
`wrangler.jsonc` locks the sending identity, and a caller-supplied `from` would fail at the
binding anyway. `sendTestEmail` is untouched; it remains the live smoke test for the channel.

The failure log line must record the code and the recipient's **absence** — log the code, never
the token, and never the message body.

### Success Criteria:

#### Automated Verification:

- Type-aware lint and build pass: `npx astro sync && npm run lint && npm run build`
- `src/lib/voting-link-email.ts` runs directly under `node --experimental-strip-types`:
  a body containing `<script>alert(1)</script>` and `&` appears escaped in `html` and verbatim
  in `text`; the `voteUrl` is the only URL in either part; subject, text and html are all
  non-empty
- `describeSendFailure` returns a distinct Polish sentence for each mapped code and a
  code-naming fallback for an unmapped one

#### Manual Verification:

- Reading the rendered `text` part as an owner who did not know a vote was happening, it is
  clear who sent it, about what, and what clicking does
- The message contains no other owner's name, no share figure and no second URL
- One real message sent to an inbox you control renders correctly in a mail client — both the
  HTML part and, with HTML disabled, the plain-text part

---

## Phase 3: The fanout, the button and the status column

### Overview

One endpoint that walks the unsent links for a resolution, and the two additions to `S-02`'s
resolution page that let an administrator start it and read the outcome.

### Changes Required:

#### 1. The fanout endpoint

**File**: `src/pages/api/buildings/[id]/resolutions/[resolutionId]/send.ts`

**Intent**: Send one message per not-yet-reached owner, recording the outcome as it goes, and
return a summary the page can display.

**Contract**: Form data in, `context.redirect()` out, matching every other endpoint in the
project. Covered by `PROTECTED_ROUTES`'s `/api/buildings` prefix — no middleware change.

1. Load the resolution scoped by both `id` and `building_id`. Not found, or an invalid uuid
   (`22P02`), redirects with the standard Polish not-found message.
2. Refuse when `status = 'draft'`: "Najpierw uruchom głosowanie — dopiero wtedy linki są
   ważne." A draft's links resolve to nothing on `/vote/<token>`, so mailing them would send
   owners to a dead page.
3. Load this resolution's links where `sent_at is null`, joined to their owner's `full_name`
   and `email`, plus the building name and the resolution's content. Read the projection string
   carefully — a wrong column there is not a compile error.
4. Zero rows is a **success**, not an error: redirect with "Wszyscy właściciele z adresem
   e-mail mają już wysłany link." Nothing is re-sent.
5. Walk the rows **sequentially**, awaiting each send. For each: build the message with
   `buildVotingLinkMessage`, call `sendVotingLinkEmail`, then immediately write that row's
   status — `attempt_count + 1` and `last_attempt_at = now()` always, plus `sent_at = now()`
   and `last_error_code = null` on success, or `last_error_code = <code>` on failure. **The
   write happens per owner, before the next send starts.** Batching it at the end would halve
   the round trips and lose the entire resume guarantee.
6. A failure never aborts the run — the next owner is attempted regardless. There is no retry.
7. Redirect back to the resolution page with a summary of counts only. The summary must carry
   no token and no e-mail address.

The absolute link is built from `Astro.url.origin` — never a hardcoded hostname — so the same
code produces working links on `localhost:4321`, on `*.workers.dev`, and on whatever domain
comes later.

#### 2. The button and the warning

**File**: `src/pages/buildings/[id]/resolutions/[resolutionId].astro`

**Intent**: Start the fanout, and tell the administrator what pressing it costs before they
press it.

**Contract**: Visible only when `status = 'open'`. The label names how many owners will be
contacted and makes the resume visible rather than implicit: _Roześlij linki (N)_ on a fresh
resolution, _Wyślij pozostałe linki (N)_ once some have gone out. Beside it, a sentence saying
the send takes up to about a minute for a large building, that the page must stay open, and
that an interrupted run can be continued by pressing the button again — which is true, and is
the reason the long wait is acceptable. The submitting state disables the button and says
_Wysyłanie…_ so a second press cannot start a concurrent run from the same tab.

The button is **not** gated on `isEmailConfigured()`. A missing binding is recorded per owner as
`E_BINDING_MISSING` like any other failure and cleared by the resume once the binding returns —
and it is the only failure this slice can deliberately produce, which makes it the path Phase 4
uses to exercise the whole failure branch.

#### 3. Per-owner status in the links table

**File**: `src/pages/buildings/[id]/resolutions/[resolutionId].astro`

**Intent**: Answer "who got their link" in the table that already answers "what is their link".

**Contract**: One column added to `S-02`'s owner→link table, rendering the derived status:
_Wysłano_ with the date for `sent_at`; _Błąd_ with `describeSendFailure(last_error_code)` when a
failed attempt is the most recent; _Niewysłane_ when `attempt_count = 0`. The raw code appears
only inside the mapped sentence's fallback branch.

The existing block listing owners **without** an e-mail address gains one sentence: they receive
no message and must be reached outside the application — the paper channel the PRD provides for.
They are never counted among the failures, and they have no row in the table because `S-02`
creates no link for them.

The run summary from the redirect renders above the table: how many were sent, how many failed,
how many owners have no address.

### Success Criteria:

#### Automated Verification:

- Type-aware lint and build pass: `npx astro sync && npm run lint && npm run build`
- No middleware change was needed: `grep -c '"/api/buildings"' src/middleware.ts` returns `1`

#### Manual Verification:

- A fanout on a local building with 3+ owners sends one message per owner with an address, and
  each message carries that owner's own token
- The table shows _Wysłano_ with a timestamp for each, and the no-address block lists the rest
- Pressing the button again reports that everyone already has a link, and **no second message
  arrives**
- An owner holding two units receives exactly one message
- Interrupting a run (close the tab mid-send) leaves the already-sent owners marked sent;
  pressing the button again sends only to the remainder, and no owner receives two messages
- With the `EMAIL` binding removed from `wrangler.jsonc`, a run records `E_BINDING_MISSING`
  against every unsent owner and the table shows the mapped Polish sentence; restoring the
  binding and pressing again sends to exactly those owners
- The redirect URL and the page source contain no token and no e-mail address
- A draft resolution offers no send button, and posting to the endpoint directly is refused

**Implementation Note**: After automated verification passes, pause for confirmation that the
manual checks — the resume behaviour above all — ran before starting Phase 4.

---

## Phase 4: Production and the record

### Overview

Apply the migration before the code that needs it, land the PR, run a real fanout against
inboxes we control, and write down what happened.

### Changes Required:

#### 1. Apply the migration to production

**Intent**: Migrations are applied by hand and nothing in CI does it (open residual `G14`).

**Contract**: `npx supabase db push` from a linked checkout, **before** the merge that deploys
the code. Reversed, production serves a page selecting columns that do not exist. Forward-only:
`wrangler rollback` reverts code, never schema.

#### 2. Pull request

**Intent**: Every change gets its own branch and PR; the merge is the production deploy.

**Contract**: Branch off up-to-date `main`, `gh pr create --base main`, `ci.yml` green before
merge, `gh pr merge --squash --delete-branch`. Commit, push/PR and merge are three separate
approvals, waited for rather than assumed. Run `git branch --show-current` immediately before
each commit — `main` means stop.

#### 3. Live fanout against a controlled test building

**Intent**: The mail binding fails where `astro dev` and workerd diverge, so the fanout has to
run where it actually runs. `F-02` established that a local send with `remote: true` proves the
account and the domain, not that the deployed Worker resolves the binding.

**Contract**: On the live Worker, create a building with **3–5 lokale** whose owner addresses
are inboxes you control. Plus-addressed variants of one mailbox are fine and are distinct
strings, so `owners_building_id_email_key` is satisfied. Import the registry, create a
resolution, open the vote, then:

- Run the fanout. Confirm each inbox receives exactly one message, that each message's link
  opens **that owner's** view, and that the table shows _Wysłano_ for all of them.
- Press the button again. Confirm the "already sent" message and that no second mail arrives.
- Exercise the failure branch the only way production allows: temporarily remove the `EMAIL`
  binding — or use a build without it — confirm `E_BINDING_MISSING` is recorded per owner and
  rendered in Polish, then restore it and confirm the resume sends to exactly those owners.
- Check `/api/health` afterwards; it should still report `"email":"ok"`.

**The residual, stated rather than hidden**: Cloudflare's own failure codes
(`E_RECIPIENT_SUPPRESSED`, `E_RATE_LIMIT_EXCEEDED`, `E_DAILY_LIMIT_EXCEEDED`,
`E_DELIVERY_FAILED`) cannot be produced on demand, so their Polish sentences ship unexercised.
What the `E_BINDING_MISSING` walk-through does prove is everything around them — that a failure
is recorded and not retried, that the run continues past it, that the mapping renders, and that
the resume clears it. Record this as a known gap; the first real failure is the test.

Note the deliberate cost of this verification: the test building stays in the production
database. The registry is static in v1 and no screen deletes a building, so it is permanent.

#### 4. The record

**Files**: `context/changes/voting-link-email-fanout/change.md`,
`context/foundation/roadmap.md`, `CLAUDE.md`

**Intent**: Update the places that describe project state, and nowhere else.

**Contract**: `change.md` → `status: done` with the date. `roadmap.md` → `S-04` status `done`,
a **Zrealizowane** paragraph in the shape `S-01` and `S-01b` use, and the `## At a glance` and
`## Backlog Handoff` rows. Two of `S-04`'s Unknowns are resolved and should say so rather than
being deleted: the subrequest question (**Workers Paid allows 10,000 subrequests per invocation
and 5 minutes of CPU; 70 sends plus 70 status writes is ~140** — the constraint turned out to be
wall clock, not the platform) and the owners-without-address question (**listed on screen, named
as the paper channel, never counted as failures**). `CLAUDE.md` → one entry under "Current state"
covering the four send-state columns, the derived status, the resume rule, the sequential
per-owner write ordering, and the fact that the error-code table exists but is only partly
exercised. `CLAUDE.md` is the only place these facts live — do not duplicate them into
`README.md`.

### Success Criteria:

#### Automated Verification:

- CI green on the pull request (`npm ci → astro sync → lint → build`)
- After merge, `deploy.yml` green including its `/api/health` assertion

#### Manual Verification:

- The migration was applied to production with `db push` **before** the merge that deployed the
  code
- Every inbox in the test building received exactly one message, with its own working link
- A second press sent nothing
- The `E_BINDING_MISSING` walk-through recorded, rendered and then resumed correctly
- `change.md`, `roadmap.md` and `CLAUDE.md` agree with each other and with the code

---

## Testing Strategy

There is no test runner in this project — no `npm test`, no framework, no test files. The gates
are `npx astro sync && npm run lint && npm run build`, direct execution of dependency-free
modules with `node --experimental-strip-types`, PostgREST probes for anything security-shaped,
and manual steps. Never report that tests passed.

### Executable modules:

- `src/lib/voting-link-email.ts` — HTML escaping of a hostile body, line-break handling, the
  link being the only URL, and `describeSendFailure`'s mapped codes and fallback

### PostgREST probes:

- `anon` still gets `[]` on select and `42501` on insert against `voting_links` after the
  migration
- `rpc/resolve_voting_link` as `anon` returns the same eight keys as before the migration
- `voting_links_send_state_check` refuses a row with both `sent_at` and `last_error_code`

### Manual Testing Steps:

1. Sign in, open a resolution with the vote already open, and read the button label and its
   warning before pressing anything.
2. Press _Roześlij linki_. Confirm one message per owner with an address, each carrying that
   owner's own link, and the table showing _Wysłano_ with timestamps.
3. Press it again. Confirm the "already sent" message and that no mail arrives.
4. Start a run and close the tab mid-send. Reload, confirm the partial statuses, press again,
   confirm only the remainder is sent and nobody receives two messages.
5. Remove the `EMAIL` binding, run, and confirm `E_BINDING_MISSING` per owner in Polish;
   restore it and confirm the resume.
6. Confirm an owner holding two units received exactly one message.
7. Confirm the no-address block lists the remaining owners and names the paper channel.
8. Confirm no token and no e-mail address appears in the URL or the page source.
9. Repeat 2, 3 and 5 against the live Worker after deploy.

## Performance Considerations

A 70-owner building is 70 sends plus 70 status writes — roughly 140 subrequests against a
10,000 ceiling on the Paid plan, and a CPU cost that is string building. Nothing here is near a
platform limit. What is real is **wall clock**: at a few hundred milliseconds per send, a full
building is tens of seconds of a pending request. That is accepted by design, and mitigated by
writing state per owner so an interruption is cheap rather than by shortening the run. Adding
concurrency would shorten it and risk `E_RATE_LIMIT_EXCEEDED`, converting a slow success into a
partial failure; that trade is refused. Do not add a `limits` block to `wrangler.jsonc` — it
would cap a resource this workload does not approach.

## Migration Notes

Forward-only, one transaction, applied by hand with `npx supabase db push` before the code that
depends on it. `src/db/database.types.ts` is regenerated and committed in the same commit as the
migration. No existing rows are rewritten: all four columns are nullable or defaulted, so links
created by `S-02` before this migration read as `attempt_count = 0`, _niewysłane_ — which is
exactly what they are. Rollback of the schema is not available; a bad migration is corrected by
a further forward migration.

## References

- Roadmap slice: `context/foundation/roadmap.md` → `### S-04`
- Prerequisite slice, whose contract this plan assumes:
  `context/changes/resolution-with-voting-links/plan.md`
- Mail channel API, error codes, limits and PoC scale:
  `context/changes/transactional-mail-channel/docs-cloudflare-email.md` §5, §6, §8, §9
- Provider decision record: `context/changes/transactional-mail-channel/research.md`
- Product rules: `context/foundation/prd.md` → FR-002, FR-004, `## Non-Functional Requirements`
- Registry shape and the per-person owner rule:
  `supabase/migrations/20260802072737_create_units_and_owners.sql:24-58`
- Binding access and the deliberate absence of a retry table: `src/lib/email.ts:1-99`
- Provider-code → Polish mapping precedent: `src/pages/api/buildings/[id]/units.ts:18-24`
- Auth gate: `src/middleware.ts:10`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 0: Confirm `S-02` delivered the contract this plan assumes

#### Automated

- [x] 0.1 Both new tables exist in a migration — 15bffc5
- [x] 0.2 `src/pages/vote/[token].astro` exists with the token as the path segment — 15bffc5
- [x] 0.3 The resolution page exists — 15bffc5
- [x] 0.4 `astro sync && lint && build` pass on the inherited tree — 15bffc5

#### Manual

- [x] 0.5 Every bullet of the inherited contract confirmed against delivered code — 15bffc5
- [x] 0.6 Any difference from `S-02`'s plan written into this plan before Phase 1 — 15bffc5

### Phase 1: Send state on `voting_links`

#### Automated

- [x] 1.1 Migration applies to the local stack (`npx supabase migration up` — see F0-6) — cee3939
- [x] 1.2 `npm run db:types` regenerates and carries the new columns — cee3939
- [x] 1.3 `astro sync && lint && build` pass — cee3939
- [x] 1.7 The four new columns are added to the column-level `select` grant (F0-2) — cee3939
- [x] 1.8 A `security definer` function returns unsent links with tokens, granted to `authenticated` only (F0-1) — cee3939

#### Manual

- [x] 1.4 `anon` still gets `[]` on select and `42501` on insert for `voting_links` — cee3939
- [x] 1.5 `resolve_voting_link` as `anon` returns the same ten keys as before (F0-3) — cee3939
- [x] 1.6 `voting_links_send_state_check` refuses `sent_at` and `last_error_code` together — cee3939
- [x] 1.9 `anon` cannot execute the new token-reading function; `authenticated` can, and it returns only the named resolution's unsent links — cee3939

### Phase 2: The message and the send

#### Automated

- [x] 2.1 `astro sync && lint && build` pass
- [x] 2.2 `voting-link-email.ts` executed directly: hostile body escaped in html, verbatim in text, single URL
- [x] 2.3 `describeSendFailure` maps each listed code and falls back by naming an unmapped one

#### Manual

- [x] 2.4 The rendered text part is legible to an owner who did not know a vote was happening
- [x] 2.5 The message leaks no other owner's name, share or address, and carries one URL
- [ ] 2.6 One real message renders correctly in a mail client, HTML and plain text — deferred to Phase 4 (needs a real send; covered by 4.4)

### Phase 3: The fanout, the button and the status column

#### Automated

- [ ] 3.1 `astro sync && lint && build` pass
- [ ] 3.2 No middleware change needed — `/api/buildings` still covers the new endpoint

#### Manual

- [ ] 3.3 One message per owner with an address, each carrying that owner's own token
- [ ] 3.4 Table shows _Wysłano_ with timestamps; no-address block lists the rest
- [ ] 3.5 Second press reports everyone already has a link and sends nothing
- [ ] 3.6 An owner holding two units receives exactly one message
- [ ] 3.7 An interrupted run resumes correctly and nobody receives two messages
- [ ] 3.8 Missing binding records `E_BINDING_MISSING` per owner; restoring it resumes
- [ ] 3.9 No token and no e-mail address in the redirect URL or the page source
- [ ] 3.10 A draft offers no button and the endpoint refuses a direct post

### Phase 4: Production and the record

#### Automated

- [ ] 4.1 CI green on the pull request
- [ ] 4.2 `deploy.yml` green after merge, including the `/api/health` assertion

#### Manual

- [ ] 4.3 Migration applied to production with `db push` **before** the merge
- [ ] 4.4 Every test inbox received exactly one message with its own working link
- [ ] 4.5 A second press on production sent nothing
- [ ] 4.6 The `E_BINDING_MISSING` walk-through recorded, rendered and resumed on production
- [ ] 4.7 `change.md`, `roadmap.md` and `CLAUDE.md` updated and mutually consistent
