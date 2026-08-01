# Building Create — Plan Brief

> Full plan: `context/changes/building-create/plan.md`

## What & Why

Roadmap item `S-01`: an administrator creates a building from a three-field form — name,
city, and street with number — and sees it saved. The form is the small part. This change
writes the **first SQL migration in the project's history** and with it the row level security
contract that every later table inherits, on the smallest table the product will ever have:
three content columns and no owner data in it.

## Starting Point

The data layer is empty and always has been — `supabase/migrations/` does not exist and no
migration has ever been authored or applied (`git log --all --diff-filter=A -- 'supabase/**'`
returns only `.gitignore`, `config.toml`, `seed.sql`). `supabase/seed.sql` shipped from `F-01`
**never having run**, because Docker was unavailable; `F-01` checked those steps off "to close
this plan, not because they passed" and handed the debt to `S-01`. Docker was still
unavailable when this plan was written. The Supabase client is untyped, and
`PROTECTED_ROUTES` in `src/middleware.ts:6` is the only auth gate in the app.

## Desired End State

A signed-in administrator opens `/buildings`, sees what exists, clicks to `/buildings/new`,
enters name, city and street, and lands back on the list with the building saved. A duplicate
submission produces a readable Polish message, not a Postgres error. Anonymous visitors are
bounced to `/auth/signin`. Underneath: one migration with RLS and eight policies, a committed
`Database` type, and a local stack that actually runs.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Applying the first migration | Install Docker/OrbStack, normal local loop | The only option giving a dress rehearsal before production — and it finally discharges the `F-01` seed debt that every later slice would otherwise inherit. |
| Database types | Generate and commit `src/db/database.types.ts` | One `createServerClient<Database>` call site types every future query, and lint is `strictTypeChecked`, so a wrong column name fails at `npm run lint` instead of in production. |
| RLS shape | `authenticated` full CRUD, `anon` explicit deny | Mirrors PRD v1 (every user in the database is an administrator, no roles model) and satisfies `CLAUDE.md:49` — 8 policies, `anon` stated out loud rather than left to implicit deny. |
| Screen layout | `/buildings` + `/buildings/new` | Gives `S-01b` a natural home at `/buildings/[id]`, and one `startsWith` entry in `PROTECTED_ROUTES` covers the whole subtree. |
| Duplicate handling | `unique (name, city, street)` | Catches an accidental double submit without forbidding two real buildings that share a name in different towns. |
| Address shape | Two columns, `city` + `street` (street holds the number) | A single free-text `address` is neither searchable nor comparable; splitting on an empty table costs one column, splitting later costs a parsing migration. |
| Seed | One demo building added | `/buildings` has something to show after `db reset`, and the seed's first real run then exercises the new table too, not just `auth.users`. |

## Scope

**In scope:** first migration (`public.buildings` with `name` / `city` / `street`, RLS, 8
policies); demo building in the seed; generated `Database` type and a typed client;
`/buildings` list, `/buildings/new` form,
`POST /api/buildings`; `PROTECTED_ROUTES` entries; a dashboard link; applying the migration to
production and updating `CLAUDE.md` / roadmap / README.

**Out of scope:** unit and owner import with metraż and shares (that is `S-01b`);
multi-building support, a roles model, edit and delete screens (all PRD `## Non-Goals`);
rebuilding `/dashboard`; wiring migrations into CI (residual **G14** stays open); seeding
production.

## Architecture / Approach

Local stack first, production last. Phase 1 exists as its own phase precisely so the migration
can fail somewhere harmless before it reaches the live database. Inside Phase 2 the order is
load-bearing: write migration → `db reset` applies it → `gen types` reads the applied schema →
parameterize the client → lint. Generating types before the migration applies produces a
`Database` with no `buildings` table and a lint failure that reads like a code bug.

The write path copies the auth endpoints exactly — form data in, `context.redirect()` with
`?error=` out (`CLAUDE.md:38`) — so the codebase keeps one form idiom instead of two.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Local stack | Docker running, `db reset` green, seed executed for the first time | The seed's `auth.users` column assumptions were never tested; `F-01` named them the prime suspect if it fails |
| 2. Migration and types | `public.buildings` (`name`, `city`, `street`) + RLS + 8 policies, demo seed row, committed `Database` type | Forward-only SQL with no schema rollback; an `update` policy missing `with check` is the bug that would propagate to every later table |
| 3. Screens | List, form, endpoint, route protection | A new route is unprotected until it is in `PROTECTED_ROUTES` — the gate is easy to forget |
| 4. Production | Migration pushed, code deployed, docs updated | `db push` is irreversible and nothing in CI applies migrations, so ordering (schema before code) is manual and unforgiving |

**Prerequisites:** Docker or OrbStack installed (~7 GB RAM); the Supabase production
project-ref from the dashboard; `F-01` done (it is).

**Estimated effort:** ~2–3 sessions across 4 phases. Phase 1 is mostly waiting on an install;
Phase 2 carries the real thinking.

## Open Risks & Assumptions

- **The seed has never executed.** If it fails in Phase 1, the suspect is its assumption about the Supabase-owned `auth.users` schema (`supabase/seed.sql:20-22`), which has shifted across GoTrue versions. Verification is by signing in, not by selecting the row.
- **No pipeline applies migrations.** Residual **G14** stays open, so schema and code can drift silently; the discipline of "push schema, then push code" lives only in this plan.
- **`db push` is forward-only.** `wrangler rollback` reverts code, never schema. The migration is wrapped in a transaction to avoid a half-applied state, but there is no undo.
- **Assumption carried from the roadmap:** the form creates buildings, yet v1 still operates on one — PRD `## Non-Goals` ("bez obsługi wielu budynków") stands, and nothing downstream handles a portfolio. Recorded at `roadmap.md:133` for the user to correct if the intent was wider.
- **Astro's `security.checkOrigin`** rejects form POSTs without an `Origin` header, so every `curl` verification against the endpoint must send one — the trap `F-01` hit at `production-admin-access/plan.md:656-659`.

## Success Criteria (Summary)

- An administrator creates a building on production and sees it listed — the full round trip on the live Worker.
- `public.buildings` has RLS enabled with 4 `authenticated` and 4 `anon` policies, the `anon` set denying.
- `npx supabase db reset` runs clean from nothing: migration applies, seed executes, and signing in with the seeded account works — closing the verification debt `F-01` left open.
