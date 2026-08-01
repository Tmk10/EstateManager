# Production Administrator Access (F-01) — Plan Brief

> Full plan: `context/changes/production-admin-access/plan.md`

## What & Why

Roadmap item `F-01`, the first foundation. Nobody has ever successfully logged into production —
only *rejection* of bad credentials is proven — and the app still ships a registration path the
product decided against. Meanwhile a missing or rotated Supabase secret produces a **green** deploy
of a non-functional app. This change makes administrator access real and demonstrated, and makes
both failure modes loud.

## Starting Point

Production is live and auto-deploys on every push to `main`. Auth works locally; `/auth/signup`
still returns `200` on the live Worker, alongside `/auth/confirm-email` and a sign-up endpoint that
contradict the 2026-08-01 decision that accounts are created by hand in the Supabase dashboard. The
sign-in page's notice about that decision already landed in `b1a9e6f`. `/api/health` already detects
a broken Supabase connection — but nothing consumes its verdict. The MVP account `test@test.com`
does not yet exist in the production Supabase project.

## Desired End State

An administrator opens the live URL, signs in with the account created in the Supabase dashboard,
and lands on `/dashboard` with a session that survives a reload and ends cleanly on sign-out.
`/auth/signup` returns `404`. A deploy whose Worker cannot reach Supabase goes red instead of green,
and a commit that fails lint has been *shown* not to reach `wrangler deploy`.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| How a broken secret fails | Post-deploy `/api/health` assertion in `deploy.yml` | Only a runtime probe sees a missing **Workers Secret** — CI builds with GitHub secrets while the Worker reads platform secrets the build never sees. |
| Env vars stay `optional: true` | Rejected making them required | With `access: "secret"` they validate at runtime, so the Worker would throw inside `/api/health` itself, killing the probe that diagnoses the problem. |
| On assertion failure | Retry briefly, then fail the job — no auto-rollback | `/api/health` returns `503` for both "misconfigured" and "Supabase down", so the verdict needs a human, not an automatic revert. |
| Registration removal scope | Every reachable trace: 4 files deleted, 2 links, README | Anything less leaves live links to dead routes — worse than today. |
| Deleted routes respond | `404`, no tombstone redirect | The product has no registration; a redirect makes "no registration screen" true-ish rather than true. |
| Post-login destination | `/dashboard` instead of `/` | Lands the admin on the only authenticated surface and gives `S-01` its natural home. |
| Smoke test depth | Full session round trip, manual | Cookie-based `@supabase/ssr` sessions on workerd are the part most likely to differ from local, and have never run. |
| Account creation | Its own phase, first | Verifying against unchanged production separates "the account works" from "our changes work". |
| Local vs cloud account | Local seeded automatically; cloud must pre-exist | Local data is disposable and wants zero friction; production must have no code path capable of minting administrators. Also means no service_role key is ever handled. |
| Local seeding mechanism | `supabase/seed.sql` | `config.toml` already declares `[db.seed] sql_paths = ["./seed.sql"]` and the file is missing — and it is the file `S-01` extends with buildings and units. |
| Deploy-gate proof | In scope, final phase | It substitutes for branch protection and has no natural home in any later roadmap item. |

## Scope

**In scope:** a local `supabase/seed.sql` that auto-creates the administrator account, plus
verification that the cloud account works; deleting `signup.ts` / `signup.astro` /
`confirm-email.astro` / `SignUpForm.tsx`;
removing the Topbar and Welcome links; post-login redirect to `/dashboard`; a post-deploy health
assertion in `deploy.yml`; the production smoke test; proving the lint gate; syncing README,
the deployment runbook, PRD §Access Control, `CLAUDE.md` §Current state and the roadmap status.

