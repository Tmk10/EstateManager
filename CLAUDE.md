# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

EstateManager — share-weighted resolution voting for Polish housing communities (_wspólnoty mieszkaniowe_). Read `context/foundation/prd.md` before building any feature; the domain rules (quorum, share weighting, per-unit voting links) live there, not in the code. The PRD and all user-facing copy are in **Polish**; code, comments and commits stay English.

Live at https://estate-manager.estate-manager.workers.dev. `/api/health` is the first thing to check when the app misbehaves (`@README.md` §Health check). Which slices are built is recorded in `context/foundation/roadmap.md` and nowhere else.

## Hard rules

- **Every feature and every fix gets its own branch and its own pull request. Never commit to `main` directly.** Branch off up-to-date `main` as `feat|fix|docs|chore/<slug>`; `gh pr create --base main`; let `ci.yml` go green; `gh pr merge --squash --delete-branch`. Never ask which branch to target — always a new one off `main`. **`main` is not protected on GitHub** (verified 2026-08-02), so this rule _is_ the gate. Three separate opt-ins, each waited for rather than assumed: **commit**, **push / open the PR**, **merge** — the merge matters most, because it triggers `deploy.yml` and **deploys to production**. Run `git branch --show-current` immediately before every commit; never infer the branch from `git status`.
- **Worktrees are the workspace for agent work.** Anything that may edit code, and anything running agents in parallel, happens in a worktree under `.claude/worktrees/` — concurrent agents in one checkout clobber each other. The worktree branch **is** the PR branch: it ends in a merged PR and the worktree is removed after. Documentation-only work may skip the worktree, but still needs its branch and PR. Two failure modes: **"pushed" is not "landed"** — audit `git worktree list` against `gh pr list`, because a branch with a worktree and no PR is the shape that grows a conflict; and **check the base ref**, which defaults to `origin/main` and can sit behind local `main` (`git log --oneline origin/main..main`).
- **Two test harnesses, and almost no tests — say which you ran, and never let "tests passed" stand in for "the domain is verified."** `npm test` runs Vitest over `src/**/*.test.ts`; `npm run test:db` runs pgTAP over `supabase/tests/database/*.test.sql` and needs Docker plus the local stack up. Both are green, and the unit layer now genuinely pins the udział allocation, the registry parse, the audit trail's arithmetic and `EM015` — but **the database layer is still entirely unpinned**: nothing asserts the threshold, RLS, the electorate guards, or what a refused import leaves behind. A green `npm test` says nothing about any of them. Full verification is `npm run lint && npm test && npm run build`, plus `npm run test:db` for anything touching `supabase/`. Which risks are still open, and how to write the tests: `context/foundation/test-plan.md` §2, §6.1, §6.2.
- **Supabase env vars are `optional: true`** in `astro.config.mjs`. When unset, `createClient()` in `src/lib/supabase.ts` returns `null` and every auth path silently no-ops — the build stays green and the app deploys broken. New code touching Supabase must handle the `null` client, and any new required secret must be surfaced through `src/lib/config-status.ts` (the banner rendered by `src/components/Banner.astro`).
- **Type-aware lint needs generated types.** Run `npx astro sync` before `npm run lint` on a fresh clone or after changing `astro.config.mjs` — ESLint uses `strictTypeChecked` with `projectService`, and CI does the sync explicitly for this reason.
- **`context/archive/` is immutable.** Never write there. Open a new change under `context/changes/` instead.
- **Never rename project identifiers piecemeal.** The rename to `estate-manager` is recorded in `context/changes/deployment/deployment.md` (step A1); touching one manifest without the others breaks the deploy. The Worker name is also the `*.workers.dev` hostname, so renaming it creates a second Worker rather than moving the first.

## Hazards

Rules that are cheap to break and expensive to discover. The evidence behind each — reproductions, timestamps, residuals — is in `context/foundation/system-state.md`, under the section named beside it.

**Voting and the domain**

