---
project: estate-manager
created_at: 2026-08-01
doc_type: execution-plan
status: approved-not-executed
platform: Cloudflare Workers
companion: context/foundation/deployment-preflight.md
sources:
  - context/foundation/infrastructure.md
  - context/foundation/tech-stack.md
placement_note: >
  foundation/README.md names change-scoped docs an anti-pattern for this
  directory. Placed here deliberately: this runbook is re-read on every deploy,
  so it outlives the one change that created it.
---

# Deployment — EstateManager on Cloudflare Workers

**Status: approved, not executed.** Reviewed section by section on 2026-08-01. Sections A–C agreed as written; D and E revised (see D15 and E16). Execution waits until [`deployment-preflight.md`](./deployment-preflight.md) is fully green.

## Context

[`infrastructure.md`](./infrastructure.md) selects **Cloudflare Workers** as the MVP platform (with recorded dissent), and [`tech-stack.md`](./tech-stack.md) records `ci_default_flow: auto-deploy-on-merge`. Neither has been executed: the repo has never been deployed, `wrangler` is not authenticated, there is **no git remote**, no hosted Supabase project, and every identity string still reads `10x-astro-starter`.

This plan takes the repo from "scaffolded, verified locally" to "running in production on Cloudflare Workers, redeployed automatically on merge to `main`". It also lands the highest-severity item from the degradation analysis — **G6**, where a missing or rotated Supabase credential produces a *green deploy of a non-functional app*, because both env vars are declared `optional: true`.

Scope: first production deploy **plus** CI/CD; Supabase cloud project created as part of the work. Of the available mitigations only the `/health` route is in scope — staging environment (G15) and migration history (G14) stay open in the register.

## Current state vs. the contract documents

| Item | Documents say | Repo actually has |
|---|---|---|
| Worker / package name | `estate-manager` (`tech-stack.md`) | `10x-astro-starter` in `package.json`, `wrangler.jsonc`, `supabase/config.toml` |
| Cloudflare auth | `wrangler deploy` in Getting Started | `wrangler whoami` → not authenticated |
| Git remote | `auto-deploy-on-merge`, `CLOUDFLARE_API_TOKEN` in GitHub Secrets | no remote; `gh` CLI not installed |
| Supabase | production URL/key as Workers Secrets | only local `supabase/config.toml`; README documents the Docker stack only |
| `deployment_target` | Register says update the stale hint | `tech-stack.md` still says `cloudflare-pages` |
| CI branch | corrected to `main` in `ci.yml` (2026-08-01) | correct — but `README.md:171` still says `master` |
| Secret absence | G6: must fail loudly in production | `astro.config.mjs` `optional: true`; `src/lib/supabase.ts:6` returns `null`, app silently serves the config-status banner |

## Two conflicts, resolved

1. **`auto-deploy-on-merge` vs. "`wrangler deploy` to production requires a human."** `infrastructure.md`'s approval matrix puts production deploys on the human-required list, while `tech-stack.md` asks for auto-deploy. Resolution: **a merge to `main` is that human act.** No agent-initiated production deploys either way.
2. **`tech-stack.md` records `cloudflare-pages`; Pages is in maintenance mode** and adapter v14 dropped support outright. The register already prescribes the fix — update the hint to `cloudflare-workers`. The code (`wrangler.jsonc` Static Assets path) is already correct; only the contract document is stale.

## Steps

### 0. Pre-flight check — first action of the session

Open [`deployment-preflight.md`](./deployment-preflight.md) and walk its five rows, confirming each with the stated command rather than by recollection — `wrangler whoami` and `git remote -v` are cheap, and both were failing when this plan was written. **Do not begin Section A until every row is green.** Ask about anything missing or divergent instead of working around it.

### A. Repo prep — agent, no external accounts needed

**A1. Rename off the starter identity.** Must precede the first deploy: `wrangler.jsonc` `name` becomes the Worker name *and* the `*.workers.dev` hostname, so renaming later creates a new Worker rather than moving the existing one.

- `package.json:2` → `"name": "estate-manager"`
- `wrangler.jsonc:3` → `"name": "estate-manager"`
- `supabase/config.toml:5` → `project_id = "estate-manager"`

