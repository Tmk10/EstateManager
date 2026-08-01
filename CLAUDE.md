# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

EstateManager — share-weighted resolution voting for Polish housing communities (_wspólnoty mieszkaniowe_). Read `context/foundation/prd.md` before building any feature; the domain rules (quorum, share weighting, per-unit voting links) live there, not in the code. The PRD and all user-facing copy are in **Polish**; keep code, comments, and commits in English.

How far along the project actually is: see "Current state" at the bottom.

## Hard rules

- **Commit straight to `main`.** Never create a feature branch and never ask which branch to use — this repo has no remote and no PR flow, so a branch only adds a merge step. Committing is still opt-in: wait to be asked.
- **There is no test runner.** No `npm test`, no test files, no framework installed. Verify with `npm run lint && npm run build`. Never report that tests passed.
- **`context/archive/` is immutable.** Never write there. Open a new change under `context/changes/` instead.
- **Supabase env vars are `optional: true`** in `astro.config.mjs`. When unset, `createClient()` in `src/lib/supabase.ts` returns `null` and every auth path silently no-ops — the build stays green and the app deploys broken. Any new code touching Supabase must handle the `null` client, and any new required secret should be surfaced through `src/lib/config-status.ts` (the banner shown by `src/components/Banner.astro`).
- **Type-aware lint needs generated types.** Run `npx astro sync` before `npm run lint` on a fresh clone or after changing `astro.config.mjs` — ESLint uses `strictTypeChecked` with `projectService`, and CI does the sync explicitly for this reason.
- **Never rename project identifiers piecemeal.** The rename to `estate-manager` belongs to `context/changes/deployment/deployment-plan.md`; touching one manifest without the others breaks the deploy. See "Current state" for which files still carry the old name.

## Commands

Full script list is in `@package.json`. What it doesn't tell you:

- `npm run dev` boots the Cloudflare workerd runtime, not plain Node — runtime differences from Node show up here, not at deploy time.
- `npm run lint` is type-aware and needs `npx astro sync` first (see above).
- `npx supabase start` needs Docker and ~7 GB RAM.
- `npx wrangler deploy` requires auth that doesn't exist yet — read "Current state" below first.

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
- `context/changes/` — change-scoped work in progress, e.g. `deployment/deployment-plan.md` (approved, not executed) and its `deployment-preflight.md` gate.
- `context/docs/` — explanatory material for contributors.
- Local dev setup, auth routes, and Supabase configuration are documented in `@README.md`; don't duplicate them here.

## Current state

Everything above is durable; everything below is a snapshot that goes stale. This is deliberately the only place these facts live — update them here, nowhere else.

- **No domain code yet.** The repo is the starter-template scaffold plus auth; nothing from the PRD is implemented.
- **Deployed and live** at https://estate-manager.estate-manager.workers.dev (Workers Free). Identifiers were renamed to `estate-manager` on 2026-08-01. `/api/health` returns `200 {"status":"ok"}` when the Worker can reach Supabase and `503` when it cannot — check it first when the app misbehaves. Per-deployment records: `context/foundation/deployment-history.md`.
- **`CLOUDFLARE_API_TOKEN` is not set**, so `.github/workflows/deploy.yml` cannot run yet. Until a human adds it, deploys are manual (`npm run build && npx wrangler deploy`) and the auto-deploy-on-merge loop is **unproven** — including the check that a lint failure blocks the deploy, which is the only gate standing in for branch protection.
- **Supabase Site URL is still unset** (plan step B7), so confirmation links in signup emails point at the wrong origin. The signup → confirm → sign-in flow has never been exercised against production.
- **Node.** `.nvmrc` pins 22.14.0 and CI uses node 22; `fnm` is installed for this. If your shell has a different major, run `eval "$(fnm env)" && fnm use` before lint/build.
- **CI is live.** `.github/workflows/ci.yml` runs lint + build on push/PR to `main`. `SUPABASE_URL` / `SUPABASE_KEY` are set as repository secrets.
- **Known advisory:** `astro@6.3.1` carries a high-severity reflected XSS (range `<=7.0.9`) with no fix in the 6.x line. Accepted for now — see the residuals table in `deployment-history.md` before upgrading.
