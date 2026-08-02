# Building Units Import Implementation Plan

## Overview

Roadmap item `S-01b`. An administrator opens a building created by `S-01`, uploads a CSV
listing its units — number, floor area, owner name, owner e-mail — reviews a preview in
which every unit already carries its computed share, confirms, and lands on a registry
whose shares sum to exactly 100.00%.

Behind that flow sit the two things this slice really delivers: the **data model the rest
of the product stands on** (`S-02` issues one voting link per unit, `S-03` weighs a vote by
its unit's share, `S-05` measures the 50% threshold against the sum of all shares) and the
**first table in the project holding other people's personal data**, which is where the PRD
guardrail *"dane właścicieli nie wychodzą poza budynek"* stops being a sentence and becomes
a set of policies.

## Current State Analysis

**The building half is done and its patterns are worth copying, not re-deciding.**
`S-01` landed in four commits (`52b3e11`, `452f837`, `088b77a`, `289c047`).
`supabase/migrations/20260801222109_create_buildings.sql` is the only migration; it wraps
everything in `begin; … commit;`, enables RLS, and writes eight policies — four operations ×
two roles, `anon` denied explicitly. Its comment at line 69 predicts this change: *"When
S-01b introduces building_id scoping, that is where predicates stop being `true`."* That
prediction is **deliberately not fulfilled here** — see Phase 1, decision note.

**The demo building is an empty import target by design.** `supabase/seed.sql:98-112`
inserts `Wspólnota Mieszkaniowa Kwiatowa 3` idempotently and says so in a comment: *"so
`/buildings` has something to show after a reset and S-01b has a ready import target."* It
seeds no units, and this plan keeps it that way — a seeded registry would make the
"registry must be empty" precondition untestable locally.

**The write idiom is form data plus redirect, never JSON.** `src/pages/api/buildings/index.ts`
reads `context.request.formData()`, validates field by field, and returns
`context.redirect("/buildings/new?error=…")` on failure. `CLAUDE.md:38` mandates that shape.
`BuildingForm.tsx` is the client half: a React island posting to the endpoint, reusing
`FormField` / `SubmitButton` / `ServerError` from `src/components/auth/`.

**`FormField` cannot carry a file.** `src/components/auth/FormField.tsx` is built around
`value` / `onChange` for text. The upload control is genuinely new UI, not a reuse.

**The typed client protects writes, not read projections.** `building-create/plan.md:315-320`
records a measured result: a wrong table name is caught (`TS2769`) and a wrong column in an
insert payload is caught (`TS2353`), but a wrong column inside a `.select("…")` string is
**not** — this version of `supabase-js` does not parse the projection at type level.

**`PROTECTED_ROUTES` already covers everything this change adds.** `src/middleware.ts:6`
holds `["/dashboard", "/api/email", "/buildings", "/api/buildings"]`, matched with
`startsWith`. No middleware edit is required — verified against the paths in Phase 3.

**There is no test runner and none is being added** (`CLAUDE.md:19`). "Automated" here means
lint, build, CLI exit codes, `psql` assertions and `curl`.

**Migrations are applied by hand.** No pipeline runs `db push`; residual **G14** in
`context/changes/deployment/deployment.md:146` stays open. `db push` is forward-only and
`wrangler rollback` reverts code, never schema.

## Desired End State

A signed-in administrator opens `/buildings`, clicks a building, and sees either its unit
registry or an empty state offering an import. Choosing the import lands on a page that both
offers an empty CSV template to download and takes the filled-in file back. Uploading a
well-formed file shows a preview: every unit
with its number, area, owner, and computed share, plus a total row reading exactly
**100,00%**. Confirming writes owners and units in one atomic call and returns to the
registry. Uploading a malformed file shows **every** problem at once, with line numbers, and
writes nothing. Uploading into a building that already has units is refused with a readable
Polish message.

Underneath: `public.owners` and `public.units` exist with sixteen policies between them, a
composite foreign key that makes a cross-building unit unrepresentable,
`public.buildings.total_area_m2` holding the imported registry's total floor area, deferred
constraint triggers asserting that shares per building total 10000 basis points **and** that
the stored total area matches the units it came from, and
`public.import_building_units(uuid, jsonb)` as the single write path — `security invoker`, so
RLS still applies.

### Key Discoveries:

- Astro's own recipe (`docs/en/recipes/build-forms.mdx`) confirms an on-demand-rendered
  `.astro` page handles `POST` through `Astro.request.method === "POST"` and
  `await Astro.request.formData()`. The preview step therefore needs no extra API route.
- Supabase's function guidance (`examples/prompts/database-functions.md`) is explicit:
  default to `security invoker`, always `set search_path = ''`, and fully qualify every
  object reference. `security definer` here would turn the import into an RLS bypass.
- `supabase-js` has no multi-statement transaction. Two tables written all-or-nothing means
  one `rpc` call to a `plpgsql` function — there is no client-side alternative.
- Astro resolves static routes before dynamic ones, so adding `src/pages/buildings/[id]/`
  does not shadow the existing `src/pages/buildings/new.astro`.
- A `check` constraint cannot span rows, so "shares total 100%" is not expressible as a
  column or table check. A **deferred** constraint trigger is the only in-database form —
  and it must be deferred, or the first row of a multi-row insert fails against a total that
  is only correct once every row has landed.
- `supabase/seed.sql:19-22` corrects an earlier belief: `npx supabase seed` does **not**
  re-run `[db.seed]` outside a wipe — CLI 2.98 only exposes a `buckets` subcommand.
  Idempotency is verified by replaying the file by hand.

## What We're NOT Doing

- **Not editing or deleting units through the UI.** The registry is static in v1 (PRD
  `## Non-Goals`). `update` / `delete` policies exist because the convention demands one per
  operation, not because a screen uses them.
- **Not accepting XLSX.** CSV only — decided during questioning. A parser for a ZIP-based
  format on workerd is cost this slice does not need.
- **Not building a column-mapping screen.** Fixed header names, plus a downloadable template.
- **Not modelling co-ownership.** PRD `## Non-Goals`: one unit = one voter holding the whole
  share.
- **Not seeding units.** The demo building stays empty so the "registry must be empty"
  precondition is exercisable after every `db reset`.
- **Not narrowing `authenticated` policies by building.** See the decision note in Phase 1.
- **Not touching e-mail.** Owner addresses are stored; nothing is sent. That is `S-04`.
- **Not creating voting links or any owner-facing page.** That is `S-02` / `S-03`.
- **Not adding a migration step to CI.** Residual G14 stays open.
- **Not adding a test runner.** `CLAUDE.md:19`.

## Implementation Approach

Four phases, each ending in one commit — the shape that worked for `S-01`.

The ordering puts the **schema and the arithmetic before any screen**. Those two carry all
the correctness risk in this slice: a wrong share is not a visual bug, it is a wrong
resolution outcome months later, and there is no test runner standing behind it. Phase 2 is
deliberately UI-free so the arithmetic can be executed and inspected directly rather than
through a browser.

**Note on the branch.** `context/foundation/lessons.md` records the rule *"always commit
straight to `main`, never a feature branch."* This change is being developed in a git
worktree on `worktree-building-units-import` at the user's explicit request, to exercise two
parallel Claude sessions. The rule stands: the branch exists for worktree mechanics only and
merges back into `main` as a fast-forward, with no pull request. Phase 4 does the merge
before pushing.

## Critical Implementation Details

**Both constraint triggers must be `deferrable initially deferred`.** An immediate trigger
evaluates after each row, so row 1 of a 70-row insert would be checked against a total of
~1.4% and fail. Deferred, the check runs once at commit — which is also the only reason the
import can write units and `buildings.total_area_m2` as two separate statements and still be
checked as one consistent state.

**Order within Phase 1 is fixed:** write migration → `npx supabase db reset` (applies it) →
`npm run db:types` (generates from the applied schema) → lint. Generating types first yields
a `Database` type with neither table nor function and a lint failure that reads like a code
bug. This is the same trap `building-create/plan.md:113-117` documents.

**The confirm step re-parses; it never trusts the client.** The preview carries the original
CSV text in a hidden field, and the confirm handler runs the identical parse-and-compute path
server-side. Shares posted by a browser are ignored — a client that edited them could
otherwise assign itself any voting weight it liked. Determinism is what makes this safe: the
same bytes must yield the same shares, which is why the largest-remainder tie-break is
resolved by file order rather than by anything float-derived.

---

## Phase 1: Schema, access contract, and the atomic write path

### Overview

One migration creating both tables, sixteen policies, the cross-building integrity
constraint, the share-total trigger, and the import function. Then regenerated types.

### Changes Required:

#### 1. The migration

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_create_units_and_owners.sql`

**Intent**: Create the registry tables and the single write path into them, with the access
contract `S-01` established applied to data that actually matters.

**Contract**: One transaction (`begin; … commit;`), matching `20260801222109_create_buildings.sql`.

`public.owners`:

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | primary key, `default gen_random_uuid()` |
| `building_id` | `uuid` | `not null`, `references public.buildings(id) on delete cascade` |
| `full_name` | `text` | `not null`, trimmed-non-empty check |
| `email` | `text` | **nullable** — trimmed-non-empty check when present |
| `created_at` | `timestamptz` | `not null default now()` |

Plus `unique (id, building_id)` — not redundant: it is what the composite foreign key below
references. Plus a partial unique index `(building_id, lower(email)) where email is not null`,
which is where the "same address means the same person" decision is enforced by the database
rather than only by the importer.

`public.units`:

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | primary key, `default gen_random_uuid()` |
| `building_id` | `uuid` | `not null`, `references public.buildings(id) on delete cascade` |
| `owner_id` | `uuid` | `not null` |
| `unit_number` | `text` | `not null`, trimmed-non-empty check |
| `area_m2` | `numeric(8,2)` | `not null`, `check (area_m2 > 0)` |
| `share_bps` | `integer` | `not null`, `check (share_bps > 0)` — hundredths of a percent; the building totals 10000 |
| `created_at` | `timestamptz` | `not null default now()` |

Plus `unique (building_id, unit_number)`, an index on `building_id`, an index on `owner_id`,
and the composite foreign key:

```sql
constraint units_owner_same_building_fkey
  foreign key (owner_id, building_id)
  references public.owners (id, building_id)
  on delete restrict
```

That single constraint makes "a unit pointing at an owner from another building"
unrepresentable, which is the PRD guardrail *"dane właścicieli nie wychodzą poza budynek"*
expressed as schema rather than as a policy predicate someone has to remember to write.

**Why `share_bps` is an integer**: the threshold rule in `S-05` compares sums, and the only
representation that cannot drift is one where the comparison is integer arithmetic —
`sum_for * 2 > 10000`. Storing the share as a rounded percentage was chosen during
questioning; storing it as hundredths-of-a-percent integers is that decision in the form that
keeps the comparison exact.

One column is added to the existing table:

```sql
alter table public.buildings
  add column total_area_m2 numeric(10,2)
  constraint buildings_total_area_positive check (total_area_m2 is null or total_area_m2 > 0);
```

`null` means "no registry imported yet" — the state every building starts in and the one the
`S-01` demo building is still in. The column is written by the import function and by nothing
else. `numeric(10,2)` rather than `(8,2)`: a per-unit area fits in eight digits, a sum of up
to 1000 of them does not.

This is a **denormalization**, accepted deliberately: the value is recoverable at any time as
`sum(units.area_m2)`, so storing it buys convenience rather than information. That is exactly
why change 3 below extends to cover it — an aggregate kept in two places is only worth having
if something guarantees the two agree. FR-011's extensibility clause is what makes this an
additive migration rather than a reshape.

#### 2. Row level security

**File**: same migration

**Intent**: Apply the eight-policy pattern from `buildings` to both new tables.

**Contract**: `enable row level security` on both. Sixteen policies total — per table, four
operations × two roles: `authenticated` with predicate `true` (`using` for
select/update/delete, `with check` for insert/update, **both** for update), `anon` with
predicate `false` on all four.

**Decision note — why `authenticated` is not scoped by building.** The comment at
`20260801222109_create_buildings.sql:69` anticipated that this change would introduce
`building_id` scoping. It does not, deliberately. PRD `## Access Control` states that v1 has
no roles model and **every user in the database is an administrator**; there is no table
binding a user to a building, and inventing one here would be designing the v2 access model
inside a file-import slice. A predicate that resolves to `true` for every caller is worse
than an honest `true` — it reads as a restriction at review time while restricting nothing.
What actually protects owner data in v1 is the explicit `anon` denial, and that is written
out. The real scoping arrives in `S-02`, when the per-unit token gives the unauthenticated
path a subject to scope *to*. The `building_id` index is created here so that predicate lands
on an indexed column when it comes.

#### 3. The registry invariants

**File**: same migration

**Intent**: Keep two things true no matter which path writes: shares in a building total
100.00%, and `buildings.total_area_m2` equals the sum of that building's unit areas. The
`authenticated` policies permit `update` and `delete` on all three tables, so without this
both would rest on nobody using the API directly.

**Contract**: one shared assertion plus two thin trigger wrappers, so the rule is written
once and enforced from both sides of the relationship.

`public.assert_building_registry(p_building_id uuid)` — a plain `void` function,
`security invoker`, `set search_path = ''`. For the given building it reads the unit count,
`sum(share_bps)`, `sum(area_m2)` and the stored `total_area_m2`, then asserts:

| Unit count | Required |
| --- | --- |
| 0 | `total_area_m2` is `null` |
| > 0 | `sum(share_bps) = 10000` **and** `total_area_m2 = sum(area_m2)` |

A building with no units is a legal state — it is the state every building starts in, and the
one `db reset` leaves the demo building in. Failures raise with `errcode = 'EM003'` (share
total) or `'EM004'` (area total). Messages are English: this is not user-facing copy, the API
route maps the codes to Polish.

Two constraint triggers call it, both **deferrable initially deferred** so the assertion runs
once at commit rather than after each row:

```sql
create constraint trigger units_registry_check
  after insert or update or delete on public.units
  deferrable initially deferred
  for each row execute function public.assert_units_registry();

create constraint trigger buildings_registry_check
  after insert or update on public.buildings
  deferrable initially deferred
  for each row execute function public.assert_buildings_registry();
```

The two wrappers exist only because the building id lives under a different column name on
each side — `new.building_id` on units, `new.id` on buildings. Both resolve it and delegate.

**Why the second trigger.** The units-side trigger alone would leave `total_area_m2` editable
to any value through a direct `update` on `buildings`, since the `authenticated` policy allows
it and no unit row changes. Guarding the share total but not the area total would be the
worse kind of inconsistency: a reader would reasonably assume both aggregates carry the same
guarantee.

#### 4. The import function

**File**: same migration

**Intent**: One atomic call that writes owners and units together, refuses a non-empty
registry, and gives the API distinguishable failure codes.

**Contract**: `public.import_building_units(p_building_id uuid, p_rows jsonb) returns integer`
— `language plpgsql`, `security invoker`, `set search_path = ''`, fully qualified references
throughout, returning the number of units written.

`p_rows` is an ordered JSON array of
`{ unit_number, area_m2, share_bps, full_name, email }`, where `area_m2` is a **decimal
string** (never a JSON number — see Phase 2) and `email` is `null` when absent.

Behaviour, in order:

1. No visible row in `public.buildings` for `p_building_id` → raise, `errcode = 'EM001'`.
   Because the function is `security invoker`, this also covers "hidden by RLS", which is the
   correct answer to give either way.
2. Any existing row in `public.units` for the building → raise, `errcode = 'EM002'`.
3. Insert owners, then units.
4. `update public.buildings set total_area_m2 = (select sum(area_m2) from public.units where
   building_id = p_building_id) where id = p_building_id`. Derived from the rows that actually
   landed rather than from the payload, so the stored total can only ever describe what is in
   the table. The deferred triggers verify it at commit — if this line were ever dropped, the
   import would fail loudly with `EM004` instead of quietly storing nothing.

The owner-deduplication key is the non-obvious part. Rows sharing an e-mail collapse into one
owner; rows without one stay separate, keyed by their position:

```sql
with rows as (
  select
    ordinality as row_no,
    r ->> 'email' as email,
    coalesce(lower(r ->> 'email'), 'row:' || ordinality::text) as owner_key,
    ...
  from jsonb_array_elements(p_rows) with ordinality as t(r, ordinality)
)
```

Owners are inserted `distinct on (owner_key)`, then units join back on the same key. The
partial unique index from change 1 is the backstop if the key logic is ever wrong.

#### 5. Regenerated types

**File**: `src/db/database.types.ts`

**Intent**: Pick up both tables and the function so `.from("units")`, `.from("owners")` and
`.rpc("import_building_units", …)` are typed.

**Contract**: Output of `npm run db:types` (the script `S-01` added), committed in the same
commit as the migration. Generated output — never hand-edited. It is already excluded from
ESLint (`eslint.config.js`) and still checked by TypeScript.

### Success Criteria:

#### Automated Verification:

- `npx supabase db reset` applies migration and seed with no error
- `public.units` and `public.owners` each report RLS enabled and exactly 8 policies in `pg_policy`
- A unit referencing an owner from a different building is rejected by `units_owner_same_building_fkey`
- Inserting units whose `share_bps` total is not 10000 is rejected at commit by the deferred trigger; a multi-row insert totalling exactly 10000 succeeds
- Setting `buildings.total_area_m2` to a value other than `sum(units.area_m2)` by direct `update` is rejected at commit with `EM004`
- Inserting units without updating `total_area_m2` is rejected with `EM004` — the two writes only pass together
- Deleting every unit in a building succeeds when `total_area_m2` is nulled in the same transaction, and fails otherwise
- `import_building_units` against a building that already has units raises `EM002`; against an unknown id raises `EM001`
- A successful `import_building_units` call collapses two rows sharing an e-mail into one `owners` row and leaves two rows without e-mail as two owners
- After that call, `buildings.total_area_m2` equals `sum(units.area_m2)` to the cent
- `src/db/database.types.ts` contains `units` and `owners` under `public.Tables`, `total_area_m2` on `buildings`, and `import_building_units` under `public.Functions`
- `npx astro sync && npm run lint && npm run build` all pass

#### Manual Verification:

- Studio shows both tables with the demo building still holding zero units and `total_area_m2` empty
- The policy list reads 4 × `authenticated` + 4 × `anon` per table, with the `anon` set denying

**Implementation Note**: Pause for human confirmation after automated verification.

---

## Phase 2: CSV parser and share arithmetic

### Overview

Two pure modules with no Astro or Supabase imports, so both can be executed directly and
inspected. This is where the correctness of every later resolution outcome is decided.

### Changes Required:

#### 1. The parser

**File**: `src/lib/units-csv.ts`

**Intent**: Turn uploaded bytes into validated rows, or into a complete list of everything
wrong with the file. "Complete" is the requirement — a 70-row file with five typos must
produce five messages, not one.

**Contract**: `parseUnitsCsv(bytes: Uint8Array): ParseResult`, where `ParseResult` is
`{ ok: true; rows: ParsedRow[] } | { ok: false; errors: ParseError[] }` and `ParseError` is
`{ line: number; message: string }` with 1-based line numbers counting the header as line 1.
Messages are Polish — they are shown to the administrator verbatim.

Decoding: strip a UTF-8 BOM, then `new TextDecoder("utf-8", { fatal: true })`. A decode
failure produces one error telling the administrator to save the file as UTF-8, and stops —
line numbers are meaningless once the bytes did not decode. (A Windows-1250 fallback is
attractive because that is what Polish Excel writes by default; whether workerd's
`TextDecoder` exposes that label is to be checked during implementation and added only if it
does. The plan does not depend on it.)

Format: `;` separated, `"` quoting with `""` as an escaped quote, `\r\n` or `\n` line
endings, trailing blank lines ignored. Header names are matched case-insensitively after
trimming and may appear in any order: `numer_lokalu`, `metraz`, `imie_nazwisko`, `email`.

Those four names are exported as `CSV_HEADERS`, in declaration order. Phase 3's template
route emits exactly this constant, which is the mechanism keeping the file the administrator
downloads and the file the parser accepts from ever disagreeing.

Per-row validation, all violations collected:

- wrong number of fields for the header width
- `numer_lokalu` — non-empty, ≤ 50 chars, **unique within the file** (a duplicate reports both lines)
- `metraz` — comma or dot decimal, at most 2 decimal places, > 0, ≤ 10000; parsed into an **integer number of hundredths of m²**, never a float
- `imie_nazwisko` — non-empty, ≤ 200 chars
- `email` — optional; when present, must contain a single `@` with non-empty sides and no whitespace, ≤ 320 chars
- file-level: at least one data row, at most 1000 rows

`ParsedRow` carries `unitNumber`, `areaHundredths` (integer), `fullName`, `email: string | null`.

#### 2. Share arithmetic

**File**: `src/lib/shares.ts`

**Intent**: Convert areas into shares that total exactly 10000 basis points, by the largest
remainder method, deterministically.

**Contract**: `computeShareBps(areaHundredths: number[]): number[] | { error: string }`.
Integer arithmetic throughout — no floating point at any step.

For each unit, `exact = area_i * 10000 * SCALE / total`; the share is `floor(exact / SCALE)`
and the remainder is `exact % SCALE`. The leftover, `10000 − sum(floors)`, is distributed one
basis point at a time to the units with the largest remainders. **Ties are broken by input
index ascending** — file order — which is what makes a re-parse of the same bytes produce
byte-identical shares, and therefore what makes the confirm step safe.

Failure case: a unit whose floor is 0 and which receives no leftover would end at 0 bps,
violating `check (share_bps > 0)` and describing a unit that can never affect a vote. The
function returns an error naming the unit rather than producing it. At 70 units the smallest
plausible share is ~140 bps, so this is a guard against a pathological file, not an expected
path.

#### 3. Verification harness (not committed)

**File**: none in the repo — a throwaway script under `$CLAUDE_JOB_DIR/tmp`

**Intent**: Execute the arithmetic rather than reason about it, without adding a test runner
(`CLAUDE.md:19`).

**Contract**: Both modules are dependency-free TypeScript, so
`node --experimental-strip-types <script>.ts` runs them directly on the pinned Node 22.14.
The script asserts: 70 equal areas total 10000; a 3-unit file of 1/3 each totals 10000 with
shares 3334/3333/3333; the seeded realistic file totals 10000; the same input twice yields
identical output; a file with a 0.01 m² unit beside a 1000 m² unit returns the error. Output
is pasted into the phase commit message; nothing is committed.

### Success Criteria:

#### Automated Verification:

- `node --experimental-strip-types` runs the harness and every assertion passes, including the 1/3 case and the determinism check
- A CSV with five distinct defects produces five errors with correct line numbers
- A Windows-1250 encoded file produces the "save as UTF-8" error rather than mangled names
- A file with duplicate `numer_lokalu` reports both offending lines
- `npx astro sync && npm run lint && npm run build` all pass

#### Manual Verification:

- Reading `shares.ts`, the largest-remainder distribution and its tie-break are followable without running it
- The Polish error messages read as instructions to a non-technical administrator, not as parser diagnostics

**Implementation Note**: Pause for human confirmation after automated verification.

---

## Phase 3: The screens

### Overview

Building detail, upload, preview, confirm, registry. No middleware change — the existing
`/buildings` and `/api/buildings` prefixes already cover every path added here.

### Changes Required:

#### 1. Building detail with the registry

**File**: `src/pages/buildings/[id]/index.astro` (new)

**Intent**: The screen a building now has: its address, its unit registry, and — while the
registry is empty — the way in to the import.

**Contract**: Server-side query of the building plus its units joined to owners, ordered by
`unit_number`. Handles the `null` client branch (`CLAUDE.md:21`) and a missing building
(404-shaped message, not a crash). Renders a table of unit number, area, share formatted as
`X,YZ%`, owner name, and e-mail or a muted *"brak"*, with a total row reading **100,00%**
alongside the building's total floor area read from `buildings.total_area_m2` — the column is
displayed, not recomputed, which is the whole point of storing it.
When there are no units: an empty state and a link to the import. Visual language follows
`src/pages/buildings/index.astro`.

Astro resolves static routes before dynamic ones, so this does not shadow
`src/pages/buildings/new.astro`.

#### 2. Link the list to the detail

**File**: `src/pages/buildings/index.astro`

**Intent**: Reach the registry without typing a URL.

**Contract**: Each list item becomes a link to `/buildings/{id}`. Nothing else changes.

#### 3. Upload and preview

**File**: `src/pages/buildings/[id]/units/import.astro` (new)

**Intent**: One page, two states — upload, then preview — using Astro's documented
form-handling recipe rather than a second route.

**Contract**: On `GET`, renders three things in one place: a **download link for the empty CSV
template** (`/api/buildings/units-template.csv`), a short description of the four required
columns and their format — decimal comma in `metraz`, `email` optional — and the upload
island. Download and upload deliberately share one page: the administrator who has no file
yet and the one who has just filled it in are the same person, minutes apart.

On `POST`, reads the uploaded file via
`Astro.request.formData()`, runs `parseUnitsCsv` then `computeShareBps`, and renders either
the error list (line number + message, upload form still present) or the preview table.

The preview shows every row with its computed share, a total of **100,00%**, and the summed
floor area — the number that is about to be written to `buildings.total_area_m2`, shown before
it is stored rather than after, because a mistyped area is easiest to spot against a total the
administrator already knows. It carries the **original CSV text** in a hidden field of the
confirm form. The confirm form posts to
`/api/buildings/[id]/units`.

Guards before parsing: reject a missing file, a file over 1 MB, and a `content-type` that is
neither `text/csv` nor `application/vnd.ms-excel` (what browsers send for `.csv`) nor
`text/plain`. Refuse outright when the building already has units, so the administrator
learns that before choosing a file rather than after.

#### 4. The upload island

**File**: `src/components/buildings/UnitsUploadForm.tsx` (new)

**Intent**: A file control, since `FormField` is text-only.

**Contract**: React island, `client:load`, `method="POST"` `encType="multipart/form-data"`
posting to the current path. Shows the chosen file name, blocks submit when nothing is
selected, reuses `SubmitButton` and `ServerError`. Polish labels: *Plik CSV z listą lokali*,
*Wczytaj plik*.

#### 5. The downloadable empty template

**File**: `src/pages/api/buildings/units-template.csv.ts` (new)

**Intent**: Hand the administrator an empty file to fill in, so a column name never has to be
guessed — that guesswork is the entire cost of having chosen fixed headers. Offered on the
import page itself, because that is the moment the need appears.

**Contract**: `GET` returning **the header row and nothing else**. Generated from the same
`CSV_HEADERS` constant the parser validates against, exported by `src/lib/units-csv.ts`
(Phase 2) — so the template cannot drift from what the importer accepts. A static file in
`public/` would silently disagree the first time a header is renamed, and nothing would fail
until an administrator's upload was rejected for matching the template they were given.

Response: UTF-8 **with BOM** (without it Excel mis-renders the Polish characters in
`imie_nazwisko`), `;` separated, `\r\n` line ending,
`content-type: text/csv; charset=utf-8`, and
`content-disposition: attachment; filename="szablon-lokale.csv"` so the browser downloads
instead of rendering.

The route sits under `/api/buildings`, so `PROTECTED_ROUTES` already covers it via
`startsWith`. The template exposes nothing sensitive, but there is no reason for it to be the
one unauthenticated path in the feature.

**Why empty rather than pre-filled**: an example row invites editing over the example and
leaving a stray row behind — a failure that reads as a data error rather than as a mistake.
What an example would have taught (decimal comma in `metraz`, `email` allowed to be blank) is
instead written on the import page beside the download link, where it gets read rather than
opened in Excel.

#### 6. The confirm endpoint

**File**: `src/pages/api/buildings/[id]/units.ts` (new)

**Intent**: Write the registry. The only place `import_building_units` is called.

**Contract**: `POST`, form data, redirect-with-`?error=` on failure — the shape
`src/pages/api/buildings/index.ts` established. Re-reads the CSV text from the hidden field,
**re-runs the parse and the share computation**, and passes the result to
`supabase.rpc("import_building_units", { p_building_id, p_rows })`. Client-supplied shares are
never read. `area_m2` goes into the payload as a decimal string built from the integer
hundredths, so no float touches the value on the way to `numeric(8,2)`.

Postgres error codes map to Polish messages: `EM001` → *"Nie znaleziono budynku."*, `EM002` →
*"Ten budynek ma już zaimportowany rejestr lokali."*, `EM003` → *"Suma udziałów nie wynosi
100%. Zgłoś to jako błąd."*, `EM004` → *"Zapisana powierzchnia budynku nie zgadza się z sumą
metraży. Zgłoś to jako błąd."* The last two are unreachable if the arithmetic and the function
are right, which is exactly why they should say so rather than pretend to be user errors. On
success, redirect to `/buildings/{id}`.

### Success Criteria:

#### Automated Verification:

- `npx astro sync && npm run lint && npm run build` all pass
- Signed out, `GET /buildings/<id>`, `GET /buildings/<id>/units/import` and `POST /api/buildings/<id>/units` all redirect to `/auth/signin`
- Signed in, posting a valid CSV to the import page returns 200 with a preview containing `100,00%`
- Signed in, posting the confirm form returns 302 to `/buildings/<id>`, and `units` / `owners` hold the expected row counts with `sum(share_bps) = 10000` and `buildings.total_area_m2 = sum(units.area_m2)`
- Re-posting the same confirm form returns 302 carrying `?error=` (the `EM002` path), not a 500
- Posting a malformed CSV returns 200 listing every defect, and writes nothing
- `GET /api/buildings/units-template.csv` returns 200 with `text/csv`, an attachment disposition, a leading BOM, and exactly one line whose fields equal `CSV_HEADERS`
- Uploading that downloaded template unchanged is rejected with the *"file has no data rows"* error and **not** with a header error — which is the proof that template and parser agree
- Signed out, the template route redirects to `/auth/signin` like every other path under `/api/buildings`

Every `curl` above must send `-H "Origin: http://localhost:4321"`. `security.checkOrigin` runs
*before* middleware, so a form POST without it returns `403 Cross-site POST form submissions
are forbidden` rather than the redirect or the response being tested — a false negative that
has already cost time twice in this repo (`CLAUDE.md`).

#### Manual Verification:

- Full round trip in the browser: upload → preview → confirm → registry, with shares totalling 100,00%
- The total floor area shown on the preview is the same number the registry shows afterwards, and matches the spreadsheet the file came from
- Two rows sharing an e-mail show as one owner in the registry; two rows with no e-mail show as two, each with *"brak"*
- The error list from a broken file is understandable to someone who has never seen the parser
- The empty state and the import entry point read sensibly on a building with no units
- The download link is findable on the import page without hunting for it
- Opening the downloaded template in Excel shows four correctly spelled Polish column headers; filling in two rows, saving as CSV and uploading produces a valid preview

**Implementation Note**: Pause for human confirmation after automated verification.

---

## Phase 4: Production and the record

### Overview

Merge the worktree branch, apply the migration to production, ship, verify on the live
Worker, and update the documents that just went stale.

### Changes Required:

#### 1. Merge the worktree branch into `main`

**File**: none — git.

**Intent**: `context/foundation/lessons.md` requires work to land on `main`. The branch was a
worktree mechanism, not a feature branch.

**Contract**: Fast-forward merge into `main`, no pull request. Rebase onto `main` first if it
has moved. Then `npx astro sync && npm run lint && npm run build` once on `main` before
anything is pushed.

#### 2. Apply the migration to production

**File**: none — CLI.

**Intent**: Nothing in CI applies migrations (residual G14), so this is a deliberate manual
step against the live database.

**Contract**: `npx supabase db push --dry-run` first, **every line of its output read**, then
`npx supabase db push`. Never `--include-all`, never `--include-seed` (the seed mints an
administrator, which this project forbids against production). The project is already linked
from `S-01`.

#### 3. Ship the code

**File**: none — git.

**Intent**: Push to `main` deploys. Migration first, code second — code querying tables that
do not exist yet would take production down between the two steps.

**Contract**: Push after `db push` succeeds. `deploy.yml` runs
`lint → build → wrangler deploy → curl /api/health` and the health assertion must stay green.

#### 4. Update the durable record

**File**: `CLAUDE.md`, `context/foundation/roadmap.md`

**Intent**: `CLAUDE.md` "Current state" is deliberately the only place these facts live.

**Contract**:
- `CLAUDE.md` — the registry exists; shares are stored as integer basis points totalling 10000 per building, and `buildings.total_area_m2` mirrors the sum of its unit areas, both enforced by deferred constraint triggers rather than by convention; `import_building_units` is the only write path into the registry and is `security invoker`; the `authenticated` policies are still unscoped by building and `S-02` is where that changes.
- `context/foundation/roadmap.md` — `S-01b` status `proposed → done` in the At-a-glance table and in the slice section; Backlog Handoff row updated; `S-02` becomes ready.
- No `README.md` change: local setup did not move.

### Success Criteria:

#### Automated Verification:

- The worktree branch fast-forwards into `main`, and `npx astro sync && npm run lint && npm run build` pass on `main` before anything is pushed
- `npx supabase db push --dry-run` lists exactly one migration
- `npx supabase db push` completes without error
- `npx supabase gen types typescript --linked --schema public` matches the committed file apart from the known remote-only `__InternalSupabase` block
- The `deploy.yml` run is green including the `/api/health` assertion
- Signed out, `GET /buildings/<id>/units/import` on production redirects to `/auth/signin`

#### Manual Verification:

- Full round trip on the live Worker: sign in, open the demo building, import a CSV, see the registry total 100,00%
- The Supabase dashboard shows `units` and `owners` with RLS enabled and 8 policies each
- A reader who knows nothing of this change can tell from `CLAUDE.md` alone how shares and the building's total area are stored, and what enforces both

**Implementation Note**: Pause for human confirmation. `db push` is irreversible.

---

## Testing Strategy

There is no test runner and none is being added (`CLAUDE.md:19`). "Automated" means lint,
build, CLI exit codes, `psql` assertions and `curl` — the convention `F-01`, `F-02` and
`S-01` all used. Phase 2 adds one new instrument: a throwaway `node --experimental-strip-types`
script that executes the arithmetic directly. It is deliberately not committed; committing it
would be adding a test suite without a runner to maintain it.

### Manual Testing Steps:

1. `npx supabase db reset`; sign in locally with `test@test.com` / `Test123!`
2. Open `/buildings`, click the seeded demo building — the registry is empty
3. Download the empty template from the import page; upload it unchanged — expect the "no data rows" message, which confirms its header is accepted
4. Fill the template with two units in a spreadsheet, save as CSV, upload; confirm the preview totals 100,00%
5. Confirm the import; the registry lists both units
6. Try importing again — expect the Polish "registry already imported" message
7. `db reset`, then upload a file with a duplicate unit number, a blank name, a zero area and a bad e-mail — expect four messages with correct line numbers and nothing written
8. Upload a file with two rows sharing an e-mail and two rows with none — expect three owners
9. Sign out; confirm every new path bounces to `/auth/signin`, the template route included
10. Repeat 2–6 against production after Phase 4

## Performance Considerations

Not a concern at this size: 70 units, one import per building, one query per page render.
`infrastructure.md` §G1 notes render cost grows with data volume rather than traffic — the
registry table is the first screen where that is visible at all, and 70 rows is nothing.

Forward-looking: the deferred trigger runs one aggregate per statement, not per row, so the
import costs one extra `sum` at commit. `S-05` will read the same aggregate on every tally
render, which is the point at which an index on `units(building_id)` — created here — starts
earning its keep.

## Migration Notes

- Forward-only, applied by hand (`db push`). Residual **G14** stays open.
- The order is always: apply migration → then deploy code.
- `src/db/database.types.ts` is regenerated with `npm run db:types` and committed in the same commit as the migration that changed the schema.
- Both new tables cascade from `public.buildings`, so deleting a building removes its registry. Nothing in the UI deletes a building; this is about referential sanity, not a feature.
- `on delete restrict` on the unit→owner foreign key means an owner cannot be removed while a unit references them. With no deletion UI this is unreachable today and is the right default for the day one appears.

## References

- Roadmap item: `context/foundation/roadmap.md` → `S-01b`
- PRD: `context/foundation/prd.md` (v4) → `FR-001`, `FR-006`, `US-02`, `## Access Control`, `## Non-Goals`
- Change identity: `context/changes/building-units-import/change.md`
- Prior slice and its patterns: `context/changes/building-create/plan.md`
- The access contract this inherits: `supabase/migrations/20260801222109_create_buildings.sql`
- Endpoint shape: `src/pages/api/buildings/index.ts`
- Form island shape: `src/components/buildings/BuildingForm.tsx`
- Auth gate (unchanged, verified): `src/middleware.ts:6`
- Residual G14 (no migration history in CI): `context/changes/deployment/deployment.md:146`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema, access contract, and the atomic write path

#### Automated

- [x] 1.1 `npx supabase db reset` applies migration and seed with no error
- [x] 1.2 `units` and `owners` each report RLS enabled and exactly 8 policies
- [x] 1.3 A unit referencing an owner from another building is rejected by the composite foreign key
- [x] 1.4 Deferred trigger rejects a share total other than 10000 at commit; an exact multi-row insert succeeds
- [x] 1.5 Direct `update` of `buildings.total_area_m2` away from `sum(units.area_m2)` is rejected with `EM004`
- [x] 1.6 Inserting units without updating `total_area_m2` is rejected with `EM004` — the two writes only pass together
- [x] 1.7 Deleting every unit succeeds when `total_area_m2` is nulled in the same transaction, and fails otherwise
- [x] 1.8 `import_building_units` raises `EM002` on a non-empty registry and `EM001` on an unknown building
- [x] 1.9 Owner deduplication: shared e-mail collapses to one owner, two blank e-mails stay two
- [x] 1.10 After a successful import, `buildings.total_area_m2` equals `sum(units.area_m2)` to the cent
- [x] 1.11 `database.types.ts` contains both tables, `total_area_m2` on `buildings`, and `import_building_units`
- [x] 1.12 `npx astro sync && npm run lint && npm run build` all pass

#### Manual

- [x] 1.13 Studio shows both tables, demo building holding zero units and an empty `total_area_m2`
- [x] 1.14 Policy list reads 4 × `authenticated` + 4 × `anon` per table, anon denying

### Phase 2: CSV parser and share arithmetic

#### Automated

- [ ] 2.1 Arithmetic harness passes, including the 1/3 case and the determinism check
- [ ] 2.2 A CSV with five distinct defects produces five errors with correct line numbers
- [ ] 2.3 A Windows-1250 file produces the "save as UTF-8" error rather than mangled names
- [ ] 2.4 Duplicate `numer_lokalu` reports both offending lines
- [ ] 2.5 `npx astro sync && npm run lint && npm run build` all pass

#### Manual

- [ ] 2.6 The largest-remainder distribution and its tie-break are followable from the source
- [ ] 2.7 Polish error messages read as instructions to an administrator, not parser diagnostics

### Phase 3: The screens

#### Automated

- [ ] 3.1 `npx astro sync && npm run lint && npm run build` all pass
- [ ] 3.2 Signed out, all three new paths redirect to `/auth/signin`
- [ ] 3.3 Signed in, a valid CSV returns a preview containing `100,00%`
- [ ] 3.4 Confirm returns 302 to the building; rows exist with `sum(share_bps) = 10000` and `total_area_m2 = sum(area_m2)`
- [ ] 3.5 Re-posting confirm returns 302 with `?error=` (the `EM002` path), not a 500
- [ ] 3.6 A malformed CSV lists every defect and writes nothing
- [ ] 3.7 Template route returns 200, `text/csv`, attachment disposition, BOM, one line equal to `CSV_HEADERS`
- [ ] 3.8 Uploading the untouched template is rejected as "no data rows", not as a header error
- [ ] 3.9 Signed out, the template route redirects to `/auth/signin`

#### Manual

- [ ] 3.10 Browser round trip: upload → preview → confirm → registry totalling 100,00%
- [ ] 3.11 The total floor area on the preview matches the registry afterwards and the source spreadsheet
- [ ] 3.12 Shared e-mail shows one owner; two blank e-mails show two, each as "brak"
- [ ] 3.13 The error list is understandable without knowledge of the parser
- [ ] 3.14 Empty state and import entry point read sensibly
- [ ] 3.15 The download link is findable on the import page without hunting
- [ ] 3.16 Template opens in Excel with correct Polish headers; filled in and re-uploaded, it previews validly

### Phase 4: Production and the record

#### Automated

- [ ] 4.1 Branch fast-forwards into `main`; lint and build pass on `main`
- [ ] 4.2 `npx supabase db push --dry-run` lists exactly one migration
- [ ] 4.3 `npx supabase db push` completes without error
- [ ] 4.4 `gen types --linked` matches the committed file apart from the known remote-only block
- [ ] 4.5 The `deploy.yml` run is green including the `/api/health` assertion
- [ ] 4.6 Signed out, the production import path redirects to `/auth/signin`

#### Manual

- [ ] 4.7 Full round trip on production, registry totalling 100,00%
- [ ] 4.8 Supabase dashboard shows both tables with RLS and 8 policies each
- [ ] 4.9 `CLAUDE.md` alone explains how shares and the total area are stored, and what enforces both
