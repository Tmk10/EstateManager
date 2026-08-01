# Building Create Implementation Plan

## Overview

Roadmap item `S-01`. An administrator creates a building from a three-field form — name,
city, and street with number — and sees it saved. Behind that small surface sit three firsts for this project:
the first SQL migration in its history, the first row level security contract (which every
later table inherits), and the first time the local Supabase stack is brought up at all.

PRD `FR-011` binds one extra property: the field set must stay **extensible**. Adding a
column later has to be an additive migration plus one more form field — never a reshape of
the table or of the write path.

## Current State Analysis

**The data layer is empty and has always been empty.** `supabase/migrations/` does not
exist. `git log --all --diff-filter=A --name-only -- 'supabase/**'` returns exactly three
files ever added: `.gitignore`, `config.toml` (commit `901267a`), and `seed.sql` (commit
`2bcc3aa`). No migration has ever been authored or applied. `context/foundation/roadmap.md:74`
records the same: "Data: absent … brak katalogu `supabase/migrations/`, brak jakiegokolwiek
schematu, brak polityk dostępu, brak wygenerowanych typów. Zero tabel."

**`supabase/seed.sql` has never run.** It shipped from `F-01` unexercised because Docker was
unavailable on the machine. `production-admin-access/plan.md:640-659` records steps 0.1–0.3
as `[x]` with struck-through titles and the verbatim note *"Checked off to close this plan,
not because they passed."* `CLAUDE.md:68` and this change's own `change.md:27-29` both carry
the obligation forward to `S-01`. Docker was still unavailable when this plan was written —
`docker info` fails — so Phase 1 brings it up. That is the one prerequisite outside the repo.
(Corrected 2026-08-02: Docker Desktop turns out to be installed already; only its CLI shim is
off `PATH` and the daemon is stopped.)

**The Supabase client is untyped.** `src/lib/supabase.ts:9` calls `createServerClient` with
no `<Database>` type argument, so every future `.from("buildings")` is effectively untyped.
There is no `Database` type, no `src/db/`, no generated types file anywhere. The only
generated-types precedent is Cloudflare's `worker-configuration.d.ts` — generated, committed,
never regenerated in CI.

**`createClient` can return `null`.** `SUPABASE_URL` / `SUPABASE_KEY` are `optional: true` in
`astro.config.mjs`, so a missing secret yields a `null` client rather than a crash
(`CLAUDE.md:21`). Every new code path touching Supabase must handle that branch.

**`PROTECTED_ROUTES` is the only auth gate.** `src/middleware.ts:6` currently holds
`["/dashboard", "/api/email"]`, matched with `startsWith`. A new page is not protected until
its path is listed there.

**Nothing in CI touches the database.** `ci.yml` and `deploy.yml` run
`npm ci → astro sync → lint → build` (deploy adds `wrangler deploy` → `curl /api/health`).
Neither invokes the `supabase` CLI, and no `DATABASE_URL` or service-role secret exists. A
migration committed to the repo is **not** applied by any pipeline — applying it is a manual
step. This is open residual **G14** in `context/changes/deployment/deployment.md:146`.

**The project is not linked.** `supabase/.temp/` contains only `cli-latest`; there is no
`project-ref`. `supabase link` is required before `db push` can reach production.

**Form conventions are established.** `SignInForm.tsx` is a React island (`client:load`)
posting **form data** to an API route, which responds with `context.redirect()` carrying
`?error=<message>` — never a JSON error body (`CLAUDE.md:38`). The page reads the error from
`Astro.url.searchParams` and passes it back in as `serverError`. `FormField.tsx` is the
reusable input, already supporting `error` and `hint`.

## Desired End State

A signed-in administrator opens `/buildings`, sees the buildings that exist (empty state when
there are none), clicks through to `/buildings/new`, fills in name, city and street, submits, and
lands back on `/buildings` with the new building listed. Submitting the same name, city and
street twice produces a readable Polish message rather than a Postgres error. An anonymous visitor
hitting either path is redirected to `/auth/signin`.

Underneath: `supabase/migrations/` holds one migration creating `public.buildings` with RLS
enabled and eight policies; `src/db/database.types.ts` is generated and committed;
`createServerClient<Database>` types every query in the codebase; the local stack runs and
`npx supabase db reset` applies migration + seed without error.

### Key Discoveries:

- No migration has ever existed — `git log --all --diff-filter=A -- 'supabase/**'` proves it. This plan writes the first one, so there is no prior art to copy inside the repo.
- `supabase/seed.sql:20-22` says to verify the seed **by signing in, not by selecting the row** — it encodes assumptions about the Supabase-owned `auth.users` schema that a SELECT would not exercise.
- `production-admin-access/plan.md:656-659`: Astro's `security.checkOrigin` rejects a form POST with no `Origin` header (`403 Cross-site POST form submissions are forbidden`). Every `curl` against a form endpoint must send `-H "Origin: <origin>"`.
- `CLAUDE.md:49` requires one policy per operation × role, `anon` included. Implicit deny is not enough — the `anon` policies must be written explicitly.
- Supabase docs: wrap `auth.uid()` as `(select auth.uid())` in policy predicates so Postgres caches it per statement instead of re-evaluating per row. Not load-bearing for this table (no uid predicate), but it is the pattern later tables inherit.
- `supabase gen types` targets are mutually exclusive (`--local` / `--linked` / `--project-id` / `--db-url`). `--local` needs Docker, which Phase 1 installs.
- `[db.seed]` (`supabase/config.toml:60-65`) runs on `supabase seed` as well as after a wipe, so every seed insert must be idempotent — the existing ones use `where not exists`.

## What We're NOT Doing

- **Not importing lokale, metraż, owners, or shares.** That is `S-01b` (`building-units-import`), a separate change with its own plan.
- **Not adding address validation beyond non-empty.** No postal code, no dictionary of Polish
  cities, no geocoding. `city` and `street` are free text with a length bound; FR-011's
  extensibility clause is what makes adding a postal code later a one-column migration.
- **Not building multi-building support.** PRD `## Non-Goals`. The form creates buildings, but nothing downstream handles a portfolio; v1 operates on one.
- **Not building a roles model.** PRD `## Non-Goals`: every user in the database is an administrator in v1. That is why the `authenticated` policies are unconditional rather than ownership-scoped.
- **Not adding editing or deletion in the UI.** The registry is static in v1 (PRD `## Non-Goals`). The `update` / `delete` policies exist because the convention requires one per operation, not because a screen uses them.
- **Not rebuilding `/dashboard`.** It gains one link to `/buildings` and otherwise stays the placeholder `F-01` left.
- **Not adding a migration step to CI.** Residual G14 stays open. Wiring `db push` into `deploy.yml` needs a service-role credential and a rollback story; both are out of scope here and neither is needed to ship this slice.
- **Not seeding production.** `--include-seed` must never be aimed at the linked project — the seed mints an administrator, which the project forbids against production (`CLAUDE.md:68`).

## Implementation Approach

Four phases, each ending in one commit straight to `main` (per `context/foundation/lessons.md`
— never a feature branch).

The ordering is deliberate: the local stack comes up **first**, so the migration gets a real
dress rehearsal before it ever reaches production. That is the whole reason Phase 1 exists as
its own phase rather than as a prerequisite bullet. Production is touched only in Phase 4,
after the same SQL has been applied and exercised locally.

## Critical Implementation Details

**Migration must be transactional.** `db push` is forward-only and there is no rollback —
`wrangler rollback` reverts code, never schema (`README.md:279`). A migration that
half-applies leaves production in a state neither the local files nor
`supabase_migrations.schema_migrations` describe. Wrap the whole file in `begin; … commit;`.

**Order within Phase 2 matters.** Types are generated *from* the applied schema, so the
sequence is: write migration → `db reset` (applies it) → `gen types` → parameterize the
client → lint. Generating types before the migration applies yields a `Database` type with no
`buildings` table and a lint failure that looks like a code bug.

**`npx astro sync` before `npm run lint`, always** (`CLAUDE.md:22`) — ESLint runs
`strictTypeChecked` with `projectService`. This bites specifically after generated types
change, which is exactly what Phase 2 does.

---

## Phase 1: Local stack and the unexercised seed

### Overview

Bring up the local Supabase stack for the first time and discharge the verification debt
`F-01` left behind. No application code changes here — this phase exists so that Phase 2's
migration has somewhere safe to fail.

### Changes Required:

#### 1. Install a container runtime

**File**: none — the developer machine.

