# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

EstateManager — share-weighted resolution voting for Polish housing communities (_wspólnoty mieszkaniowe_). Read `context/foundation/prd.md` before building any feature; the domain rules (quorum, share weighting, per-unit voting links) live there, not in the code. The PRD and all user-facing copy are in **Polish**; keep code, comments, and commits in English.

How far along the project actually is: see "Current state" at the bottom.

## Hard rules

- **Commit straight to `main`.** Never create a feature branch and never ask which branch to use — this is a solo repo with no PR flow, so a branch only adds a merge step. Committing is still opt-in: wait to be asked. There **is** a remote (`origin` → GitHub, public), and pushing to `main` deploys to production — so treat a push as its own opt-in, separate from the commit.
- **There is no test runner.** No `npm test`, no test files, no framework installed. Verify with `npm run lint && npm run build`. Never report that tests passed.
- **`context/archive/` is immutable.** Never write there. Open a new change under `context/changes/` instead.
- **Supabase env vars are `optional: true`** in `astro.config.mjs`. When unset, `createClient()` in `src/lib/supabase.ts` returns `null` and every auth path silently no-ops — the build stays green and the app deploys broken. Any new code touching Supabase must handle the `null` client, and any new required secret should be surfaced through `src/lib/config-status.ts` (the banner shown by `src/components/Banner.astro`).
- **Type-aware lint needs generated types.** Run `npx astro sync` before `npm run lint` on a fresh clone or after changing `astro.config.mjs` — ESLint uses `strictTypeChecked` with `projectService`, and CI does the sync explicitly for this reason.
- **Never rename project identifiers piecemeal.** The rename to `estate-manager` is recorded in `context/changes/deployment/deployment.md` (step A1); touching one manifest without the others breaks the deploy. The Worker name is also the `*.workers.dev` hostname, so renaming it creates a second Worker rather than moving the first.

## Commands

Full script list is in `@package.json`. What it doesn't tell you:

- `npm run dev` boots the Cloudflare workerd runtime, not plain Node — runtime differences from Node show up here, not at deploy time.
- `npm run lint` is type-aware and needs `npx astro sync` first (see above).
- `npx supabase start` needs Docker and ~7 GB RAM.
- `npx wrangler deploy` is rarely needed — pushing to `main` deploys. It works locally (`wrangler login` is done), but a manual deploy publishes a tree CI never validated, which is exactly what `deploy.yml`'s ordering exists to prevent.

Node version is pinned in `@.nvmrc`. Commit hooks (husky + lint-staged, configured in `@package.json`) auto-fix with ESLint and Prettier, so don't hand-format before committing.

## Architecture

Astro 6 with `output: "server"` — **every route is server-rendered**; nothing declares `prerender`. Stack list is in `@README.md`.

The request path is the part worth knowing:

1. `src/middleware.ts` runs on every request, builds the Supabase SSR client from request headers + `AstroCookies`, and sets `context.locals.user` (typed in `src/env.d.ts`).
2. The same file's `PROTECTED_ROUTES` array is the **only** auth gate — a new protected page is not protected until its path is added there. `src/pages/dashboard.astro` is the working example.
3. `src/lib/supabase.ts` reads `SUPABASE_URL` / `SUPABASE_KEY` from `astro:env/server`. Sessions are cookie-based via `@supabase/ssr`.
4. Auth endpoints in `src/pages/api/auth/{signin,signup,signout}.ts` take **form data, not JSON**, and respond with `context.redirect()` carrying `?error=<message>` — they do not return JSON error bodies. Match that shape for new auth endpoints.

## Conventions

- Import via the `@/*` alias (maps to `./src/*`). Never use `../` to reach outside the current directory; relative imports within one folder are fine.
- `.astro` components for static markup; `.tsx` only where interactivity is required. No Next.js directives (`"use client"` etc.).
- Merge Tailwind classes with `cn()` from `@/lib/utils` — never concatenate class strings.
- shadcn/ui is configured in `@components.json`; generated components live in `src/components/ui/`.
- Services and helpers in `src/lib/`. Shared types belong in `src/types.ts` and hooks in `src/components/hooks/` — neither exists yet; create on first use.
- Supabase migrations: `supabase/migrations/YYYYMMDDHHmmss_short_description.sql`. Enable RLS on every new table, with one policy per operation (`select` / `insert` / `update` / `delete`) × role (`anon`, `authenticated`), each scoped to the caller's building. A single `FOR ALL` policy, or one that omits `anon`, does not pass review — per the PRD only administrators authenticate, while owners vote through an emailed per-unit link with **no session**.

