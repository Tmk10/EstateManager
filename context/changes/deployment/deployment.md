---
project: estate-manager
created_at: 2026-08-01
updated_at: 2026-08-01
doc_type: deployment-runbook
status: executed
platform: Cloudflare Workers
sources:
  - context/foundation/infrastructure.md
  - context/foundation/tech-stack.md
placement_note: >
  Consolidated on 2026-08-01 from deployment-plan.md, deployment-preflight.md
  and context/foundation/deployment-history.md. Held under context/changes/
  because that is where it was written, but it is now a standing runbook rather
  than a one-time plan — it is re-read before every deploy. Promote it to
  context/foundation/ if that keeps being true. Do not let this folder be
  archived: context/archive/ is immutable and not routinely read.
---

# Deployment — EstateManager on Cloudflare Workers

**Status: executed 2026-08-01.** Production is live at
<https://estate-manager.estate-manager.workers.dev> and every push to `main`
redeploys it. Two items from the original plan remain outstanding — see
[Outstanding](#outstanding).

This document is three things at once: what is deployed **now**, what must be
true **before** you deploy, and the runbook that got us here. Read
[Current state](#current-state) first; read [Prerequisites](#prerequisites)
before touching anything.

---

## Current state

| | |
|---|---|
| **URL** | <https://estate-manager.estate-manager.workers.dev> |
| **Worker** | `estate-manager` |
| **Cloudflare plan** | Workers **Free** |
| **Deploy trigger** | push to `main` → `.github/workflows/deploy.yml` |
| **Health probe** | `GET /api/health` → `200 {"status":"ok"}` |
| **Live version** | `4fbe8892-6de0-4646-94d0-1da58a391e4b` (CI-authored, 100%) |
| **Supabase** | hosted project, EU Frankfurt (`eu-central-1`), `anon` key |
| **Secrets in Workers** | `SUPABASE_URL`, `SUPABASE_KEY` (write-only, no read-back) |
| **Secrets in GitHub** | `CLOUDFLARE_API_TOKEN`, `SUPABASE_URL`, `SUPABASE_KEY` |
| **KV** | `SESSION` → `1a914a1c1f00405794482cea29c6bfd3` (pinned in `wrangler.jsonc`) |

**First deploy:** commit `f8d35e10a6a6b0524ff170eb584787aebf1a210f`, version
`b86cd1b3-830e-459f-bc80-a2137a492c7c`, bundle 1913 KiB raw / 391 KiB gzip,
Worker startup 21 ms.

**Rollback targets:** `545af708-218a-450e-a1c5-951fc8917102` and
`10ff270e-33e3-4f30-93c9-c5d853942611` (both created implicitly by
`wrangler secret put`). Also `d411e297-ac61-476e-b060-bb3ae4df0ca5` — the
initial deploy, **do not roll back to this one**, it predates the secrets and
has no credentials.

`infrastructure.md` is deliberately **not** touched by deployments. It stays the
research-and-decision artifact, and its value depends on not being retrofitted
after the fact.

### What was verified

| Check | Result |
|---|---|
| `astro sync` + `lint` + `build` (node 22.14.0) | green |
| Local `/api/health` with `.dev.vars` | `200 {"status":"ok"}` |
| Local `/api/health` without `.dev.vars` | `503 misconfigured / missing-credentials` |
| Production `/api/health` **before** secrets | connection failed — TLS cert for a first-ever `*.workers.dev` subdomain was still provisioning |
| Production `/api/health` after secrets + redeploy | `200 {"status":"ok"}` — proves the Worker reaches Supabase with the anon key |
| Production `/`, `/auth/signin` | `200` |
| Production `/auth/signup`, `/auth/confirm-email` | `404` — **revised 2026-08-01**, both answered `200` until `F-01` deleted the registration path (PRD §Access Control). `wrangler.jsonc`'s `not_found_handling: "404-page"` handles them; no stub and no tombstone redirect |
| Production `/dashboard` unauthenticated | `302` → `/auth/signin` |
| Production `/does-not-exist` | `404` |
| Production `POST /api/auth/signin`, bad credentials | `302` → `/auth/signin?error=Invalid%20login%20credentials`. The error text comes from Supabase Auth, so the deployed Worker really does authenticate against the cloud project |
| **Functional smoke, authenticated half** | **passed 2026-08-01** (`F-01` Phase 3) — see below |
| **The deploy gate's negative case** | **proven 2026-08-01** (`F-01` Phase 4) — see below |
| Config-status banner in production | absent — secrets are being read |
| `wrangler tail` while exercising the above | attached (`Connected to estate-manager`), logged `POST /api/auth/signin - Ok`, **no exceptions and no `nodejs_compat` stub errors** |
| `ci.yml` on push to `main` | **success** |
| `deploy.yml` on push to `main` | **success** — ran green end to end on two separate commits and published each as current at 100% |
| Rollback available | yes — see targets above |

### What was verified later, by `F-01`

Both entries below were open items on 2026-08-01 and were closed the same day by
`production-admin-access`. Kept as prose rather than table rows because the
*result* is the durable part, not the pass/fail.

- **Functional smoke, authenticated half — passed.** The MVP account
  `test@test.com` / `Test123!` was added by hand in the production Supabase
  dashboard (*Auto Confirm User* ticked), then the full round trip ran against
  the live Worker with a `curl` cookie jar and again in a browser:
  `POST /api/auth/signin` → `302` to `/dashboard` with the
  `sb-…-auth-token` cookie set; `GET /dashboard` → `200` rendering the account
  email; a second `GET /dashboard` on the same jar → `200`, so the session
  survives a reload; `POST /api/auth/signout` → `302` to `/`; `GET /dashboard`
  → `302` back to `/auth/signin`. This is the first successful login ever
  performed in production, and it proves cookie-based `@supabase/ssr` sessions
  work on workerd — the divergence class `astro dev` cannot reproduce.
- **The deploy gate's negative case — proven.** Commit `11968c0` introduced an
  unused module-scope const in `src/lib/utils.ts` and was pushed with
  `git commit --no-verify`, because lint-staged's `eslint --fix` runs on
  `*.{ts,tsx,astro}` and would otherwise have blocked the commit, leaving the
  gate unexercised. `Deploy` run **30713400532** failed at `npm run lint`;
  `npm run build`, `cloudflare/wrangler-action@v3` and the health assertion were
  all marked **skipped**, not failed-after-attempting. `/api/health` answered
  `200` throughout — the live version was untouched. `ci.yml` failed on the same
  commit, which is the same gate, not a second problem. Revert `ffeac9f`, run
  **30713455557**, went green through all nine steps. This closes the
  demonstration [D15](#d-cicd--auto-deploy-on-merge) deferred branch protection
  onto; the **G13 residual stays open** — a proven gate is not branch protection,
  and it still depends on nobody disabling or reordering the workflow.

### Outstanding

1. ~~**Supabase → Auth → URL Configuration: set Site URL** (step **B7**).~~
   Dropped 2026-08-01: with accounts created by hand in the Supabase dashboard
   and no registration in the product, nothing sends a confirmation link, so the
   Site URL no longer gates any flow. Reopen this if a v2 flow (password reset,
   invitations) starts mailing links.
2. ~~**Prove the deploy gate.** Push a commit with a deliberate lint error,
   confirm `deploy.yml` fails without deploying, then revert.~~
   Closed 2026-08-01 by `F-01` Phase 4 — runs `30713400532` (red, no deploy) and
   `30713455557` (green). See [What was verified later](#what-was-verified-later-by-f-01).
3. ~~**Run the functional smoke test** above. Needs the MVP account
   `test@test.com` / `Test123!` added in the cloud Supabase project's dashboard
   (Authentication → Users → Add user, *Auto Confirm User* ticked).~~
   Closed 2026-08-01 by `F-01` Phase 3 — the account was added in the dashboard
   and the full round trip passed. See
   [What was verified later](#what-was-verified-later-by-f-01).
4. `src/lib/config-status.ts:16` still links the banner to the
   `10x-astro-starter` README. Left alone because this change freezes `src/lib/`.
5. ~~Optional cleanup: `actions/checkout@v4` and `actions/setup-node@v4` trigger
   a Node 20 deprecation annotation on every run.~~ Closed 2026-08-02: both
   workflows moved to `actions/checkout@v7`, `actions/setup-node@v7` and
   `cloudflare/wrangler-action@v4`, all of which declare `node24`, so the runner
   no longer force-substitutes a Node version. The `site` option is still unset
   in `astro.config.mjs`, so `@astrojs/sitemap` is installed but silently
   generates nothing.

### Open residuals

| ID | Item | State |
|---|---|---|
| **G6** | Silent credential failure | **mitigated** — `/api/health` |
| **G13** | No branch protection / required checks | **open** — D15 deferred; the in-job lint→build→deploy ordering is the substitute. Revisit when a second contributor joins or before the first real building is imported |
| **G14** | No migration history | **open** — matters the moment a real schema exists, because `wrangler rollback` reverts code only |
| **G15** | No staging environment | **open** |
| — | **`astro@6.3.1` reflected XSS via unescaped slot name** (high, direct dep, advisory range `<=7.0.9`) | **open, accepted** — no fix exists in the 6.x line; 6.4.8 is still in range and the first fixed release is 7.0.10, a major bump that would also move `@astrojs/cloudflare` past the verified 13.5.0. Low exposure today: no domain code renders user-controlled slot names. Revisit before the first real building is imported |
| — | Preview URLs public by default | **open** — harmless while no owner data exists; needs Cloudflare Access before any preview points at a real registry |
| — | Workers Paid ($5/mo) | **not triggered** — trigger is the first real building import |

---

## Prerequisites

Everything here must be green **before** a deployment session starts, and before
Section A of the runbook. These are external accounts and credentials an agent
cannot create — this is the entire set of things that must exist outside the
repo.

| System | What must be true | Verify with | Needed by |
|---|---|---|---|
| **Cloudflare account** | Account exists; `npx wrangler login` completed (interactive OAuth). Know your `*.workers.dev` subdomain and whether Workers Paid is on — this runbook assumes Free. | `npx wrangler whoami` → shows an account, not "not authenticated" | C9, C11 |
| **Cloudflare API token** | Created from the *Edit Cloudflare Workers* template. Store it the moment it appears — shown once, never again. | see [the token gotcha](#gotcha-the-ci-token-is-account-owned) | D13 |
| **GitHub repository** | Repo exists with `main` pushed. **Currently public** — chosen deliberately. | `git remote -v` → shows `origin` | D12 |
| **Supabase project** | Created in **EU (Frankfurt / `eu-central-1`)**. Project URL + **`anon`** key from Settings → API. | both values in hand | B5–B8 |
| **Local toolchain** | Node 22.14.0 per `.nvmrc` (`fnm` is installed for this: `eval "$(fnm env)" && fnm use`); dependencies installed. | `node -v`, then `npm ci` completes clean | A4 |
| **`SESSION` KV namespace** | Exists and its id is pinned in `wrangler.jsonc`. | `npx wrangler kv namespace list` | C11, D14 |

**State as of 2026-08-01: all six green.**

### Three of these are expensive to get wrong

Ordinary mistakes elsewhere in the deployment cost a re-run. These do not:

1. **Supabase region is immutable after project creation.** Getting it wrong
   means recreating the project and re-issuing every credential. EU Frankfurt is
   not a preference — it is the mitigation for dissent item **D4** in
   [`infrastructure.md`](../../foundation/infrastructure.md): Worker compute
   location cannot be pinned below an Enterprise plan, so where the *data* lives
   is the only residency lever this architecture has. The RODO question is still
   PRD Open Question #1.
2. **The `anon` key, never the service-role key.** `src/lib/supabase.ts` uses
   `@supabase/ssr` cookie-based auth. A service-role key deployed to a Worker
   bypasses Row Level Security entirely, on an app whose guardrail is *"dane
   właścicieli nie wychodzą poza budynek"*.
3. **The Worker name becomes the hostname.** `wrangler.jsonc` `name` is both the
   Worker identity and the `*.workers.dev` subdomain. Renaming after the first
   deploy creates a *second* Worker rather than moving the first — which is why
   the rename to `estate-manager` was step A1, before anything was deployed.

### Standing instruction for a deployment session

**Ask, do not assume.** Verify each row above with its stated command rather
than from memory, and stop to ask whenever something is missing, ambiguous, or
differs from what this document records — rather than inventing a value or
working around the gap. The pre-flight was stale **in both directions** on
2026-08-01: it claimed wrangler was unauthenticated and `gh` absent, and both
were false.

Specifically, never guess at: Worker name, Supabase region, key type (`anon` vs
service-role), API token scope, repository visibility or remote URL, or whether
the Workers Paid plan is active.

---

## Runbook

Recorded as executed. Each section notes where execution diverged from the plan
as approved — silent drift is what makes runbooks rot.

### Context

[`infrastructure.md`](../../foundation/infrastructure.md) selects **Cloudflare
Workers** as the MVP platform (with recorded dissent), and
[`tech-stack.md`](../../foundation/tech-stack.md) records
`ci_default_flow: auto-deploy-on-merge`. This runbook took the repo from
"scaffolded, verified locally" to "running in production on Cloudflare Workers,
redeployed automatically on merge to `main`". It also landed the highest-severity
item from the degradation analysis — **G6**, where a missing or rotated Supabase
credential produces a *green deploy of a non-functional app*, because both env
vars are declared `optional: true`.

Two conflicts, resolved:

1. **`auto-deploy-on-merge` vs. "`wrangler deploy` to production requires a
   human."** `infrastructure.md`'s approval matrix puts production deploys on
   the human-required list, while `tech-stack.md` asks for auto-deploy.
   Resolution: **a merge to `main` is that human act.** No agent-initiated
   production deploys either way.
2. **`tech-stack.md` recorded `cloudflare-pages`; Pages is in maintenance mode**
   and adapter v14 dropped support outright. Fixed in A3 — the code
   (`wrangler.jsonc` Static Assets path) was already correct; only the contract
   document was stale.

### A. Repo prep — agent, no external accounts needed

**A1. Rename off the starter identity.** Must precede the first deploy:
`wrangler.jsonc` `name` becomes the Worker name *and* the `*.workers.dev`
hostname, so renaming later creates a new Worker rather than moving the existing
one.

- `package.json:2` → `"name": "estate-manager"`
- `wrangler.jsonc:3` → `"name": "estate-manager"`
- `supabase/config.toml:5` → `project_id = "estate-manager"`

> **Deviation.** `package-lock.json` was renamed too — the plan listed three
> files. The lockfile carries the package name in two places, and leaving it
> stale would desync it from `package.json`, which `npm ci` in `deploy.yml`
> depends on.

**A2. Add `src/pages/api/health.ts`** — the G6 mitigation. A presence check
alone does not catch a *rotated* key, which is G6's actual scenario, so the
route does both:

- reuse the env import style of `src/lib/config-status.ts`
  (`import { SUPABASE_URL, SUPABASE_KEY } from "astro:env/server"`);
- if either is absent → `503 { status: "misconfigured", supabase: "missing-credentials" }`;
- otherwise probe `GET ${SUPABASE_URL}/auth/v1/health` with the `apikey` header
  and a short `AbortSignal.timeout`; non-OK or throw → `503`; OK → `200 { status: "ok" }`;
- never echo the URL or key in the body; follow the `APIRoute` shape used by
  `src/pages/api/auth/signout.ts`;
- leave it out of `PROTECTED_ROUTES` in `src/middleware.ts` — it must answer
  before auth works.

`optional: true` in `astro.config.mjs` deliberately **stays**: local dev and
preview builds depend on the degrade-to-banner behaviour. The health route is
what makes the same condition loud in production.

> **Deviation.** `503` bodies carry a `status` field the plan did not specify.
> The plan gives `503 { supabase: "unreachable" }`; the implementation emits
> `{ status: "degraded", supabase: "unreachable" }` for consistency with the
> other two responses.

**A3. Fix the stale docs.** `README.md` — retitle to EstateManager, correct
`## CI` (`master` → `main`), point `## Deployment` at the real flow, document
`/api/health`, add the cloud-Supabase-in-EU note. `tech-stack.md:8` →
`deployment_target: cloudflare-workers`.

**A4. Verify the build locally.** `npx astro sync && npm run lint && npm run build`;
confirm `dist/` contains a Workers bundle consumable by `wrangler.jsonc`'s
`main: "@astrojs/cloudflare/entrypoints/server"`. Adapter 13.5.0 exports that
entrypoint — verified against `node_modules`.

> **Deviation.** Node was v26.0.0 locally against a `.nvmrc` pin of 22.14.0.
> `fnm` was installed and 22.14.0 made active, so local verification matches
> CI's node 22 rather than diverging from it.

### B. Supabase production project — human performs, agent supplies exact values

**B5.** Create the hosted project, **region EU (Frankfurt / `eu-central-1`)** —
the D4 / T1 mitigation, and immutable after creation.
**B6.** Copy the Project URL and the **`anon`** key (Settings → API). Not the
service-role key.
**B7.** Auth → URL Configuration: set Site URL to the Worker hostname, once C11
produces it. **← dropped 2026-08-01, see Outstanding (1).**
**B8.** Write both values into a local `.dev.vars` (gitignored — confirmed) so
`npm run dev` runs against real workerd *and* real Supabase.

~~Email confirmation stays **on** (the production default); the smoke test uses a
real inbox.~~ Superseded 2026-08-01: administrator accounts are created by hand
in the Supabase dashboard (PRD §Access Control), the product has no registration,
and the smoke test signs in with the MVP account `test@test.com` / `Test123!`.

### C. First production deploy

**C9.** `npx wrangler login` — interactive, cannot be delegated.
**C10.** `npx wrangler secret put SUPABASE_URL`, then `SUPABASE_KEY`. Write-only;
there is no read-back, ever.
**C11.** `npm run build && npx wrangler deploy` → note the
`estate-manager.<subdomain>.workers.dev` hostname and feed it back into B7.

**Ordering wrinkle:** `wrangler secret put` requires the Worker to exist, which
on a first-ever deploy it does not. The real sequence is **C11 → C10 →
redeploy**. That leaves a window where the Worker is live with no credentials,
serving the config-status banner. Accepted here — no real data, no users, URL
unpublished — and `/api/health` correctly reports `503` throughout it, proving
the route before setup is even finished.

> **Deviations.** C9 was already satisfied; the pre-flight's recorded state
> ("not authenticated") was stale. The first deploy was made from an uncommitted
> working tree — the commit recorded above captures that state after the fact
> rather than before it; every subsequent deployment goes through `deploy.yml`
> from a committed SHA.

> **First-deploy trap.** The first health probe against a brand-new
> `*.workers.dev` subdomain failed at the TLS handshake. That is certificate
> provisioning, not a broken deploy. Retry before debugging.

### D. CI/CD — auto-deploy-on-merge

**D12.** Create the GitHub repository, add the remote, push `main`.

> **Deviation.** A remote existed but pointed at a repository that did not, and
> was named `EstateManager` rather than `origin`. Removed and recreated via
> `gh repo create` — `gh` **is** installed, contrary to what both the plan and
> the pre-flight assumed. The repo is **public** by explicit choice; the tree
> was scanned for credentials before exposure (clean — only `<project-ref>`
> placeholders).

**D13.** Cloudflare API token (*Edit Cloudflare Workers* template) → GitHub
Secrets as `CLOUDFLARE_API_TOKEN`. Add `SUPABASE_URL` / `SUPABASE_KEY` as
repository secrets so `ci.yml`'s build step stops running with empty values.
See [the token gotcha](#gotcha-the-ci-token-is-account-owned) — it cost real
time.

**D14. Add `.github/workflows/deploy.yml`** — `on: push: branches: [main]`,
mirroring `ci.yml`'s setup (`actions/checkout@v4`, `actions/setup-node@v4`
node 22 + npm cache), then:

```
npm ci → npx astro sync → npm run lint → npm run build → cloudflare/wrangler-action@v3 (command: deploy)
```

- **Lint runs before deploy deliberately.** With D15 deferred, this in-job
  sequence *is* the gate: any failing step fails the job and `wrangler deploy`
  never executes. Unlike branch protection, it works on direct pushes to `main`.
- `npm ci` is also the G8 mitigation — the deployed artifact is the one CI
  validated, never a floated local `npm install`.
- Workers Secrets are **not** set by this workflow; they live in the platform,
  set once in C10.

> **Deviation.** The `SESSION` KV namespace had to be created — the plan never
> anticipated it. `@astrojs/cloudflare` enables Astro sessions by default and
> generates `dist/server/wrangler.json` containing
> `kv_namespaces: [{ binding: "SESSION" }]` with **no id**. Left alone this
> resolves through wrangler's interactive provisioning flow, which has no TTY
> inside GitHub Actions. Namespace `1a914a1c1f00405794482cea29c6bfd3` was
> created and pinned in `wrangler.jsonc` so both the manual and CI paths are
> deterministic.

**D15. Branch protection — deferred, not done.** GitHub required status checks
only apply to pull requests, so on a solo direct-push workflow they would gate
nothing while imposing a PR ritual. Revisit when a second person joins the repo,
or before the first real building is imported — whichever comes first. This
leaves the **G13 residual open**: recorded, not silently dropped.

### E. Record the outcome

**E16.** This document. One entry per deployment in
[Deployment log](#deployment-log) below, **append only** — never rewrite a past
entry to make it look correct in hindsight.

**E17. Run `/10x-lesson`** to append one entry to
`context/foundation/lessons.md`. Candidate rule — the human writes the final
wording, since the skill does not pre-fill: *deploy gating belongs inside the
workflow job, not in branch protection, while a repo is single-contributor.*
**← still outstanding.**

### Files touched

| File | Change |
|---|---|
| `package.json`, `package-lock.json`, `wrangler.jsonc`, `supabase/config.toml` | identity rename |
| `src/pages/api/health.ts` | **new** |
| `.github/workflows/deploy.yml` | **new** |
| `README.md`, `context/foundation/tech-stack.md` | doc corrections |
| `context/foundation/lessons.md` | execution record |

Nothing in `src/lib/`, `src/middleware.ts`, or `astro.config.mjs` changed. The
standing instruction from the Dissent — *keep Supabase access, mail sending and
file parsing behind thin modules with no workerd-specific imports* — is already
satisfied by `src/lib/supabase.ts`, and the health route respects it (plain
`fetch`, no Cloudflare-specific APIs).

---

## Verification procedure

Run these after any deploy, not just the first.

1. **Local.** `npx astro sync && npm run lint && npm run build` green.
   `npm run dev` — real workerd via `@cloudflare/vite-plugin`, *not*
   `wrangler pages dev`, which is legacy Pages and wrong for this repo.
   `curl localhost:4321/api/health` → `200 {"status":"ok"}` with `.dev.vars`
   present, `503 misconfigured` with it removed.
2. **Post-deploy.** `curl https://estate-manager.estate-manager.workers.dev/api/health`
   → `200`. A `503` means the secrets did not land — the exact failure G6
   describes, now visible instead of silent.
3. **Functional smoke.** Sign in with an account created in the Supabase
   dashboard (for the MVP, `test@test.com` / `Test123!`) → `/dashboard` renders
   authenticated against cloud Supabase, and survives a reload; sign out
   redirects to `/` and `/dashboard` bounces to `/auth/signin` again. There is
   no sign-up step: `F-01` deleted the registration path.
4. **Runtime.** `npx wrangler tail --format pretty` clean while exercising the
   above. Confirm no `nodejs_compat` stub errors — the divergence class the
   pre-mortem warns `astro dev` cannot reproduce.
5. **CI/CD loop.** Push a trivial commit to `main`; confirm `deploy.yml` runs
   green and `npx wrangler deployments list` shows the CI-authored deployment as
   current. The negative case — a deliberate lint error failing the job
   **without** deploying — was proven on 2026-08-01 and does not need re-running
   after every deploy; re-run it if the workflow's step ordering ever changes.
6. **Rollback available.** `npx wrangler versions list` returns the prior
   version ID; `npx wrangler rollback <version-id>` reverts **code only**.

### Two false alarms worth knowing

- **`403` from a `POST` to an auth endpoint without an `Origin` header** is
  Astro's `security.checkOrigin` behaving correctly, not a broken endpoint.
  Browsers always send `Origin`. Pass `-H "Origin: <base>"` from `curl`.
- **An empty `wrangler tail` is "no output", not "no errors".** Use
  `--format pretty` and confirm the `Connected to estate-manager` line before
  concluding anything from silence.

### Gotcha: the CI token is account-owned

`CLOUDFLARE_API_TOKEN` is an **account-owned** token (prefix `cfat_`), not a
user-owned one. This matters when debugging it, because the usual validity check
lies:

```
GET /client/v4/user/tokens/verify                  -> 1000 "Invalid API Token"   (WRONG)
GET /client/v4/accounts/{account_id}/tokens/verify -> success, status: active    (right)
```

An account-owned token reports as invalid against the `/user/` endpoint even
when it is perfectly good. Verify against the account endpoint instead. This one
does have permission to enumerate `/accounts`, which is the first call
`wrangler deploy` makes — a token that cannot will fail there regardless of its
Workers permissions.

Related: when storing it, pipe the value into `gh secret set` on **stdin**. A
value passed as an argument risks landing as the secret *name*, and secret names
are not secret — they are shown in the Actions UI and in `gh secret list`.

---

## Deliberately out of scope

- **Workers Paid ($5/mo)** — the register's top mitigation, but its stated
  trigger is "before the first real building is imported", and there is no
  registry-import feature yet.
- **Branch protection / required checks (D15)** — deferred per above; the G13
  residual stays open.
- **Staging environment (G15)** and **migration history (G14)** — both remain
  live register rows. G14 matters the moment a real schema appears, because
  `wrangler rollback` reverts code only.
- **Preview URLs stay public by default** — harmless while no real owner data
  exists; needs Cloudflare Access before any preview points at a real registry.
- Transactional-mail vendor (HTTP API only — SMTP is structurally impossible on
  workerd), Cron Triggers for FR-010, and any domain feature work.

---

## Deployment log

Newest last. **Append only.**

| Date | Commit | Version ID | By | Notes |
|---|---|---|---|---|
| 2026-08-01 | `f8d35e1` | `b86cd1b3-830e-459f-bc80-a2137a492c7c` | manual (`wrangler deploy`) | First production deployment. Sections A–D of the runbook. Preceded by `d411e297` (no secrets) and two implicit secret-change versions. |
| 2026-08-01 | `fe6b839` | — | CI (`deploy.yml`) | **Failed, no deploy.** `CLOUDFLARE_API_TOKEN` was missing. Lint and build passed; only the wrangler step failed. |
| 2026-08-01 | `a699ab2` | `c7d7e037-aad5-4909-848a-b388c70b95dc` | CI (`deploy.yml`) | Re-run after the token was fixed. First CI-authored deploy. |
| 2026-08-01 | `d2d830d` | `a09eff2f-9068-4c1f-8a9c-0fd1136262ab` | CI (`deploy.yml`) | Full push-to-`main` → auto-deploy cycle on a real commit. `CI` and `Deploy` both green; health `200` after. |
| 2026-08-01 | `2287893` | — | CI (`deploy.yml`) | `F-01` Phase 1. Registration path deleted: `/auth/signup`, `/auth/confirm-email` and `POST /api/auth/signup` gone; sign-in now lands on `/dashboard`. |
| 2026-08-01 | `1d099cc` | — | CI (`deploy.yml`) | `F-01` Phase 2. `deploy.yml` gains a final step that curls `/api/health` and fails the job on anything but `200`. First deploy to assert its own health. |
| 2026-08-01 | `08b3f2c` | — | CI (`deploy.yml`) | `F-01` Phase 3. Docs-only; recorded because it is the deploy the production smoke test was run against. First successful production login. |
| 2026-08-01 | `11968c0` | — | CI (`deploy.yml`) | **Failed by design, no deploy.** `F-01` Phase 4's deliberate lint error. Run `30713400532` stopped at `npm run lint`; build, `wrangler deploy` and the health assertion all skipped. Live version unchanged, health `200` throughout. |
| 2026-08-01 | `ffeac9f` | `4fbe8892-6de0-4646-94d0-1da58a391e4b` | CI (`deploy.yml`) | Revert of the deliberate error. Run `30713455557` green through all nine steps including the health assertion. |