**Intent**: `npx supabase start` needs Docker and ~7 GB RAM (`CLAUDE.md`). Everything else in
this plan depends on this step. Corrected 2026-08-02: `/Applications/Docker.app` **is already
installed** — what is missing is the CLI shim on `PATH` (it lives at
`/Applications/Docker.app/Contents/Resources/bin`) and a running daemon. This is a start-and-
wire step, not an install.

**Contract**: `docker info` exits 0. Either Docker Desktop or OrbStack is acceptable — the
Supabase CLI only needs a Docker-compatible socket.

#### 2. Start the stack and run the seed for the first time

**File**: none — CLI.

**Intent**: `supabase/seed.sql` has shipped once and never executed. Running it is both a
prerequisite for Phase 2 and the discharge of `F-01` steps 0.1–0.3, which were checked off to
close that plan without having passed.

**Contract**: `npx supabase start` brings the stack up; `npx supabase db reset` applies the
seed without error. Verification is **by signing in**, not by selecting the row — per the
warning at `supabase/seed.sql:20-22`, the file encodes assumptions about the Supabase-owned
`auth.users` schema that a SELECT would not exercise. If it fails, the prime suspect named by
`F-01` is those `auth.users` column assumptions.

#### 3. Point the dev server at the local stack

**File**: `.dev.vars` (untracked, `.gitignore:21`) and `.env` (untracked, `.gitignore:17`)

**Intent**: `npm run dev` currently reads whatever `SUPABASE_URL` / `SUPABASE_KEY` are set —
pointing them at the local stack is what makes the rest of the plan verifiable without
touching production.

**Corrected 2026-08-02**: the plan named `.env` only. The Cloudflare adapter reads
**`.dev.vars`**, and that file existed already, pointing `npm run dev` at the **production**
Supabase project (`swsvohyahbamfonekvaa.supabase.co`). Editing `.env` alone would have left
every local verification in this plan running against live data. Both files are now set to
the local stack.

**Contract**: `SUPABASE_URL` / `SUPABASE_KEY` in **both** files set to the values printed by
`npx supabase start` (API URL `http://127.0.0.1:54321` and the local publishable key).
Nothing committed — both files stay untracked.

### Success Criteria:

#### Automated Verification:

- `docker info` exits 0
- `npx supabase start` brings the stack up and prints API URL, anon key and Studio URL
- `npx supabase db reset` completes without error
- Running `npx supabase seed` a second time completes without error (idempotency — `[db.seed]` runs outside a wipe too)
- `npx astro sync && npm run lint && npm run build` still pass (no code changed; this is the baseline for later phases)

#### Manual Verification:

- Signing in at `http://localhost:4321/auth/signin` with `test@test.com` / `Test123!` against the local stack succeeds and lands on `/dashboard`
- Studio at `http://127.0.0.1:54323` shows the seeded user under Authentication → Users

**Implementation Note**: After automated verification passes, pause for human confirmation
before proceeding to Phase 2.

---

## Phase 2: The buildings table, its access contract, and generated types

### Overview

The first migration in the project's history. Creates `public.buildings`, enables RLS, writes
eight policies, extends the seed with a demo building, generates the `Database` type and wires
it into the one place the Supabase client is constructed.

### Changes Required:

#### 1. The migration

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_create_buildings.sql` (timestamp per
`CLAUDE.md:49`; create the directory — it does not exist)

**Intent**: Create the buildings table and, with it, the access contract every later table in
this product inherits. The table is deliberately the smallest possible carrier for that
contract: three content columns, no owner data, nothing that makes a policy mistake expensive.

**Contract**: One transaction (`begin; … commit;` — `db push` is forward-only and there is no
schema rollback). Table `public.buildings`:

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | primary key, `default gen_random_uuid()` |
| `name` | `text` | `not null`, non-empty check |
| `city` | `text` | `not null`, non-empty check |
| `street` | `text` | `not null`, non-empty check — street **and** number in one field |
| `created_at` | `timestamptz` | `not null default now()` |

Plus `unique (name, city, street)` — the decision recorded in this change's questioning: it
catches an accidental double submit without forbidding two genuinely different buildings that
share a name in different towns.

**Why the address is two columns, not one** (decided 2026-08-02): a single free-text `address`
is neither searchable nor comparable — "ul. Kwiatowa 3, Warszawa" and "Warszawa, Kwiatowa 3"
are the same building and different strings, and the unique constraint would not catch it.
Splitting now, on a table with no rows, costs one extra column. Splitting later would be a
data migration that parses free text. `street` deliberately carries the number: Polish street
addresses put the number inline ("Kwiatowa 3/5", "al. Jana Pawła II 12A"), and a separate
number column invites a format war over `3/5`, `12A`, `15 m. 4`.

`alter table public.buildings enable row level security;` followed by **eight** policies —
four operations × two roles, per `CLAUDE.md:49`:

- `to authenticated`, all four operations, predicate `true` (`using` for select/update/delete, `with check` for insert/update). PRD v1: every user in the database is an administrator, and there is no roles model.
- `to anon`, all four operations, predicate `false` (`using (false)`, `with check (false)`). Owners vote from an emailed link with no session, so `anon` must be denied on this table explicitly — implicit deny does not satisfy the convention, and writing it out forces every future table to make a deliberate statement about the unauthenticated path.

Note for later tables: `update` needs **both** `using` and `with check`. Omitting `with check`
gates which rows may be touched but not what they may become — the likeliest RLS bug once
`building_id` scoping arrives in `S-01b`.

**Extensibility (FR-011)**: nothing here is positional or packed. A later column is
`alter table public.buildings add column …` plus one `FormField` — no policy rewrite, no data
migration, no change to the write path.

#### 2. Demo building in the seed

**File**: `supabase/seed.sql`

**Intent**: After `db reset`, `/buildings` should have something to show, and `S-01b` should
have a ready import target instead of starting with manual clicking every time.

**Contract**: One additional insert, idempotent in the same style as the existing two
(`where not exists`), because `[db.seed]` also runs on `npx supabase seed` outside a wipe.
Polish demo data consistent with the domain (a `Wspólnota Mieszkaniowa` name, a city and a
street with number). The existing comment header gains a line noting the table is now seeded too.

#### 3. Generated database types

**File**: `src/db/database.types.ts` (new directory)

**Intent**: Give the codebase a `Database` type so column names are checked at lint time
rather than discovered in runtime. `CLAUDE.md:46` routes hand-written shared types to
`src/types.ts`; this file is generated output and stays separate so a regeneration cannot
clobber authored types.

**Contract**: Output of `npx supabase gen types typescript --local --schema public`, committed.
Generated — never hand-edited, regenerated after every migration. Follows the
`worker-configuration.d.ts` precedent: generate, commit, never regenerate in CI.

#### 4. Type the Supabase client

**File**: `src/lib/supabase.ts`

**Intent**: One call site types the whole codebase. This is the only place
`createServerClient` is constructed.

**Contract**: `createServerClient<Database>(...)`. The `null` return for unset env vars stays
exactly as it is (`CLAUDE.md:21`). Export `export type SupabaseClient =
NonNullable<ReturnType<typeof createClient>>;` so downstream code names the client type
without re-deriving it and without losing the `| null` contract.

#### 5. Type-generation script

**File**: `package.json`

**Intent**: Keep regeneration a one-liner so it actually happens after each migration.

**Contract**: `"db:types": "supabase gen types typescript --local --schema public > src/db/database.types.ts"`.

#### 6. Exclude the generated types from ESLint (added during implementation)

**File**: `eslint.config.js`

**Intent**: Not in the plan as written. Supabase's generator does not emit
Prettier-formatted output, so linting `src/db/database.types.ts` produced 68
`prettier/prettier` errors — and `--fix`ing them would be undone by the next
regeneration. The repo already has this exact case: `worker-configuration.d.ts` is
ignored for the same reason (`eslint.config.js:76`, `CLAUDE.md`).

**Contract**: `src/db/database.types.ts` added to the existing `ignores` entry alongside
`worker-configuration.d.ts`. TypeScript still checks the file — it is imported by
`src/lib/supabase.ts`, which is linted.

**What the typed client actually buys** (measured, not assumed — a deliberate-typo probe
compiled against `tsc --noEmit`): a wrong **table** name is caught (`TS2769`) and a wrong
column in an **insert/update** payload is caught (`TS2353`), but a wrong column inside a
`.select("...")` **string is not** — this version of `supabase-js` does not parse the
projection string at type level. So the parameterization is load-bearing for writes and
decorative for read projections. Worth knowing before trusting it in `S-01b`.

### Success Criteria:

#### Automated Verification:

- `npx supabase db reset` applies the migration and the seed with no error
- `psql` / Studio shows `public.buildings` with RLS enabled and exactly 8 policies
- Inserting a duplicate `(name, city, street)` is rejected by the unique constraint
- `npx supabase seed` run twice does not error and does not create a second demo building
- `src/db/database.types.ts` contains a `buildings` entry under `public.Tables`
- `npx astro sync && npm run lint && npm run build` all pass

#### Manual Verification:

- In Studio, the buildings table shows the seeded demo building
- Policy list reads as 4 × `authenticated` + 4 × `anon` with the anon set denying

**Implementation Note**: Pause for human confirmation after automated verification.

---

## Phase 3: The screens

### Overview

The user-visible half: a list, a form, an endpoint that writes, and the middleware entry that
protects all three.

### Changes Required:

#### 1. Protect the new routes

**File**: `src/middleware.ts`

**Intent**: `PROTECTED_ROUTES` is the only auth gate in the app — a new page is unprotected
until listed. Both the pages and the write endpoint need covering.

**Contract**: `"/buildings"` and `"/api/buildings"` added to `PROTECTED_ROUTES`. Matching is
`startsWith`, so both cover everything added underneath them later (`/buildings/new` today,
`/buildings/[id]` in `S-01b`).

#### 2. The create endpoint

**File**: `src/pages/api/buildings/index.ts`

**Intent**: Write the row. Shape must match the existing auth endpoints, not invent a new one.

**Contract**: `POST`, reads **form data** (not JSON), responds with `context.redirect()`
carrying `?error=<message>` on failure and redirecting to `/buildings` on success — the shape
`CLAUDE.md:38` mandates and `src/pages/api/auth/signin.ts` demonstrates. Handles the `null`
client branch. Server-side validation of all three fields (non-empty, trimmed, length
bound). A unique-violation (Postgres `23505`) is translated to a Polish message — *"Budynek o
tej nazwie i adresie już istnieje."* — rather than surfacing the raw Postgres error.

#### 3. The form island

**File**: `src/components/buildings/BuildingForm.tsx`

**Intent**: Three required fields — `name`, `city`, `street` — with client-side validation,
mirroring `SignInForm.tsx` so the codebase has one form idiom rather than two. Polish labels:
*Nazwa budynku*, *Miejscowość*, *Ulica i numer*.

**Contract**: React island rendered `client:load`. Reuses `FormField`, `SubmitButton`,
`ServerError` from `src/components/auth/`. `method="POST"` `action="/api/buildings"`,
`noValidate`, blocking submit on invalid input. Props: `serverError?: string | null`.
Field labels and validation messages in Polish (user-facing copy is Polish per `CLAUDE.md`).

#### 4. The pages

**File**: `src/pages/buildings/index.astro`, `src/pages/buildings/new.astro`

**Intent**: List what exists; offer the form. The list is the screen `S-01b` will extend with
a per-building link into the unit import.

**Contract**: Both use `Layout.astro`. `index.astro` queries buildings server-side through the
middleware-built client, handles the `null` client, renders an empty state ("Nie ma jeszcze
żadnego budynku") plus a link to `/buildings/new`. `new.astro` reads `error` from
`Astro.url.searchParams` and passes it into `BuildingForm` as `serverError` — the pattern at
`src/pages/auth/signin.astro:5`.

#### 5. Dashboard entry point

**File**: `src/pages/dashboard.astro`

**Intent**: Give the administrator a way to reach the new screens without typing a URL.

**Contract**: One link to `/buildings`. Nothing else on the page changes.

### Success Criteria:

#### Automated Verification:

- `npx astro sync && npm run lint && npm run build` all pass
- `curl -i http://localhost:4321/buildings` while signed out returns a redirect to `/auth/signin`
- `curl -i -X POST http://localhost:4321/api/buildings -H "Origin: http://localhost:4321" --data 'name=X&city=Y&street=Z'` while signed out redirects to `/auth/signin`
- Signed in, the same POST returns a 302 to `/buildings`, and the row exists in the database
- Posting the same name, city and street twice returns a 302 carrying `?error=` rather than a 500

