---
project: estate-manager
researched_at: 2026-08-01
recommended_platform: Cloudflare Workers
runner_up: Render
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Astro 6.3.1 (React 19 islands, output "server")
  runtime: Cloudflare Workers (workerd) via @astrojs/cloudflare 13.5.0
  database: Supabase Postgres (external)
---

## Recommendation

**Deploy on Cloudflare Workers.**

It is the only candidate that scores Pass on all five agent-friendly criteria *and* lands inside a $0–5/month envelope, which matters because cost minimisation was named the top constraint. The repo is already wired for it — `@astrojs/cloudflare` 13.5.0, `wrangler` 4.90.0, and a `wrangler.jsonc` using the current Workers Static Assets path — so choosing anything else means swapping the adapter and re-learning a deployment story for no product gain. The two answers that would normally pull toward a container PaaS do not apply: no persistent connections are needed, and the database is external, so co-located Postgres is worth nothing here.

One caveat is binding rather than advisory: **budget the $5/month Workers Paid plan from day one.** The free plan's 10 ms CPU-per-invocation ceiling is the single most likely production failure for this app, and it does not reproduce locally.

## Platform Comparison

| Platform | CLI-first | Managed/Serverless | Agent-readable docs | Stable deploy API | MCP / Integration | Cost @ MVP |
|---|---|---|---|---|---|---|
| **Cloudflare Workers** | Pass | Pass | Pass | Pass | Pass | **$0–5/mo** |
| **Render** | Partial | Pass | Pass | Pass | Pass | ~$8/mo |
| **Railway** | Partial | Pass | Pass | Pass | Partial | ~$6–8/mo |
| Vercel | Pass | Pass | Pass | Pass | Pass | $20/mo floor |
| Netlify | Partial | Pass | Pass | Pass | Pass | $0 → $20 (EU paywalled) |
| Fly.io | Pass | Partial | Pass | Partial | Partial | ~$3–7/mo |

**Cloudflare Workers.** Full operational loop from the terminal: `wrangler deploy`, `wrangler rollback [VERSION_ID]`, `wrangler versions list|upload|deploy --percentage`, `wrangler tail`, `wrangler secret put`. Fully managed — no OS, no container, no Dockerfile. Docs published as `llms.txt`, `llms-full.txt`, per-product `/workers/llms-full.txt`, `.md` on any page, plus `Accept: text/markdown`. Four GA MCP servers (docs, bindings, observability, Code Mode) with OAuth. Cron Triggers are GA *and available on the free plan*, which no other candidate offers.

**Render.** Native Node runtime with an explicitly documented Astro path (`@astrojs/node`, `node dist/server/entry.mjs`), Frankfurt region, GA MCP server at `api.render.com/mcp` with Claude Code OAuth, `render.yaml` Blueprints for IaC. Marked Partial on CLI-first because there is no `render rollback` command and no dedicated env-var command — rollback goes through the dashboard or REST API. Free web tier is disqualified for this product: services spin down after 15 minutes idle and take ~60 s to wake, and the very first thing an owner does is click an e-mailed link.

**Railway.** Railpack builds, EU West (Amsterdam, ~20–30 ms from Poland, no surcharge), real cron on a 5-field UTC crontab, `llms.txt` + `llms-full.txt`, GA GraphQL API. Partial on CLI-first: no `railway rollback` — you `redeploy` a prior deployment. Partial on MCP: the docs themselves say "The Railway MCP Server is a work in progress." Astro SSR needs manual configuration (`server: { host: '0.0.0.0' }`, explicit start command) or you get 502s. Its "Serverless" scale-to-zero mode explicitly warns the first request "may return a 502 Bad Gateway."

**Vercel.** Technically excellent and 5/5 on the criteria — Fluid compute, `vercel rollback`/`promote`, `llms.txt`, GA MCP at `mcp.vercel.com`. Dropped on cost: the Fair Use guidelines restrict Hobby to "non-commercial personal use only," so a revenue-bearing product requires Pro at $20/month, and Hobby cron is capped at once per day with ±59 min drift — unusable for FR-010. Also note functions default to `iad1`; `regions: ["fra1"]` must be set explicitly.

