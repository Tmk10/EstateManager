# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

EstateManager — share-weighted resolution voting for Polish housing communities (_wspólnoty mieszkaniowe_). Read `context/foundation/prd.md` before building any feature; the domain rules (quorum, share weighting, per-unit voting links) live there, not in the code. The PRD and all user-facing copy are in **Polish**; keep code, comments, and commits in English.

How far along the project actually is: see "Current state" at the bottom.

## Hard rules

- **`main` is the only long-lived branch; worktrees are the workspace.** Work lands on `main` — there is no PR flow, so never open one and never ask which branch to target. Changed 2026-08-02: agent work that may edit code (implementation, review triage, anything running agents in parallel) happens in a **git worktree** under `.claude/worktrees/`, because concurrent agents editing one checkout clobber each other. The worktree branch is scratch — it isolates the edits and returns to `main` when the task is done. Do not leave abandoned worktree branches behind; the repo already carries two from an older habit (`docs/agent-onboarding`, `fix/ci-branch-trigger`), which is the failure this rule replaces, not repeats. Documentation-only or single-agent work may edit `main`'s checkout directly. **Check the worktree's base ref before trusting it**: it branches from `origin/main` by default, which can sit behind local `main` — verify with `git log --oneline origin/main..main` and reset the worktree onto local `main` if they differ. Committing is opt-in: wait to be asked. There **is** a remote (`origin` → GitHub, public), and pushing to `main` deploys to production — so treat a push as its own opt-in, separate from the commit.
- **There is no test runner.** No `npm test`, no test files, no framework installed. Verify with `npm run lint && npm run build`. Never report that tests passed.
- **`context/archive/` is immutable.** Never write there. Open a new change under `context/changes/` instead.
- **Supabase env vars are `optional: true`** in `astro.config.mjs`. When unset, `createClient()` in `src/lib/supabase.ts` returns `null` and every auth path silently no-ops — the build stays green and the app deploys broken. Any new code touching Supabase must handle the `null` client, and any new required secret should be surfaced through `src/lib/config-status.ts` (the banner shown by `src/components/Banner.astro`).
- **Type-aware lint needs generated types.** Run `npx astro sync` before `npm run lint` on a fresh clone or after changing `astro.config.mjs` — ESLint uses `strictTypeChecked` with `projectService`, and CI does the sync explicitly for this reason.
- **Never rename project identifiers piecemeal.** The rename to `estate-manager` is recorded in `context/changes/deployment/deployment.md` (step A1); touching one manifest without the others breaks the deploy. The Worker name is also the `*.workers.dev` hostname, so renaming it creates a second Worker rather than moving the first.

## Commands

Full script list is in `@package.json`. What it doesn't tell you:

- `npm run dev` boots the Cloudflare workerd runtime, not plain Node — runtime differences from Node show up here, not at deploy time.
- `npm run lint` is type-aware and needs `npx astro sync` first (see above).
- `npx supabase start` needs Docker and ~7 GB RAM. On this machine Docker Desktop puts its socket at `~/.docker/run/docker.sock` and creates no `/var/run/docker.sock`, so every `supabase` command needs `DOCKER_HOST=unix://$HOME/.docker/run/docker.sock` — or enable *Settings → Advanced → Allow the default Docker socket* once and forget about it. The `docker` CLI itself lives in `/Applications/Docker.app/Contents/Resources/bin` and is not on `PATH` by default.
- `npm run db:types` regenerates `src/db/database.types.ts` from the **local** stack, so the stack must be up and migrated first.
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