- **Voting tokens are persisted in Workers Logs for 7 days, and no code change here stops it.** The token is in the URL path. Do not cite "the token never reaches a log line" as a fact about production. → §Workers Logs and voting tokens
- **`resolve_voting_link` is the only crack in the schema for `anon`.** An unknown token and a real one must stay indistinguishable — no error page, header or redirect may differ between a hit and a miss. When a link "does not work", compare it byte-for-byte against the stored token **before** inspecting any read path. → §Resolutions and voting links
- **`/vote/<token>` is deliberately not in `PROTECTED_ROUTES`** — the only route for which that is true. Do not "fix" it. → §Resolutions and voting links
- **No token appears in any HTML response, and column grants enforce it.** `select=*` on `voting_links` is `42501`; a column added by a later migration is invisible until added to the grant. → §Resolutions and voting links
- **`public.votes` denies `insert`/`update`/`delete` to both roles** — _głos jest ostateczny_. Do not "fix" it back to consistency with the other tables. → §The vote write path
- **`votes.share_bps` is a snapshot and outranks any recomputation.** Never re-sum an owner's units to weigh a vote already cast. → §The vote write path, §Audit trail
- **The threshold exists once, in SQL.** No TypeScript computes `sum * 2 > 10000`; the denominator is the whole building, not the udziały cast. → §Outcome and threshold
- **`votes_lock_resolution` takes `FOR UPDATE` in a `before insert` trigger** and will look like a redundant trigger. Moving it deadlocks two concurrent voters (`40P01`) and loses a vote. → §Outcome and threshold
- **`import_building_units` is the only write path into `units`/`owners`, and it stays `invoker`.** The two registry _reads_ are `definer` on purpose; do not "fix" either back. → §The unit registry and its arithmetic
- **`src/lib/shares.ts` tie-breaks by file order**, which is what lets the confirm endpoint recompute instead of trusting the browser. Never make it depend on anything float-derived or on iteration order. → §The unit registry and its arithmetic
- **`EM001`–`EM015` are the domain's refusals.** Before adding a guard, check whether one already covers it. → §The unit registry and its arithmetic, §The vote write path, §Outcome and threshold, §Audit trail
- **An owner never learns another owner's vote, on any surface.** Permanent, not pending. → §Audit trail
- **The e-mail fanout sends sequentially and writes each owner's status before the next send.** Do not batch the writes and do not make it concurrent — both trade resumability for speed. Send status is derived from timestamps; there is deliberately no `status` column and no per-owner "send again". → §Voting-link fanout

**Interface**

- **One design system, in two files: `src/styles/global.css` (oklch tokens) and `src/lib/ui.ts` (the class vocabulary).** A screen that names a raw colour has broken it. Colour carries meaning or it is grey — `BADGE_TONES` is the one table that assigns meaning. → §Design system
- **`src/lib/ui.ts` imports nothing.** The moment it does, three `src/lib` modules stop being executable on their own. → §Design system
- **`src/components/AppShell.astro` owns every page's outer geometry — except `/vote/<token>`, which must not use it.** `AppShell` carries links, and a click on one would put a voting token into a `Referer`. → §Design system
- **Modules are a left rail, and both levels of them come out of a registry** — `src/lib/app-modules.ts` and `src/lib/building-modules.ts`. `src/components/SideNav.astro` carries no module names and reads its state from the path alone; adding a module is a registry entry plus its route, never markup. → §Module navigation
- **`src/components/PencilSkyline.astro` is generated from its `BLOCKS` array.** Move the skyline by editing the array, not the markup under it. → §Product name
- **All user-facing copy is Polish, `<html lang="pl">` included.** Code, comments and commits stay English. → §Design system

**Platform**

- **Two deploy paths reach production, and one of them does not lint.** Cloudflare Workers Builds is dashboard-side config, invisible in any checkout, and wins the race about half the time. `deploy.yml` is therefore not _the_ gate. → §Deploy paths
- **`wrangler deploy` does not read `wrangler.jsonc`.** It reads `dist/server/wrangler.json`, which the Astro adapter generates at build time. **Editing `wrangler.jsonc` changes nothing until you `npm run build`** — deploy without rebuilding and you ship the previous build's bindings, which cost three unintended production e-mails on 2026-08-04. When a binding is removed the generated config still carries the key with an empty value (`"send_email": []`), so `'send_email' in config` is true — test the value, not the key. → §Transactional mail
- **A missing `EMAIL` binding returns `200 {"email":"missing"}` from `/api/health` and does not fail the deploy.** Do not change that without also changing `deploy.yml`'s health assertion — it is an open question, not a settled position, now that `S-04` mails ballots. → §Transactional mail
- **`src/lib/email.ts` is the only module that may import `cloudflare:workers`.** `Astro.locals.runtime.env` does not exist on Astro 6 + adapter 13. → §Transactional mail
- **Migrations are applied by hand, before the code that needs them, and are forward-only.** `wrangler rollback` reverts code, never schema. Procedure: `@README.md`. → §Schema, migrations and generated types
- **`src/db/database.types.ts` and `worker-configuration.d.ts` are generated and never regenerated by CI.** Commit each in the **same commit** as the change that invalidates it. A wrong column inside a `.select("…")` string is not a compile error. → §Schema, migrations and generated types
- **Every form endpoint needs `-H "Origin: <origin>"` when called with `curl`.** `security.checkOrigin` runs _before_ middleware, so without it you get `403 Cross-site POST form submissions are forbidden` — not the auth redirect you were testing for.
- **Production accounts are made by hand in the Supabase dashboard; nothing in this repo creates them.** The asymmetry with the local seed is deliberate — do not script it. → §Auth and accounts
- **RLS on every new table: eight policies, four `anon` at `false`.** `update` needs **both** `using` and `with check`. `authenticated` is still unscoped in v1 and that is a recorded decision, not an oversight. → §RLS shape
- **`astro check` is green, and the per-edit hook is the only thing keeping it that way.** `.claude/settings.json` runs it after every agent edit of a `.ts`/`.tsx`/`.astro` file and refuses at exit 2; `ci.yml` runs sync, lint, test and build but **no typecheck**, so nothing on the CI side would catch a regression. A red `astro check` after your edit is now yours — the 13-error backlog was cleared on 2026-08-06.
- **A PostgREST result narrows only when the result itself is tested.** `data` and `error` are one discriminated union per result; folding several results' errors into one `readError ?? …` variable narrows none of them and leaves every `.data` as `rows | null`. Test each result with `if (result.error !== null)` in the order the reads are listed, and the success branch has rows.
- **`astro@6.3.1` carries an unfixed high-severity XSS advisory.** Do not bump Astro to fix it — no fixed release exists yet. `npm audit` reporting this one advisory is expected. → §Known advisories