**Netlify.** Good agent tooling (official MCP server, `llms.txt`, `.md` on any doc page) and Scheduled Functions on all plans. Dropped for two reasons: function region selection is Pro/Enterprise-only, so a free deploy pins compute to `cmh` (US-East Ohio) and puts an Atlantic crossing in front of an EU Supabase on every vote; and the credit-based free tier is a **hard stop** — at exhaustion projects are paused and visitors see "Site not available," with no overage purchase. For a vote with no end date, that is an availability risk, not a billing one.

**Fly.io.** Cheapest raw compute (~$3–7/mo) and genuinely strong at persistent processes — a strength this app does not use. Partial on Managed: you own the Dockerfile (a Jan 2026 community report of `fly launch` failing to detect modern Astro went unanswered by staff), and Fly Postgres is explicitly unmanaged. Partial on deploy API: no rollback command; you re-deploy a prior image via `fly releases --image` + `fly deploy -i <sha>`, and config/secrets are not reverted. Partial on MCP: `fly mcp server` is experimental with partial command coverage. Decisive detail for this project: **the Warsaw region `waw` is deprecated** under the Region Consolidation Project and no longer appears in the regions reference.

### Shortlisted Platforms

#### 1. Cloudflare Workers (Recommended)

Wins on every axis that the interview weighted. Cost: free tier covers 100k requests/**day** against a PRD whose profile is `users: large, qps: low` — the $5 plan is bought for CPU headroom, not for traffic. Agent-operability: the only candidate with a first-class `rollback` command *and* GA MCP servers *and* the richest agent-doc surface. Zero migration cost: `astro.config.mjs`, `wrangler.jsonc`, and the installed adapter already target it. Cron Triggers on the free plan cover FR-010 without a second billable service — Render charges ~$1/mo minimum per cron service, and Railway requires cron to be a *separate* service from the web service because the process must exit.

#### 2. Render

The runner-up is deliberately chosen as an **escape hatch from Cloudflare's specific failure mode**, not as a near-miss on the same axis. Every Cloudflare risk below traces to workerd: the 10 ms CPU ceiling, stubbed `net`/`tls` killing SMTP, stream-based parsers failing on registry import. Render runs plain Node via `@astrojs/node` 10.1.4 (peers `astro ^6.3.0`, so no framework upgrade required), in Frankfurt, with none of those constraints. The gap: ~$8/mo versus $0–5, rollback is not a CLI command, cron is UTC-only and paid, and the region is immutable after service creation — pick Frankfurt at creation or rebuild.

#### 3. Railway

Third on merit rather than as filler: real container, real cron, EU Amsterdam at no surcharge, and the best natural-language agent tooling of the container tier (`railway agent`, `railway skills install` for Claude Code). It loses to Render on two concrete points — the MCP server is self-described as a work in progress, and enabling scale-to-zero to control cost buys a documented 502 on the first request after sleep, which for a tokenized voting link is a product defect. Astro SSR also needs hand-configuration that Render documents out of the box.

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. **The 10 ms free-tier CPU ceiling meets the live tally page.** CPU time excludes I/O wait, so Supabase round-trips cost nothing — but server-rendering the share-tally across every lokal in a building is pure compute. Exceeding it returns error 1102 in production only, on the heaviest page only, while `astro dev` stays green.
2. **SMTP is structurally impossible, and FR-002/FR-004 are e-mail requirements.** `nodejs_compat` ships `net` and `tls` as non-functional stubs whose methods throw. Nodemailer and every SMTP client are ruled out. The mailer must be an HTTP-API provider — a platform-constrained vendor decision, not a free one.
3. **Registry import (FR-001) hits the same wall from a different direction.** XLSX/CSV libraries that use `fs`, Node streams, or `worker_threads` fail on workerd, and the import runs inside a request bound by the same CPU limit. A 200-unit building parsed in a single invocation is precisely the shape that trips it.
4. **Escaping the platform later is a coupled two-package major bump.** `@astrojs/cloudflare` 13.5.0 peers `astro ^6.3.0`; adapter 14.x requires `astro ^7.0.0`. There is no incremental path, and adapter majors have broken configuration before — v13 removed `platformProxy` as a user option, v14 dropped Pages support entirely.
5. **Cron Triggers are stateless, UTC-only, and drift up to 15 minutes.** FR-010's "limited series of reminders in decreasing frequency" needs per-owner state; a Cron Trigger gives you a tick and nothing else. Every scheduling decision must be re-derived from Postgres on each fire, and "09:00 Warsaw" requires hand-rolled CET/CEST handling.

### Pre-Mortem — How This Could Fail

The team shipped on the free plan because the traffic math said 100k requests/day was untouchable — and it was, but request count was never the binding limit. The first real building had 180 lokale; the admin's live-tally page rendered every one of them server-side and crossed 10 ms of CPU. Production returned 1102 on the one screen the buyer opens daily, while local dev stayed green. Meanwhile the registry importer, written against a stream-based XLSX parser, worked in `astro dev` under Vite's Node shim and threw on workerd. The mailer had been chosen before the platform: an SMTP provider, rewritten twice. Reminders fired at 07:00 instead of 09:00 after the March DST shift because Cron Triggers are UTC and nobody encoded the offset; owners complained about 5am e-mails. When the team tried to escape to a Node host, they discovered the adapter swap also required jumping Astro 6→7, so the migration became a framework upgrade during a live vote. Six months in, the $5/month they had avoided had cost three weekends.

### Unknown Unknowns

- **`tech-stack.md` records `deployment_target: cloudflare-pages`, and that target is effectively gone.** Cloudflare has stated all investment goes to Workers, Pages is in maintenance mode, and adapter v14 removed Pages support outright. The repo's `wrangler.jsonc` already uses the correct Workers Static Assets path (`assets.binding: "ASSETS"`) — the contract document is stale, the code is not. Treat "Cloudflare Workers", not "Pages", as the recorded target.
- **Essentially every `wrangler pages dev` tutorial is wrong for this repo.** In adapter v13, `astro dev` and `astro preview` run real `workerd` through `@cloudflare/vite-plugin`, and `platformProxy` is no longer a user-facing option. Local dev already has runtime fidelity; the legacy two-command flow is obsolete, and following a blog post that uses it wastes an evening.
- **`wrangler tail` is live-only, and historical retention is short.** Workers Logs is already enabled in `wrangler.jsonc` (`observability.enabled: true`), but retention is **3 days on Free and 7 days on Paid**. A vote disputed two weeks after the fact has no platform log trail — the audit story must live in Postgres, which the PRD's guardrail ("każdy głos jest policzalny i ma ustalony ślad") already implies but does not force.
- **Preview URLs are public by default.** `wrangler versions upload` mints `<version-prefix>-<worker-name>.<subdomain>.workers.dev`, and Cloudflare's docs state plainly that "all preview URLs are available publicly." Against the guardrail *"dane właścicieli nie wychodzą poza budynek"*, a preview pointing at real registry data is a personal-data exposure unless Cloudflare Access is placed in front of it.
- **Secrets are write-only.** `wrangler secret put` offers no read-back — you can list names, never values. Losing the Supabase key locally means rotating it, not recovering it.
- **Workers KV backs Astro sessions with ~60 s eventual consistency.** Adapter v13 auto-provisions KV for sessions (`sessionKVBindingName`). An admin login whose session is read from a different colo can observe a stale value; do not build auth-critical read-after-write logic on the session store.

## Operational Story

- **Preview deploys**: `npx wrangler versions upload` uploads a version without routing production traffic and returns a versioned preview URL `<version-prefix>-estate-manager.<subdomain>.workers.dev` (aliases via `--preview-alias`, requires wrangler ≥ 4.21.0; versioned URLs require ≥ 3.74.0 and versions uploaded after 2024-09-25). Preview URLs are enabled by default whenever `workers_dev` is enabled, toggled via `preview_urls` in `wrangler.jsonc`. **They are public** — put Cloudflare Access in front before any preview points at a real registry. In GitHub Actions, fork PRs cannot read repository secrets, so fork previews will not build against Supabase.
- **Secrets**: production values live in Workers Secrets, set with `npx wrangler secret put SUPABASE_URL` / `SUPABASE_KEY` (also `secret list`, `secret delete`, `secret bulk`). Write-only — never readable after being set. The CI deploy token lives in GitHub Secrets as `CLOUDFLARE_API_TOKEN`. Local development reads `.dev.vars`, which must stay gitignored. Rotation = rotate in Supabase, `wrangler secret put` the new value, redeploy. Both variables are declared `optional` in `astro.config.mjs` `env.schema`, so a missing secret degrades to the config-status banner rather than a boot failure.
- **Rollback**: `npx wrangler rollback [VERSION_ID]` (find the ID with `npx wrangler versions list`); takes seconds and is a routing change, not a rebuild. Gradual rollout available via `npx wrangler versions deploy --percentage`. **Caveat: this reverts code only.** Supabase migrations do not roll back with it, so any deploy containing a destructive migration is not recoverable by `wrangler rollback` alone — pair destructive migrations with a manual reversal script before shipping them.
- **Approval**: an agent may run unattended — `wrangler versions upload` (preview), `wrangler tail`, `wrangler versions list`, `wrangler deployments list`, and any `astro build` / `npm run lint`. Requires a human: `wrangler deploy` to production, `wrangler rollback`, `wrangler secret put|delete`, applying any Supabase migration that drops or alters a column, and enabling the Workers Paid plan. Rationale: production traffic for this app carries owners' personal and property data, and votes are final and non-reversible by design (FR-005).
- **Logs**: `npx wrangler tail` streams live, with `--status error` and `--search <term>` filters — read-only and safe for an agent. Historical logs go through Workers Logs (already enabled via `observability.enabled: true`), queried in the dashboard under Workers & Pages → Observability, retained 3 days on Free / 7 days on Paid. The observability MCP server at `https://observability.mcp.cloudflare.com/mcp` exposes the same data as structured tools over OAuth.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Free-plan 10 ms CPU ceiling kills the live tally page in production only (error 1102) | Devil's advocate / Pre-mortem | H | H | Enable Workers Paid ($5/mo) before the first real building is loaded; move the tally to a single aggregate SQL query rather than per-lokal rendering; load-test with a 200-unit fixture |
| SMTP mailer chosen before the platform; `net`/`tls` are throwing stubs on workerd | Devil's advocate | M | H | Commit to an HTTP-API mail provider (Resend / Postmark / SES API) as an explicit FR-002/FR-004 implementation decision *before* writing the send path |
| Registry import (FR-001) uses an `fs`/stream-based XLSX parser and fails only on deploy | Devil's advocate / Pre-mortem | M | M | Choose a pure-in-memory parser operating on `ArrayBuffer`; verify against `astro build` + a preview URL, never against `astro dev` alone; cap accepted file size |
| Cron Triggers are UTC-only with up to 15 min propagation delay → reminders fire an hour off after DST | Devil's advocate / Pre-mortem | H | L | Store the intended local send window and compute the Europe/Warsaw offset in code; treat the trigger as "at least once per window", not "at 09:00" |
| FR-010 reminder state has nowhere to live — Cron Triggers are stateless | Devil's advocate | M | M | Model reminder count and last-sent timestamp per owner in Postgres; each tick queries "who is due" rather than relying on scheduler state |
| Migrating off Cloudflare later forces a coupled Astro 6→7 + adapter 13→14 major bump | Devil's advocate / Pre-mortem | L | H | Keep Supabase access and mail-sending behind thin modules with no workerd-specific imports; treat Render + `@astrojs/node` 10.1.4 (peers `astro ^6.3.0`) as the documented escape hatch requiring no framework upgrade |
| Public preview URLs expose real owner data (metraż, udziały, contact details) | Unknown unknowns | M | H | Enable Cloudflare Access on preview URLs before pointing any preview at production-shaped data; otherwise seed previews from synthetic registries only |
| 3-day (Free) / 7-day (Paid) log retention leaves a disputed vote with no platform trail | Unknown unknowns | M | M | Persist the audit trail in Postgres as a first-class table, not as log output — required anyway by the PRD guardrail on reconstructable results |
| Workers KV session store is ~60 s eventually consistent | Unknown unknowns | L | M | Do not gate authorisation on immediate read-after-write of session data; re-resolve the user from Supabase in `src/middleware.ts`, as the current code already does |
| `wrangler rollback` reverts code but not Supabase migrations | Research finding | M | H | Never combine a destructive migration with a feature deploy; write a reversal script alongside any `drop`/`alter` migration before it ships |
| `tech-stack.md` records the stale `cloudflare-pages` target; Pages is in maintenance mode | Unknown unknowns | H | L | Update the hint to `cloudflare-workers`; the repo's `wrangler.jsonc` is already on the correct Workers Static Assets path |
| Local dev diverges from production if the legacy `wrangler pages dev` flow is copied from tutorials | Unknown unknowns | M | M | Use `npm run dev` (`astro dev`) only — adapter v13 runs real `workerd` via `@cloudflare/vite-plugin`; do not add `platformProxy`, it is no longer a user option |

## Getting Started

Commands validated against the versions actually installed in this repo — `astro` 6.3.1, `@astrojs/cloudflare` 13.5.0, `wrangler` 4.90.0 — not against general platform docs.

1. **Rename the project off the starter identity.** `package.json` `name` and `wrangler.jsonc` `name` both still read `10x-astro-starter`; `tech-stack.md` specifies `estate-manager`. The `wrangler.jsonc` name becomes the Worker name and therefore the `*.workers.dev` hostname, so fix it before the first deploy — renaming later creates a new Worker rather than moving the existing one.

2. **Authenticate and confirm the toolchain.** `npx wrangler login`, then `npx astro sync` (required after a fresh clone or dependency change — it generates `.astro/types.d.ts`, without which `npm run lint` fails), then `npm run build` to confirm the adapter emits a Workers bundle.

3. **Develop locally with `npm run dev` — and nothing else.** Adapter v13 runs real `workerd` through `@cloudflare/vite-plugin`, so `astro dev` already has Workers-runtime fidelity. **Do not run `wrangler pages dev`** (legacy Pages-only) and **do not add `platformProxy`** to `astro.config.mjs` — it was removed as a user option in v13. Put local secrets in `.dev.vars`, not `.env`, and keep it gitignored.

4. **Set production secrets, then deploy.** `npx wrangler secret put SUPABASE_URL`, `npx wrangler secret put SUPABASE_KEY`, then `npx wrangler deploy`. Verify with `npx wrangler tail --status error` while exercising the app. Preview a change without touching production traffic using `npx wrangler versions upload`.

5. **Enable the Workers Paid plan ($5/mo) before the first real building is imported.** This is the mitigation for the highest-likelihood, highest-impact risk in the register: the free plan's 10 ms CPU-per-invocation limit, which fails in production only and cannot be reproduced by `astro dev`.

6. **Do not upgrade `@astrojs/cloudflare` to 14.x.** It peers `astro ^7.0.0`; this repo is on Astro 6.3.1. The adapter and framework must move together as a deliberate, separately-scheduled upgrade — not as a routine dependency bump.

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup (the GitHub Actions workflow implementing `auto-deploy-on-merge` from `tech-stack.md`)
- Production-scale architecture (multi-region, HA, DR)
- Transactional e-mail vendor selection — constrained by this decision (HTTP API only, no SMTP) but chosen during implementation