## Docs layout

- `context/foundation/` — durable product docs: `prd.md`, `tech-stack.md`, `infrastructure.md`, `shape-notes.md`.
- `context/changes/` — change-scoped work, e.g. `deployment/deployment.md` — the deployment runbook: prerequisites, current state, steps as executed, and the append-only deployment log.
- `context/docs/` — explanatory material for contributors.
- Local dev setup, auth routes, and Supabase configuration are documented in `@README.md`; don't duplicate them here.

## Current state

Everything above is durable; everything below is a snapshot that goes stale. This is deliberately the only place these facts live — update them here, nowhere else.

- **No domain code yet.** The repo is the starter-template scaffold plus auth; nothing from the PRD is implemented.
- **Deployed and live** at https://estate-manager.estate-manager.workers.dev (Workers **Paid** since 2026-08-01 — `F-02` needed it, Email Sending is unavailable on Free). Identifiers were renamed to `estate-manager` on 2026-08-01. `/api/health` returns `200 {"status":"ok","email":"…"}` when the Worker can reach Supabase and `503` when it cannot — check it first when the app misbehaves. Prerequisites, deployment log and residuals: `context/changes/deployment/deployment.md`.
- **Auto-deploy works, and the gate is proven.** Every push to `main` runs `.github/workflows/deploy.yml` (`npm ci → astro sync → lint → build → wrangler deploy → assert /api/health`). The negative case was demonstrated on 2026-08-01: a deliberate lint error failed the job at `npm run lint` with build, `wrangler deploy` and the health assertion all **skipped**, and the live version untouched (runs `30713400532` red, `30713455557` green). That in-job ordering is still the only gate standing in for branch protection — proven, but only as long as nobody reorders the workflow.
- **A green deploy now means the app answers.** `deploy.yml`'s final step curls `/api/health` and fails the job on anything but `200` (5 retries, 5s apart). This is the only check that can catch a missing or rotated **Workers Secret** — CI builds with GitHub secrets while the running Worker reads platform secrets the build never sees. A red assertion needs a human: `503` means *either* missing credentials *or* Supabase unreachable, and there is deliberately no auto-rollback.
- **Administrator login is verified on production (2026-08-01).** The full round trip ran against the live Worker — sign in → `/dashboard` → survives a reload → sign out → `/dashboard` bounces to `/auth/signin` — in `curl` and in a browser. First successful production login; it proves cookie-based `@supabase/ssr` sessions work on workerd. Record: `context/changes/deployment/deployment.md`.
- **No self-service registration — by product decision (2026-08-01).** Administrator accounts are created directly in the database via the **Supabase dashboard** (Authentication → Users → Add user, with *Auto Confirm User*) — PRD §Access Control, procedure in `@README.md`. The MVP account is `test@test.com` / `Test123!`, and `/auth/signin` displays it alongside "accounts are created in the Supabase dashboard". `/auth/signup`, `/auth/confirm-email` and `src/pages/api/auth/signup.ts` are **gone** — `F-01` deleted them; all three now return `404` in production. Consequence: Supabase Site URL (runbook step B7) and email confirmation are no longer blockers, because no product flow sends a confirmation link.
- **Local seeds an admin, production never does.** `npx supabase db reset` applies `supabase/seed.sql` and provisions `test@test.com` / `Test123!` locally with no manual step. Nothing in this repo creates users in the **production** project — no script, no seed, no service-role key; production accounts are made by hand in the dashboard. The asymmetry is deliberate (a code path that mints administrators against production is a standing risk to the owner-data guardrail); do not "fix" it. Rationale in `@README.md`. The seed itself is **unexercised** — Docker was unavailable when it was written, so `S-01` brings its first real run.
- **Node.** `.nvmrc` pins 22.14.0 and CI uses node 22; `fnm` is installed for this. If your shell has a different major, run `eval "$(fnm env)" && fnm use` before lint/build.
- **CI is live.** `.github/workflows/ci.yml` runs lint + build on push/PR to `main`. `SUPABASE_URL` / `SUPABASE_KEY` are set as repository secrets.
- **The transactional mail channel works, proven from production (2026-08-01).** `F-02` connected Cloudflare Email Service through the native `send_email` binding — no API key. Mail goes out from `glosowanie@estatemanager.dev` (our own domain; Cloudflare has no provider test domain). First production send: `messageId <zp7Un3ZRDflfWr2q1xX3WSCOh3YQE04aIPGy@estatemanager.dev>`, fired by a signed-in administrator through `POST /api/email/test`, which stays in the repo as a live smoke test on a **beta** API. `src/lib/email.ts` is the only module importing `cloudflare:workers` — reach the binding through it, never directly, and note that `Astro.locals.runtime.env` does not exist on Astro 6 + adapter 13. Cloudflare's real quota is **200 messages/day**. Record: `context/changes/transactional-mail-channel/change.md`.
- **A missing `EMAIL` binding does not fail the deploy — deliberately.** `/api/health` reports `"email":"ok"|"missing"` inside its `200`, and the config-status banner shows it, but neither flips the status code: `deploy.yml`'s `curl --fail` still passes with a dead mail channel. This is a knowing step down from the Supabase treatment `F-01` built, on the grounds that a beta channel should not block shipping the rest of the app. Revisit when `S-04` makes the channel load-bearing for a real building.
- **`worker-configuration.d.ts` is committed and CI never regenerates it.** `deploy.yml` runs `astro sync` but not `wrangler types`, so the committed file is CI's only source of binding types — regenerate and commit it **in the same commit** as any `wrangler.jsonc` change, or local lint stays green while CI types the binding wrongly. The order that works: `npx wrangler types && npx astro sync && npm run lint && npm run build`. The file is excluded from ESLint (generated, ships its own disable directives); TypeScript still checks it.
- **Every form endpoint needs an `Origin` header when called with `curl`.** Astro's `security.checkOrigin` is on by default and runs *before* middleware, so a form POST without `Origin` gets `403 Cross-site POST form submissions are forbidden` — not the auth redirect you were testing for. Applies to `/api/auth/signin` and `/api/email/test` alike. Add `-H "Origin: <the origin you are calling>"`.
- **Known advisory:** `astro@6.3.1` carries a high-severity reflected XSS (range `<=7.0.9`) with no fix in the 6.x line. Accepted for now — see the residuals table in `context/changes/deployment/deployment.md` before upgrading.