- **The data layer exists, and one slice of the PRD is built.** `S-01` (`building-create`) shipped on 2026-08-02: an administrator creates a building at `/buildings/new` (name, city, street-with-number — PRD `FR-011`) and sees it listed at `/buildings`. That is the whole of the domain so far; lokale, udziały, uchwały and głosowanie are all still unbuilt (`S-01b` onward). Record: `context/changes/building-create/`.
- **Migrations are applied by hand — nothing in CI does it.** `supabase/migrations/` holds the schema; `deploy.yml` never invokes the `supabase` CLI and there is no service-role secret anywhere. Applying a migration is `npx supabase db push` from a linked checkout, run **before** pushing the code that depends on it — reversed, production serves code querying a table that does not exist. It is forward-only: `wrangler rollback` reverts code, never schema. This is open residual **G14** in `context/changes/deployment/deployment.md`.
- **`src/db/database.types.ts` is generated, committed, and never regenerated by CI.** Run `npm run db:types` (needs the local stack up) after every migration and commit it in the **same commit** as the migration — the same discipline `worker-configuration.d.ts` needs, and for the same reason. It is excluded from ESLint (Supabase's generator does not emit Prettier-formatted output); TypeScript still checks it. Worth knowing before trusting it: a wrong **table** name and a wrong column in an **insert/update** payload are both compile errors, but a wrong column inside a `.select("…")` string is **not** — this version of `supabase-js` does not type-check the projection string.
- **RLS is proven, not just declared, on `public.buildings`.** Eight policies — four `authenticated` (predicate `true`; PRD v1 has no roles model, every user is an administrator) and four `anon` (predicate `false`). Verified through PostgREST rather than by reading `pg_policy`: anon `select` returns `[]`, anon `insert` fails `42501`. Copy this shape for every new table, and note that `update` needs **both** `using` and `with check` — `using` gates which rows may be touched, `with check` gates what they may become.
- **Deployed and live** at https://estate-manager.estate-manager.workers.dev (Workers **Paid** since 2026-08-01 — `F-02` needed it, Email Sending is unavailable on Free). Identifiers were renamed to `estate-manager` on 2026-08-01. `/api/health` returns `200 {"status":"ok","email":"…"}` when the Worker can reach Supabase and `503` when it cannot — check it first when the app misbehaves. Prerequisites, deployment log and residuals: `context/changes/deployment/deployment.md`.
- **Auto-deploy works, and the gate is proven.** Every push to `main` runs `.github/workflows/deploy.yml` (`npm ci → astro sync → lint → build → wrangler deploy → assert /api/health`). The negative case was demonstrated on 2026-08-01: a deliberate lint error failed the job at `npm run lint` with build, `wrangler deploy` and the health assertion all **skipped**, and the live version untouched (runs `30713400532` red, `30713455557` green). That in-job ordering is still the only gate standing in for branch protection — proven, but only as long as nobody reorders the workflow.
- **A green deploy now means the app answers.** `deploy.yml`'s final step curls `/api/health` and fails the job on anything but `200` (5 retries, 5s apart). This is the only check that can catch a missing or rotated **Workers Secret** — CI builds with GitHub secrets while the running Worker reads platform secrets the build never sees. A red assertion needs a human: `503` means *either* missing credentials *or* Supabase unreachable, and there is deliberately no auto-rollback.
- **Administrator login is verified on production (2026-08-01).** The full round trip ran against the live Worker — sign in → `/dashboard` → survives a reload → sign out → `/dashboard` bounces to `/auth/signin` — in `curl` and in a browser. First successful production login; it proves cookie-based `@supabase/ssr` sessions work on workerd. Record: `context/changes/deployment/deployment.md`.
- **No self-service registration — by product decision (2026-08-01).** Administrator accounts are created directly in the database via the **Supabase dashboard** (Authentication → Users → Add user, with *Auto Confirm User*) — PRD §Access Control, procedure in `@README.md`. The MVP account is `test@test.com` / `Test123!`, and `/auth/signin` displays it alongside "accounts are created in the Supabase dashboard". `/auth/signup`, `/auth/confirm-email` and `src/pages/api/auth/signup.ts` are **gone** — `F-01` deleted them; all three now return `404` in production. Consequence: Supabase Site URL (runbook step B7) and email confirmation are no longer blockers, because no product flow sends a confirmation link.
- **Local seeds an admin, production never does.** `npx supabase db reset` applies `supabase/seed.sql` and provisions `test@test.com` / `Test123!` locally with no manual step. Nothing in this repo creates users in the **production** project — no script, no seed, no service-role key; production accounts are made by hand in the dashboard. The asymmetry is deliberate (a code path that mints administrators against production is a standing risk to the owner-data guardrail); do not "fix" it. Rationale in `@README.md`. The seed **has now run** (`S-01`, 2026-08-02): its `auth.users` assumptions hold, verified the only way that proves anything — by signing in, not by selecting the row. It also seeds one demo building. Every insert in it is idempotent, so it can be replayed against a live local database; note that `npx supabase seed` does **not** re-run it (that command only exposes a `buckets` subcommand), so replaying means piping the file into `psql` yourself.
- **Node.** `.nvmrc` pins 22.14.0 and CI uses node 22; `fnm` is installed for this. If your shell has a different major, run `eval "$(fnm env)" && fnm use` before lint/build.
- **CI is live.** `.github/workflows/ci.yml` runs lint + build on push/PR to `main`. `SUPABASE_URL` / `SUPABASE_KEY` are set as repository secrets.
- **The transactional mail channel works, proven from production (2026-08-01).** `F-02` connected Cloudflare Email Service through the native `send_email` binding — no API key. Mail goes out from `glosowanie@estatemanager.dev` (our own domain; Cloudflare has no provider test domain). First production send: `messageId <zp7Un3ZRDflfWr2q1xX3WSCOh3YQE04aIPGy@estatemanager.dev>`, fired by a signed-in administrator through `POST /api/email/test`, which stays in the repo as a live smoke test on a **beta** API. `src/lib/email.ts` is the only module importing `cloudflare:workers` — reach the binding through it, never directly, and note that `Astro.locals.runtime.env` does not exist on Astro 6 + adapter 13. Cloudflare's real quota is **200 messages/day**. Record: `context/changes/transactional-mail-channel/change.md`.
- **A missing `EMAIL` binding does not fail the deploy — deliberately.** `/api/health` reports `"email":"ok"|"missing"` inside its `200`, and the config-status banner shows it, but neither flips the status code: `deploy.yml`'s `curl --fail` still passes with a dead mail channel. This is a knowing step down from the Supabase treatment `F-01` built, on the grounds that a beta channel should not block shipping the rest of the app. Revisit when `S-04` makes the channel load-bearing for a real building.
- **`worker-configuration.d.ts` is committed and CI never regenerates it.** `deploy.yml` runs `astro sync` but not `wrangler types`, so the committed file is CI's only source of binding types — regenerate and commit it **in the same commit** as any `wrangler.jsonc` change, or local lint stays green while CI types the binding wrongly. The order that works: `npx wrangler types && npx astro sync && npm run lint && npm run build`. The file is excluded from ESLint (generated, ships its own disable directives); TypeScript still checks it.
- **Every form endpoint needs an `Origin` header when called with `curl`.** Astro's `security.checkOrigin` is on by default and runs *before* middleware, so a form POST without `Origin` gets `403 Cross-site POST form submissions are forbidden` — not the auth redirect you were testing for. Applies to `/api/auth/signin` and `/api/email/test` alike. Add `-H "Origin: <the origin you are calling>"`.
- **Known advisory:** `astro@6.3.1` carries a high-severity reflected XSS (range `<=7.0.9`) with no fix in the 6.x line. Accepted for now — see the residuals table in `context/changes/deployment/deployment.md` before upgrading.

<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 2, Lesson 3

Review AI-generated code before merge with the **implementation review chain**:

```
/10x-implement -> /10x-impl-review -> triage -> (/10x-lesson | fix | skip | disagree)
```

`/10x-impl-review` is the lesson focus. Review is a quality gate, not an instruction to fix every finding.

### Task Router - Where to start

| Skill | Use it when |
| --- | --- |
| **Code review (lesson focus)** | |
| `/10x-impl-review <change-id>` | You have implemented code and want a structured review before merge. The skill checks plan adherence, scope discipline, safety and quality, architecture, pattern consistency, and success criteria, then presents findings for triage. |
| **Recurring lesson outcome** | |
| `/10x-lesson` | A finding reveals a recurring project rule or agent failure pattern. Record it in `context/foundation/lessons.md` instead of treating it as a one-off note. |

### Triage discipline

- Severity says how bad the finding is. Impact says how much the decision matters now.
- Valid outcomes: fix now, fix differently, skip, accept as risk, record as recurring rule (`/10x-lesson`), disagree.
- Fix critical findings. Do not burn hours on low-impact observations just because the agent found them.
- Conscious skipping of low-impact findings is a valid review outcome, not negligence.
- If you disagree with a finding, record why. Wrong agent reasoning is also signal.

### Review boundaries

- This lesson reviews implemented code. It does not create the plan, execute new phases, or teach CI review.
- Testing strategy and quality gates are introduced in Module 3.
- Do not use `/10x-contract` as a triage outcome in this lesson.

### Paths used by this lesson

- `context/changes/<change-id>/plan.md` - expected implementation contract
- `context/changes/<change-id>/reviews/` - review output
- `context/foundation/lessons.md` - recurring lessons

Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->