#### Manual Verification:

- Creating a building through the browser puts it on the `/buildings` list
- Submitting an empty form shows client-side field errors and never reaches the server
- The duplicate message reads as intended Polish, not a Postgres string
- The empty state renders sensibly when the database has no buildings

**Implementation Note**: Pause for human confirmation after automated verification.

---

## Phase 4: Production and the record

### Overview

Apply the same migration to the production project, ship the code, verify on the live Worker,
and update the documents that go stale.

### Changes Required:

#### 1. Link the project

**File**: none — CLI.

**Intent**: `supabase/.temp/` holds no `project-ref`, so the CLI cannot reach production yet.

**Contract**: `npx supabase link --project-ref <ref>`. The ref comes from the Supabase
dashboard — do not guess it.

#### 2. Apply the migration to production

**File**: none — CLI.

**Intent**: Nothing in CI applies migrations (residual G14), so this is a deliberate manual
step against the live database.

**Contract**: `npx supabase db push --dry-run` first, and **every line of its output gets
read** before the real run. Then `npx supabase db push`. Never `--include-all` (it would push
anything else missing from the remote history table) and never `--include-seed` (the seed
mints an administrator, which this project forbids against production).

#### 3. Ship the code

**File**: none — git.

**Intent**: Push to `main` deploys (`CLAUDE.md`). Migration first, code second — code that
queries a table that does not exist yet would take production down between the two steps.