<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 2, Lesson 1

Move from sprint-zero setup to project orchestration with the **roadmap chain**:

```
(Module 1 foundation docs) -> /10x-roadmap -> backlog-ready roadmap items
```

`/10x-roadmap` is the lesson focus. `/10x-new` is intentionally introduced in Module 2, Lesson 2, when a selected roadmap item becomes an implementation change folder.

### Task Router - Where to start

| Skill | Use it when |
| --- | --- |
| **Roadmap (lesson focus)** | |
| `/10x-roadmap` | You have `context/foundation/prd.md` and a scaffolded project baseline, and you need a vertical-first MVP roadmap. The skill reads the PRD, inspects the code baseline, uses available foundation docs such as `tech-stack.md`, `infrastructure.md`, and `deploy-plan.md`, then writes `context/foundation/roadmap.md`. Use it BEFORE creating per-change folders or implementation plans. |
| **Re-run upstream if needed** | |
| `/10x-shape` / `/10x-prd` / `/10x-tech-stack-selector` / `/10x-bootstrapper` / `/10x-agents-md` / `/10x-infra-research` | Bundled from Module 1 so foundation contracts can be fixed before roadmap sequencing. If roadmap generation exposes a PRD gap, repair the PRD before pretending the backlog is ready. |

### How the chain hands off

- `/10x-roadmap` bridges product and implementation. It does not choose frameworks, design schemas, or write a per-change implementation plan.
- The output is `context/foundation/roadmap.md`: ordered milestones, vertical slices, bounded foundations, dependencies, unknowns, risk, and backlog handoff fields.
- Roadmap items should receive stable human-readable identifiers in backlog tools. The actual `context/changes/<change-id>/` folder is created in Lesson 2 with `/10x-new`.

### Roadmap boundaries

- Default to vertical slices: user-visible outcomes that cross UI, data, business logic, and integrations.
- Horizontal work is allowed only as a bounded enabler that names the downstream vertical milestone it unlocks.
- Avoid orphan horizontal work such as "build the whole database", "build all API endpoints", or "design the whole UI" before the first user-visible flow.
- Roadmap is not a calendar estimate. Do not invent dates, story points, or sprint velocity unless the user explicitly asks for a separate planning artifact.

### Foundation paths used by this lesson

- `context/foundation/prd.md` - input
- `context/foundation/tech-stack.md` - optional input
- `context/foundation/infrastructure.md` - optional input
- `context/deployment/deploy-plan.md` - optional input
- `context/foundation/roadmap.md` - output
- `context/foundation/lessons.md` - recurring rules and pitfalls
- `docs/reference/contract-surfaces.md` - load-bearing names registry

Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->