**A2. Add `src/pages/api/health.ts`** — the G6 mitigation. A presence check alone does not catch a *rotated* key, which is G6's actual scenario, so the route does both:

- reuse the env import style of `src/lib/config-status.ts` (`import { SUPABASE_URL, SUPABASE_KEY } from "astro:env/server"`);
- if either is absent → `503` with `{ status: "misconfigured", supabase: "missing-credentials" }`;
- otherwise probe `GET ${SUPABASE_URL}/auth/v1/health` with the `apikey` header and a short `AbortSignal.timeout`; non-OK or throw → `503 { supabase: "unreachable" }`; OK → `200 { status: "ok" }`;
- never echo the URL or key in the body; follow the `APIRoute` shape used by `src/pages/api/auth/signout.ts`;
- leave it out of `PROTECTED_ROUTES` in `src/middleware.ts` — it must answer before auth works.

`optional: true` in `astro.config.mjs` deliberately **stays**: local dev and preview builds depend on the degrade-to-banner behaviour. The health route is what makes the same condition loud in production.

**A3. Fix the stale docs.**

- `README.md` — retitle to EstateManager, correct `## CI` (`master` → `main`, line 171), point `## Deployment` at the real flow, document `/api/health`, add the cloud-Supabase-in-EU note.
- `tech-stack.md:8` — `deployment_target: cloudflare-workers`.

**A4. Verify the build locally.** `npx astro sync && npm run lint && npm run build`; confirm `dist/` contains a Workers bundle consumable by `wrangler.jsonc`'s `main: "@astrojs/cloudflare/entrypoints/server"` + `assets.directory: "./dist"`. Adapter 13.5.0 exports that entrypoint — verified against `node_modules`.

### B. Supabase production project — user performs, agent supplies exact values

**B5.** Create the hosted project, **region EU (Frankfurt / `eu-central-1`)** — the D4 / T1 mitigation, and immutable after creation.
**B6.** Copy the Project URL and the **`anon`** key (Settings → API). Not the service-role key.
**B7.** Auth → URL Configuration: set Site URL to the Worker hostname, once step C11 produces it.
**B8.** Write both values into a local `.dev.vars` (gitignored — confirmed) so `npm run dev` runs against real workerd *and* real Supabase.

Email confirmation stays **on** (the production default); the smoke test in verification uses a real inbox.

### C. First production deploy — user runs the gated commands

**C9.** `npx wrangler login` — interactive, cannot be delegated. Run as `! npx wrangler login` so the output lands in the session.
**C10.** `npx wrangler secret put SUPABASE_URL`, then `SUPABASE_KEY`. Write-only; there is no read-back, ever.
**C11.** `npm run build && npx wrangler deploy` → note the `estate-manager.<subdomain>.workers.dev` hostname and feed it back into B7.

**Ordering wrinkle:** `wrangler secret put` requires the Worker to exist, which on a first-ever deploy it does not. The real sequence is **C11 → C10 → redeploy**. That leaves a window where the Worker is live with no credentials, serving the config-status banner. Accepted here — no real data, no users, URL unpublished — and `/api/health` correctly reports `503` throughout it, proving the route before setup is even finished.

All three commands are human-gated per `infrastructure.md`'s approval matrix. The agent does not run them.

### D. CI/CD — auto-deploy-on-merge

**D12.** Create the GitHub repository and add the remote (user; `gh` is not installed, so via github.com + `git remote add origin …`). Push `main`.

**D13.** Cloudflare API token (*Edit Cloudflare Workers* template) → GitHub Secrets as `CLOUDFLARE_API_TOKEN`. Add `SUPABASE_URL` / `SUPABASE_KEY` as repository secrets so the existing `ci.yml` build step stops running with empty values.

**D14. Add `.github/workflows/deploy.yml`** — `on: push: branches: [main]`, mirroring `ci.yml`'s setup (`actions/checkout@v4`, `actions/setup-node@v4` node 22 + npm cache), then:

```
npm ci → npx astro sync → npm run lint → npm run build → cloudflare/wrangler-action@v3 (command: deploy)
```