## Commands

Full script list is in `@package.json`; Node version is pinned in `@.nvmrc`. What the manifest does not tell you:

- `npm run dev` boots the Cloudflare workerd runtime, not plain Node — runtime differences from Node show up here, not at deploy time.
- `npx supabase start` needs Docker and ~7 GB RAM, and on this machine the daemon is not where the CLI looks. The socket path, the `DOCKER_HOST` workaround and where the `docker` binary hides are in `@README.md` (§Supabase Configuration → First-time setup) — the single home for local-stack setup.
- `npm run db:types` regenerates `src/db/database.types.ts` from the **local** stack, so the stack must be up and migrated first.
- `npm test` needs nothing running. `npm run test:db` runs pg_prove against the running local stack; it neither resets nor migrates it. The one thing only CI proves is that the migration chain applies from **zero** — `ci.yml`'s `db-contract` job does a fresh `supabase start`, which a long-lived local stack cannot demonstrate.
- `npx wrangler deploy` is rarely needed — pushing to `main` deploys. A manual deploy publishes a tree CI never validated, which is exactly what `deploy.yml`'s ordering exists to prevent.

Commit hooks (husky + lint-staged, configured in `@package.json`) auto-fix with ESLint and Prettier, so don't hand-format before committing.

## Architecture

Astro 6 with `output: "server"` — **every route is server-rendered**; nothing declares `prerender`. Stack list is in `@README.md`.

The request path is the part worth knowing:

1. `src/middleware.ts` runs on every request, builds the Supabase SSR client from request headers + `AstroCookies`, and sets `context.locals.user` (typed in `src/env.d.ts`).
2. The same file's `PROTECTED_ROUTES` array is the **only** auth gate — a new protected page is not protected until its path is added there. `src/pages/dashboard.astro` is the working example.
3. `src/lib/supabase.ts` reads `SUPABASE_URL` / `SUPABASE_KEY` from `astro:env/server`. Sessions are cookie-based via `@supabase/ssr`.
4. Auth endpoints in `src/pages/api/auth/{signin,signout}.ts` take **form data, not JSON**, and respond with `context.redirect()` carrying `?error=<message>` — they do not return JSON error bodies. Match that shape for new auth endpoints.

## Conventions

- Import via the `@/*` alias (maps to `./src/*`). Never use `../` to reach outside the current directory; relative imports within one folder are fine.
- `.astro` components for static markup; `.tsx` only where interactivity is required. No Next.js directives (`"use client"` etc.).
- Merge Tailwind classes with `cn()` from `@/lib/utils` — never concatenate class strings. Generated shadcn/ui components live in `src/components/ui/` (`@components.json`).
- Services and helpers in `src/lib/`. Shared types belong in `src/types.ts` and hooks in `src/components/hooks/` — neither exists yet; create on first use.
- Unit tests sit beside the module they exercise as `<module>.test.ts`. Database tests go in `supabase/tests/database/<subject>.test.sql` and must open with their own `begin;` and `create extension if not exists pgtap;` — pgTAP is deliberately never added to a migration.
- Supabase migrations: `supabase/migrations/YYYYMMDDHHmmss_short_description.sql`. Enable RLS on every new table, with one policy per operation (`select` / `insert` / `update` / `delete`) × role (`anon`, `authenticated`), each scoped to the caller's building. A single `FOR ALL` policy, or one that omits `anon`, does not pass review — per the PRD only administrators authenticate, while owners vote through an emailed per-unit link with **no session**.

## Where things are documented

Five owners. A paragraph that fits none of them is in the wrong file; a paragraph that fits two is a duplicate — delete one.

| Owner                                | Holds                                                                               | Never holds                       |
| ------------------------------------ | ----------------------------------------------------------------------------------- | --------------------------------- |
| **this file**                        | the rules, one to three sentences each                                              | evidence, procedure, build status |
| `@README.md`                         | procedure — which commands in which order, what to paste where                      | why something broke               |
| `context/foundation/system-state.md` | the evidence behind each rule above                                                 | anything not already a rule here  |
| `context/foundation/roadmap.md`      | build status — the "At a glance" table is the **only** place a slice is marked done | rules                             |
| `context/changes/<id>/`              | one change: its plan, research, review                                              | anything spanning changes         |

`context/foundation/` also holds the durable product docs (`prd.md`, `tech-stack.md`, `infrastructure.md`, `test-plan.md`, `lessons.md`); `context/docs/` holds explanatory material addressed to a person rather than to a tool.