**Out of scope:** any repo code path that creates users in the *production* project (no script, no
seed, no service_role key — production accounts stay a manual dashboard prerequisite by design);
seed data beyond the admin account (`S-01` extends the same file); `PROTECTED_ROUTES` (nothing new
to protect until `S-01`); rebuilding `/dashboard`;
replacing the public test credentials (PRD Open Question 3); making env vars required; a middleware
kill-switch; auto-rollback; unrelated starter debt (`config-status.ts` link, sitemap `site`, Node 20
annotations).

## Architecture / Approach

Four commits straight to `main` — no branches, per `lessons.md`. Phases 1–2 are code and CI; because
every push auto-deploys, Phase 3 verifies exactly what they shipped. Phase 4 goes last because it is
the only phase that deliberately reddens CI, and because its documentation updates depend on Phase
3's result. The shared auth components stay — `SignInForm.tsx` imports all four.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 0. Seed locally, verify on cloud | Local admin auto-created by `seed.sql`; cloud admin proven to work | Hand-written `auth.users` rows are brittle — a missing `auth.identities` row yields a user that exists but cannot sign in |
| 1. Remove the registration path | `/auth/signup` gone; sign-in lands on `/dashboard` | Deleting a shared component by mistake — the four `auth/` helpers are co-owned with the sign-in form |
| 2. Assert deploy health in CI | A broken deploy turns the run red | A one-shot probe would flake on edge propagation or a Supabase blip; retry semantics are the whole trick |
| 3. Verify access on production | The first successful production login, demonstrated | Blocked on Phase 0 and on Phases 1–2 being live |
| 4. Prove the gate, sync the record | Lint gate demonstrated; docs match reality | lint-staged's `eslint --fix` will silently repair the deliberate error — the commit **must** use `--no-verify` |

Phase 0 goes first because it verifies the cloud account against production *before* any code
changes, so a Phase 3 failure reads as a defect in the shipped code rather than a bad account. It
also settles a question nothing else can: Workers Secrets are write-only, so signing in through the
live Worker is the only available proof that the account lives in the project the Worker uses.

**Prerequisites:** `test@test.com` / `Test123!` must already exist in the *production* Supabase
project, confirmed (dashboard → Authentication → Users → Add user, **Auto Confirm User** ticked).
Docker and ~7 GB RAM if you want to verify the local seed. Node 22.14.0 per `.nvmrc`.

**Estimated effort:** one session for Phases 0–2, a short second one for 3–4.

## Open Risks & Assumptions

- **The public test credentials remain public.** Anyone who knows the URL has full administrator
  access, including the owner registry once `S-01` lands. Accepted for a PoC on test data only —
  tracked as PRD Open Question 3, and blocking before any real building is imported.
- **The health assertion detects, it does not prevent.** The bad version is already live when the
  run goes red; rollback stays a documented manual step.
- **Phase 4 is the one step that can fail informatively.** If the deliberate lint error *doesn't*
  stop the deploy, the gate `CLAUDE.md` relies on does not exist and this change has found a real
  problem rather than confirming a good one.
- **Assumed:** production Supabase still holds valid `anon` credentials as Workers Secrets —
  `/api/health` returned `200` during planning.
- **The local seed ships unexercised unless you run the local stack.** `.dev.vars` currently points
  at the hosted project and there is no `supabase/migrations/` yet, so nothing forces the seed to be
  correct until `S-01` brings a real local database. `auth.users` is Supabase-owned and its columns
  have shifted across GoTrue versions — that is why the seed is verified by *signing in*, not by
  selecting the row.
- **The asymmetry needs its reason recorded, not just its shape.** Local-auto/cloud-manual reads as
  an inconsistency to anyone who finds it undocumented, and the obvious "fix" is to script
  production account creation — exactly what it exists to prevent. Phase 4 writes the reason down.

## Success Criteria (Summary)

- An administrator can sign in on production, stay signed in across a reload, and sign out — shown,
  not assumed.
- `/auth/signup` returns `404`; nothing in the app links to a registration screen.
- A Worker that cannot reach Supabase, or a commit that fails lint, produces a red run — both
  demonstrated once rather than believed.