- **Lint runs before deploy deliberately.** With D15 deferred, this in-job sequence *is* the gate: any failing step fails the job and `wrangler deploy` never executes. Unlike branch protection, it works on direct pushes to `main`.
- `npm ci` is also the G8 mitigation — the deployed artifact is the one CI validated, never a floated local `npm install`.
- Workers Secrets are **not** set by this workflow; they live in the platform, set once in C10.

**D15. Branch protection — deferred, not done.** GitHub required status checks only apply to pull requests, so on a solo direct-push workflow they would gate nothing while imposing a PR ritual. Revisit when a second person joins the repo, or before the first real building is imported — whichever comes first. This leaves the **G13 residual open**: recorded, not silently dropped.

### E. Record the outcome

**E16. Create `context/foundation/deployment-history.md`** — a new append-only doc, one entry per deployment (date, commit SHA, version ID from `wrangler versions list`, what changed, verification result). First entry covers this deployment: G6 mitigated via `/api/health`; G13 residual **open** (D15 deferred); G14 (migration history) and G15 (staging env) **open**.

`infrastructure.md` is **not** touched. It stays the research-and-decision artifact, and its value depends on not being retrofitted to look correct after the fact. Execution records live separately.

**E17. Run `/10x-lesson`** to append one entry to `context/foundation/lessons.md`. Candidate rule — the user writes the final wording, since the skill does not pre-fill: *deploy gating belongs inside the workflow job, not in branch protection, while a repo is single-contributor.*

## Files touched at execution time

| File | Change |
|---|---|
| `package.json`, `wrangler.jsonc`, `supabase/config.toml` | identity rename |
| `src/pages/api/health.ts` | **new** |
| `.github/workflows/deploy.yml` | **new** |
| `README.md`, `context/foundation/tech-stack.md` | doc corrections |
| `context/foundation/deployment-history.md`, `context/foundation/lessons.md` | **new**, execution record |

Nothing in `src/lib/`, `src/middleware.ts`, or `astro.config.mjs` changes. The standing instruction from the Dissent — *keep Supabase access, mail sending and file parsing behind thin modules with no workerd-specific imports* — is already satisfied by `src/lib/supabase.ts`, and the health route respects it (plain `fetch`, no Cloudflare-specific APIs).

## Verification

1. **Local.** `npx astro sync && npm run lint && npm run build` green. `npm run dev` — real workerd via `@cloudflare/vite-plugin`, *not* `wrangler pages dev`, which is legacy Pages and wrong for this repo. `curl localhost:4321/api/health` → `200 {"status":"ok"}` with `.dev.vars` present, `503 misconfigured` with it removed.
2. **Post-deploy.** `curl https://estate-manager.<subdomain>.workers.dev/api/health` → `200`. A `503` here means the secrets did not land — the exact failure G6 describes, now visible instead of silent.
3. **Functional smoke.** Sign up (real inbox) → confirm → sign in → `/dashboard` renders authenticated against cloud Supabase; sign out redirects to `/`.
4. **Runtime.** `npx wrangler tail --status error` clean while exercising the above. Confirm no `nodejs_compat` stub errors — the divergence class the pre-mortem warns `astro dev` cannot reproduce.
5. **CI/CD loop.** Push a trivial commit to `main`; confirm `deploy.yml` runs green and `npx wrangler deployments list` shows the CI-authored deployment as current. Then push a commit with a deliberate lint error and confirm the job fails **without** deploying — this is the D15 substitute and must be proven, not assumed.
6. **Rollback available.** `npx wrangler versions list` returns the prior version ID.

## Deliberately not in this change

- **Workers Paid ($5/mo)** — the register's top mitigation, but its stated trigger is "before the first real building is imported", and there is no registry-import feature yet.
- **Branch protection / required checks (D15)** — deferred per above; the G13 residual stays open.
- **Staging environment (G15)** and **migration history (G14)** — both remain live register rows. G14 matters the moment a real schema appears, because `wrangler rollback` reverts code only.
- **Preview URLs stay public by default** — harmless while no real owner data exists; needs Cloudflare Access before any preview points at a real registry.
- Transactional-mail vendor (HTTP API only — SMTP is structurally impossible on workerd), Cron Triggers for FR-010, and any domain feature work.