**Contract**: Push after `db push` succeeds. `deploy.yml` runs
`lint → build → wrangler deploy → curl /api/health` and the health assertion must stay green.

#### 4. Update the durable record

**File**: `CLAUDE.md`, `context/foundation/roadmap.md`, `README.md`

**Intent**: The "Current state" section of `CLAUDE.md` is deliberately the only place these
facts live, and it is now wrong in three ways: the repo has domain code, the seed is no longer
unexercised, and the data layer is no longer empty.

**Contract**:
- `CLAUDE.md` — "No domain code yet" replaced; the seed bullet loses "unexercised" and records the first real run; a note that migrations are applied by hand (G14 still open) and that `src/db/database.types.ts` is generated output regenerated via `npm run db:types`.
- `context/foundation/roadmap.md` — `S-01` status `proposed → done` in both the At-a-glance table and the slice section; Backlog Handoff row updated; `S-01b` becomes ready.
- `README.md` — a short "local database" note: `supabase start`, `db reset`, and the fact that Docker is now a real prerequisite.

### Success Criteria:

#### Automated Verification:

- `npx supabase db push --dry-run` lists exactly one migration
- `npx supabase db push` completes without error
- `npx supabase gen types typescript --linked --schema public` produces a file identical to the committed one (proves local and production schemas match)
- The `deploy.yml` run for the push is green, including the `/api/health` assertion
- `curl -i https://estate-manager.estate-manager.workers.dev/buildings` returns a redirect to `/auth/signin` when signed out

#### Manual Verification:

- Signing in on production, creating a building, and seeing it listed — the full round trip on the live Worker
- The Supabase dashboard shows `buildings` with RLS enabled and 8 policies on the production project
- A reader who knows nothing of this change can tell from `CLAUDE.md` alone that the data layer exists and how migrations get applied

**Implementation Note**: Pause for human confirmation. This phase touches production data —
the `db push` step is irreversible.

---

## Testing Strategy

There is no test runner in this project and none is being added (`CLAUDE.md:19`). "Automated"
here means lint, build, CLI exit codes and `curl` assertions — the same standing convention
`F-01` and `F-02` used.

### Manual Testing Steps:

1. `npx supabase db reset`, then sign in locally with `test@test.com` / `Test123!`
2. Visit `/buildings` — the demo building from the seed is listed
3. Create a building through `/buildings/new`; confirm it appears in the list
4. Submit the identical name, city and street again; confirm the Polish duplicate message
5. Submit an empty form; confirm client-side validation blocks it
6. Sign out; confirm `/buildings` and `/buildings/new` both bounce to `/auth/signin`
7. Repeat steps 2–6 against production after Phase 4

## Performance Considerations

Not a concern at this size — one table, a handful of rows, one query per page render.
`infrastructure.md` §G1 notes that render cost grows with data volume rather than traffic;
that becomes relevant at the tally view (`S-05`), not here.

One forward-looking note: policies that filter on a column want that column indexed. This
table's policies have no column predicate, so nothing to index yet beyond the primary key and
the unique constraint. `S-01b` introduces `building_id` scoping and should index it.

## Migration Notes

This is the project's first migration, so it also establishes the operational shape:

- Migrations are applied **by hand** (`db push`) — no pipeline does it. Residual G14 stays open.
- Forward-only. `wrangler rollback` reverts code, never schema. Anything destructive needs a hand-written reversal and, per `infrastructure.md:126`, a human rather than an agent.
- The order is always: apply migration → then deploy code. Reversed, production serves code querying a table that does not exist.
- `src/db/database.types.ts` is regenerated (`npm run db:types`) and committed in the same commit as the migration that changed the schema.

## References

- Roadmap item: `context/foundation/roadmap.md` → `S-01`
- PRD: `context/foundation/prd.md` (v4) → `FR-011`, `FR-001`, `## Access Control`, `## Non-Goals`
- Change identity: `context/changes/building-create/change.md`
- Seed debt: `context/changes/production-admin-access/plan.md:640-659`
- Form / endpoint pattern: `src/components/auth/SignInForm.tsx`, `src/pages/api/auth/signin.ts:1-20`
- Auth gate: `src/middleware.ts:6`
- Residual G14 (no migration history): `context/changes/deployment/deployment.md:146`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Local stack and the unexercised seed

#### Automated

- [x] 1.1 `docker info` exits 0 — 52b3e11
- [x] 1.2 `npx supabase start` brings the stack up and prints API URL, anon key and Studio URL — 52b3e11
- [x] 1.3 `npx supabase db reset` completes without error — 52b3e11
- [x] 1.4 seed re-run is idempotent — `supabase seed` has no sql_paths subcommand in CLI 2.98, so `seed.sql` was replayed directly (`INSERT 0 0`, counts unchanged) — 52b3e11
- [x] 1.5 `npx astro sync && npm run lint && npm run build` all pass — 52b3e11

#### Manual

- [x] 1.6 Signing in locally with `test@test.com` / `Test123!` succeeds and lands on `/dashboard` — 52b3e11
- [x] 1.7 Studio shows the seeded user under Authentication → Users — 52b3e11

### Phase 2: The buildings table, its access contract, and generated types

#### Automated

- [x] 2.1 `npx supabase db reset` applies the migration and the seed with no error
- [x] 2.2 `public.buildings` has RLS enabled and exactly 8 policies — verified in `pg_policy` AND through PostgREST (anon select `[]`, anon insert `42501`, authenticated select + insert `201`)
- [x] 2.3 Inserting a duplicate `(name, city, street)` is rejected by the unique constraint — blank-field check constraints verified too
- [x] 2.4 seed replayed against the live database: `INSERT 0 0` ×3, building count stays 1
- [x] 2.5 `src/db/database.types.ts` contains a `buildings` entry under `public.Tables`
- [x] 2.6 `npx astro sync && npm run lint && npm run build` all pass

#### Manual

- [x] 2.7 Studio shows the seeded demo building in the buildings table
- [x] 2.8 Policy list reads as 4 × `authenticated` + 4 × `anon` with the anon set denying

### Phase 3: The screens

#### Automated

- [ ] 3.1 `npx astro sync && npm run lint && npm run build` all pass
- [ ] 3.2 `GET /buildings` while signed out redirects to `/auth/signin`
- [ ] 3.3 `POST /api/buildings` while signed out redirects to `/auth/signin`
- [ ] 3.4 Signed in, `POST /api/buildings` returns 302 to `/buildings` and the row exists
- [ ] 3.5 Posting a duplicate name, city and street returns 302 with `?error=` rather than a 500

#### Manual

- [ ] 3.6 Creating a building in the browser puts it on the `/buildings` list
- [ ] 3.7 Empty-form submit shows client-side errors and never reaches the server
- [ ] 3.8 The duplicate message reads as intended Polish
- [ ] 3.9 The empty state renders sensibly with no buildings in the database

### Phase 4: Production and the record

#### Automated

- [ ] 4.1 `npx supabase db push --dry-run` lists exactly one migration
- [ ] 4.2 `npx supabase db push` completes without error
- [ ] 4.3 `gen types --linked` output is identical to the committed file
- [ ] 4.4 The `deploy.yml` run is green including the `/api/health` assertion
- [ ] 4.5 `GET /buildings` on production redirects to `/auth/signin` when signed out

#### Manual

- [ ] 4.6 Full round trip on production: sign in, create a building, see it listed
- [ ] 4.7 Supabase dashboard shows `buildings` with RLS and 8 policies on the production project
- [ ] 4.8 `CLAUDE.md` alone tells a new reader that the data layer exists and how migrations get applied
