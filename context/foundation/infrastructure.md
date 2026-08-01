---
project: estate-manager
researched_at: 2026-08-01
revised_at: 2026-08-01
decision_status: recommended-with-recorded-dissent
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

It is the only candidate that scores Pass on all five agent-friendly criteria *and* lands inside a $0–5/month envelope, which matters because cost minimisation was named the top constraint. The repo is already wired for it — `@astrojs/cloudflare` 13.5.0, `wrangler` 4.90.0, and a `wrangler.jsonc` using the current Workers Static Assets path. The database is external, so co-located Postgres is worth nothing here.

One caveat is binding rather than advisory: **budget the $5/month Workers Paid plan from day one.** The free plan's 10 ms CPU-per-invocation ceiling is the single most likely production failure for this app, and it does not reproduce locally.

> **This decision is contested.** It survives on a cost advantage of roughly $5/month over a plain-Node host, and that margin is thin enough that several ordinary developments would overturn it. Read [Dissent — The Case Against Cloudflare Workers](#dissent--the-case-against-cloudflare-workers) before writing platform-shaped code, and check [Reconsider Triggers](#reconsider-triggers) whenever scope changes. Two arguments used to justify this recommendation have since been marked as weak (D8, D3) and should not be re-cited.

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

Wins on every axis that the interview weighted. Cost: free tier covers 100k requests/**day** against a PRD whose profile is `users: large, qps: low` — the $5 plan is bought for CPU headroom, not for traffic. Agent-operability: the only candidate with a first-class `rollback` command *and* GA MCP servers *and* the richest agent-doc surface. Cron Triggers on the free plan cover FR-010 without a second billable service — Render charges ~$1/mo minimum per cron service, and Railway requires cron to be a *separate* service from the web service because the process must exit.

~~Zero migration cost: `astro.config.mjs`, `wrangler.jsonc`, and the installed adapter already target it.~~ **Retracted — see D8.** Swapping to `@astrojs/node` is roughly fifteen minutes of work, so "already wired" is not a real argument and must not be re-cited as one.

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

## Dissent — The Case Against Cloudflare Workers

Recorded 2026-08-01, after the decision. The anti-bias cross-check above stress-tested the *implementation* of the choice; this section attacks the *choice itself*. It is kept in the contract deliberately: if this deployment goes wrong, these are the reasons it will have gone wrong, and two of them (D3, D8) are errors in the reasoning that produced the recommendation.

Ordered by severity for this project.

- **D1 — The entire cost advantage is ~$5/month, and it is paid for in evenings.** The decision saves roughly $3–8/mo against Render or Railway. Against that: a 5-week after-hours budget, a solo developer, and a recorded answer of "no strong familiarity." workerd is the most unusual runtime in the candidate pool; every rejected alternative runs plain Node, where existing JS knowledge and a decade of accumulated Stack Overflow answers apply unmodified. This should have been weighted highest and was not.
- **D2 — workerd is not Node, and the gap shapes most of this app's backend.** Listed separately in the cross-check as SMTP and XLSX problems, but consolidated they are one systemic issue: FR-001 (registry import), FR-002/FR-004 (e-mail) and FR-010 (reminders) — the three non-trivial backend features — each collide with runtime limits. Every library choice now carries a "does this work on workerd?" filter whose answer often appears only after deploying, because `astro dev` and production diverge on exactly these APIs.
- **D3 — `has_background_jobs: true` in `tech-stack.md` contradicts the interview answer this decision leaned on.** *(Reasoning error.)* Interview Q1 asked about persistent connections, got "No", and that answer was used to dismiss the container tier. But importing a 200-unit registry and fanning out 200 tokenized e-mails are batch-shaped workloads, and the stack contract flags background jobs as present. On a Node host that is a loop; on Workers it is Cloudflare Queues — another binding, another vendor-specific abstraction — or careful `waitUntil` juggling inside a request-scoped runtime. A narrow reading of one interview answer was allowed to override an explicit contract field.
- **D4 — RODO: Worker execution location is unrestricted, and constraining it costs Enterprise money.** The PRD guardrail is *"dane właścicieli nie wychodzą poza budynek"* over metraż, udziały and contact details of Polish citizens. Supabase can be pinned to an EU region; Worker compute cannot. Cloudflare's [Data Localization Suite](https://developers.cloudflare.com/data-localization/) is an explicitly **Enterprise-only paid add-on**, and the jurisdictional constraints that do exist apply to storage products ([D1](https://developers.cloudflare.com/d1/configuration/data-location/), [R2](https://developers.cloudflare.com/r2/reference/data-location/)) — Cloudflare's own docs note Workers may reach a jurisdiction-constrained database "from anywhere in the world." Render (Frankfurt) and Railway (Amsterdam) each give a single nameable EU processing location on the base plan. For a product whose legal validity is already Open Question #1 in the PRD, "processed in an unspecified datacenter" is a materially worse answer to a wspólnota's lawyer.
- **D5 — This is the platform with the shortest log retention, chosen for the app whose defining property is auditability.** 3 days free, 7 days paid, against a PRD guardrail requiring any finished resolution to be reconstructable *"w dowolnym momencie."* Disputes over a vote surface in weeks, not days. Survivable — the audit trail belongs in Postgres regardless — but the platform contributes nothing to the hardest non-functional requirement, where a conventional host would.
- **D6 — The deferred protokół is the most likely next feature, and workerd is hostile to it.** Non-Goals defer "dokument i protokół do pobrania" rather than rejecting it; for a Polish resolution-voting product a downloadable protokół is the obvious v2. PDF generation on Workers means Cloudflare's Browser Rendering API — another paid, vendor-specific binding — instead of any standard Node PDF library. The cost model above does not price the feature most likely to be built next.
- **D7 — This is the least portable option of the six evaluated.** Leaving means the coupled Astro 6→7 + adapter 13→14 bump *plus* unwinding KV-backed sessions, Cron Triggers, `wrangler.jsonc` as the deploy contract, and any Queues or Hyperdrive added later. `@astrojs/node` on Render or Railway runs on any Node host, including a plain VPS. Maximum lock-in was accepted to save the smallest sum of money on the table.
- **D8 — "The repo is already wired for it" was over-weighted.** *(Reasoning error.)* Switching adapters is `npm i @astrojs/node`, two lines in `astro.config.mjs`, and deleting `wrangler.jsonc` — about fifteen minutes. It was headlined as "zero migration cost," which is status-quo bias presented as an argument, inside a document that ran a formal anti-bias check. The starter's default is not evidence about what suits this product. The original claim is struck through above.
- **D9 — Direct Postgres access requires yet another Cloudflare service.** `supabase-js` over PostgREST is fine, but Workers cannot hold TCP connections. A real transaction around the FR-007 threshold crossing, a service-role batch during import, or plain `pg` needs Hyperdrive (free plan capped at 100k queries/day) or pushes the logic into Postgres functions. That is a runtime-imposed design constraint on the one piece of business logic that must be provably correct.
- **D10 — No support path while a vote is live.** On a $5 plan escalation is community forums. Resolutions have no end date and owners are clicking e-mailed links; an account issue or unexplained rate-limiting during an active vote has no ticket to open.

### Reconsider Triggers

Any single trigger below is sufficient to reopen this decision. Reopening means: re-read this section, then either migrate to Render (`@astrojs/node` 10.1.4 — peers `astro ^6.3.0`, so **no framework upgrade is required**) or record here why the trigger was overridden.

| # | Trigger | Fires when | Primary drivers |
|---|---|---|---|
| T1 | A named EU processing location becomes a requirement | Legal review of Open Question #1 asks where owner data is processed, or a first paying wspólnota asks in procurement | D4 |
| T2 | Protokół / PDF export enters scope | The "dokument do pobrania" non-goal is lifted for v2 | D6, D2 |
| T3 | A third workerd-driven library rewrite | Any third library is discarded because it needs `fs`, `net`/`tls`, streams or native bindings | D2, D1 |
| T4 | Batch work outgrows request scope | Registry import or e-mail fan-out needs Cloudflare Queues, or exceeds CPU limits on Workers Paid | D3, D1 |
| T5 | A vote is disputed outside the log window | Any dispute is raised more than 7 days after the fact and Postgres alone cannot settle it | D5 |
| T6 | The evening cost exceeds the money saved | Cumulative time lost to workerd-specific debugging passes ~4 hours | D1, D8 |
| T7 | Transactional correctness needs real SQL transactions | FR-007 threshold logic cannot be expressed safely through PostgREST | D9 |

**Standing instruction for implementation:** keep Supabase access, mail sending, and file parsing behind thin modules with no workerd-specific imports. This is what keeps T1–T7 cheap to act on, and it is the single highest-value structural decision carried out of this document.

## Operational Story

- **Preview deploys**: `npx wrangler versions upload` uploads a version without routing production traffic and returns a versioned preview URL `<version-prefix>-estate-manager.<subdomain>.workers.dev` (aliases via `--preview-alias`, requires wrangler ≥ 4.21.0; versioned URLs require ≥ 3.74.0 and versions uploaded after 2024-09-25). Preview URLs are enabled by default whenever `workers_dev` is enabled, toggled via `preview_urls` in `wrangler.jsonc`. **They are public** — put Cloudflare Access in front before any preview points at a real registry. In GitHub Actions, fork PRs cannot read repository secrets, so fork previews will not build against Supabase.
- **Secrets**: production values live in Workers Secrets, set with `npx wrangler secret put SUPABASE_URL` / `SUPABASE_KEY` (also `secret list`, `secret delete`, `secret bulk`). Write-only — never readable after being set. The CI deploy token lives in GitHub Secrets as `CLOUDFLARE_API_TOKEN`. Local development reads `.dev.vars`, which must stay gitignored. Rotation = rotate in Supabase, `wrangler secret put` the new value, redeploy. Both variables are declared `optional` in `astro.config.mjs` `env.schema`, so a missing secret degrades to the config-status banner rather than a boot failure.
- **Rollback**: `npx wrangler rollback [VERSION_ID]` (find the ID with `npx wrangler versions list`); takes seconds and is a routing change, not a rebuild. Gradual rollout available via `npx wrangler versions deploy --percentage`. **Caveat: this reverts code only.** Supabase migrations do not roll back with it, so any deploy containing a destructive migration is not recoverable by `wrangler rollback` alone — pair destructive migrations with a manual reversal script before shipping them.
- **Approval**: an agent may run unattended — `wrangler versions upload` (preview), `wrangler tail`, `wrangler versions list`, `wrangler deployments list`, and any `astro build` / `npm run lint`. Requires a human: `wrangler deploy` to production, `wrangler rollback`, `wrangler secret put|delete`, applying any Supabase migration that drops or alters a column, and enabling the Workers Paid plan. Rationale: production traffic for this app carries owners' personal and property data, and votes are final and non-reversible by design (FR-005).
- **Logs**: `npx wrangler tail` streams live, with `--status error` and `--search <term>` filters — read-only and safe for an agent. Historical logs go through Workers Logs (already enabled via `observability.enabled: true`), queried in the dashboard under Workers & Pages → Observability, retained 3 days on Free / 7 days on Paid. The observability MCP server at `https://observability.mcp.cloudflare.com/mcp` exposes the same data as structured tools over OAuth.

## Degradation Scenarios — Why a Green Deploy Falls Apart After Months

The Risk Register below was written against *day-one* failures: things that break the first time real data touches production. This section covers the other shape — the deploy was green for months and then became unstable, with **no change in the repo on the day it started failing**. The distinguishing property of every scenario here is that a threshold was crossed by the passage of time, not by a commit. That is also why they present as "random errors": the trigger is data volume, a calendar date, or an expiring credential, none of which appear in a diff.

Ordered by likelihood for this project. Sources marked *(grounded)* were verified against the repo on 2026-08-01; quota figures are from the same research date and should be re-checked against current Cloudflare docs before being acted on.

### A. Growth crosses a runtime ceiling that traffic never would

- **G1 — The live tally's CPU cost scales with accumulated data, not with request rate.** The tally renders per-lokal server-side, and resolutions have **no end date** — the archive only grows. A page that cost 4 ms of CPU with one 20-unit building costs an order of magnitude more at forty buildings × 200 lokale × N historical resolutions. On Free this is error 1102 (10 ms ceiling); on Paid the 30 s ceiling is far away but p99 latency degrades continuously long before anything errors. **Presents as:** the heaviest wspólnota's admin sees intermittent failures, everyone else is fine, and nobody can reproduce it. This is the register's top risk re-read on a time axis: enabling Workers Paid removes the cliff but not the curve.
- **G2 — A subrequest count that grew into the per-invocation cap.** Every `supabase-js` call over PostgREST is a Worker subrequest, capped at ~50 on Free and ~1000 on Paid per invocation. A page that issued eight queries at launch issues one per lokal once someone adds a per-unit detail. **Presents as:** "Too many subrequests" on the largest tenants only, i.e. on exactly the customers who matter most.
- **G3 — Unindexed append-only tables.** The audit trail the PRD guardrail requires (*"każdy głos jest policzalny i ma ustalony ślad"*) is the fastest-growing table in the schema and the one least likely to get an index, because it is never read during development. Sequential scans that are free at 1k rows are pathological at 500k. Postgres latency is I/O wait, so it does not consume Worker CPU — it consumes the wall-clock and subrequest budget instead, and it turns G1 and G2 from theoretical into live.
- **G4 — KV write quotas and the per-key write ceiling under real concurrency.** Adapter v13 auto-provisions KV for Astro sessions. KV enforces a daily write quota on the free plan and a rate ceiling of roughly one write per second **to the same key**. Session writes scale with admin activity. **Presents as:** admins randomly logged out mid-import, plus a strictly worse version of the ~60 s eventual-consistency risk already in the register, because more colos are now serving the same session.
- **G5 — Supabase-side saturation and maintenance.** PostgREST connection pools on a small instance exhaust under the synchronized bursts described in G11; forced Postgres upgrades and maintenance windows produce connection resets. A Worker with no retry policy surfaces both as a 500. **Presents as:** short, self-healing outage clusters that leave no trace after the log window closes.

### B. Drift while the code stands still

- **G6 — Both Supabase secrets are declared `optional`, so credential expiry degrades silently.** *(grounded — `astro.config.mjs` declares `SUPABASE_URL` / `SUPABASE_KEY` as `optional: true`.)* This was a deliberate starter choice so a missing secret shows the config-status banner rather than failing boot — which is correct at scaffold time and dangerous in month six. A rotated Supabase key, a regenerated JWT secret, or a `wrangler deploy` from a shell that lost its secret bindings all produce a **successful deploy of a non-functional app**. Cloudflare reports healthy, the Worker returns 200, and every data-bearing page is empty. This is the highest-severity item in this section precisely because the platform's own signals stay green.
- **G7 — The pinned `compatibility_date` ages away from the runtime.** *(grounded — `wrangler.jsonc` pins `2026-05-08` with `nodejs_compat`.)* Pinning freezes semantics while workerd itself keeps shipping, and each `npm ci` pulls a newer local wrangler, so the gap between what dev runs and what production runs widens every month. **Presents as:** a routine dependency bump or a long-deferred compat-date bump landing months of accumulated behaviour change in one deploy — a "we changed nothing" release that changes everything, with `nodejs_compat` stub behaviour the most likely surface.
- **G8 — Caret ranges over an aging lockfile.** *(grounded — every dependency in `package.json` uses `^`; `package-lock.json` exists and CI runs `npm ci`.)* CI is reproducible; a laptop is not. Any `npm install` months later floats `@astrojs/cloudflare` across 13.x minors that can change bundling and the polyfill surface, and the resulting deploy is not the artifact CI validated. **Presents as:** works for whoever deployed last, breaks for the next person, and the lockfile diff is never suspected.
- **G9 — Astro 6 / adapter 13 reach end-of-life while the coupled 6→7 bump stays unaffordable.** D7 priced this migration once, statically. On a time axis it is worse: workerd-compatibility and security fixes land only on the 14.x line, so every month spent not migrating adds known-fixed bugs to production while raising the cost of the fix. **Presents as:** structural instability with no single cause — the correct diagnosis is "the platform moved and we didn't", which no error message will ever say.

### C. Scheduled work failing where nobody is looking

- **G10 — The reminder cron's per-tick workload grows monotonically and fails silently.** FR-010 reminders must re-derive state from Postgres on every fire (already in the register), and resolutions have no end date, so each tick scans an ever-larger set of open resolutions × owners. First the tick slows, then it exceeds its budget, then it half-completes. A cron failure produces **no user-visible error** — only e-mails that do not arrive. Worse, a partially-completed non-idempotent tick that gets retried double-sends. **Presents as:** "owners stopped getting reminders" reported weeks after it started, and separately "owners got the same reminder four times".
- **G11 — Reminder fan-out creates a synchronized click spike.** Every batch of 200 tokenized links produces a burst of traffic into the same page within minutes. Average traffic stays trivial, but the ceilings in G1–G5 are crossed at the peak. **Presents as:** instability that correlates with the cron schedule rather than with load, which is why capacity dashboards look fine.
- **G12 — Transactional-mail limits and reputation erode with volume.** Free-tier monthly caps arrive as buildings accumulate; bounces from stale addresses in imported registries accumulate against domain reputation; a 200-recipient burst in seconds looks like a spam pattern. The HTTP API returns 202 either way. **Presents as:** "the voting link never arrived" — a deliverability failure that is indistinguishable from an application bug from inside the app.

### D. The feedback loop that was supposed to catch all of the above

- **G13 — CI had never run.** *(grounded — `.github/workflows/ci.yml` triggered on `push` and `pull_request` to `master`; this repo's branches are `main` and `docs/agent-onboarding`, and no `master` exists.)* Lint and build therefore gated nothing from the repo's creation until **2026-08-01, when the trigger was corrected to `main`**. Two things remain open: the workflow is not yet a *required* status check (branch protection is a GitHub settings change, not a repo change), so a red build still does not block a merge; and every commit made before the fix went to `main` unverified, so the first green run is a baseline, not a regression signal.
- **G14 — No test script and no migration history.** *(grounded — `package.json` defines no `test`; `supabase/` contains only `config.toml`.)* Schema changes applied by hand mean the repo and production diverge with no record of when. The consequence compounds with an item already in the register: `wrangler rollback` reverts code only, so once the schema has drifted, **rolling back stops being an available action** — exactly at the moment it is most needed.
- **G15 — Every change is validated in production.** *(grounded — `wrangler.jsonc` defines no environments and the Worker is still named `10x-astro-starter`.)* With no staging environment, fork-PR previews unable to read secrets, and preview URLs that are public by default (and therefore avoided once real data exists), the path of least resistance over months is `wrangler deploy`. Preview discipline decays quietly.
- **G16 — 7-day log retention makes months-long degradation invisible as a pattern.** The register already flags retention as an audit problem. It is equally an operations problem: intermittent decay needs trend data, the platform keeps a week, and no alerting exists. **Presents as:** each incident investigated as a fresh mystery, the same fix attempted repeatedly, and no way to answer "when did this start".

### If the instability is happening now — triage order

1. **Rule out G6 first.** Confirm `SUPABASE_URL` / `SUPABASE_KEY` are actually set on the deployed Worker (`npx wrangler secret list`) and that the app is not silently serving the config-status banner path. Cheapest check, most invisible failure.
2. **Check for 1102 and subrequest errors by tenant, not in aggregate** (`npx wrangler tail --status error`), and correlate against the largest wspólnota and against cron fire times — that distinguishes G1/G2 from G10/G11.
3. **Look at Postgres before looking at the Worker.** `EXPLAIN` the tally and audit-trail queries at current row counts (G3); Worker symptoms are usually downstream of a missing index.
4. **Diff the deployed artifact against the repo.** Compare `npx wrangler deployments list` against the commit history and `package-lock.json` mtime (G8), and check whether the compatibility date has been outrun (G7).
5. **Fix CI's branch trigger before fixing anything else permanently** (G13) — otherwise the next regression follows the same path to production as this one.

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
| Worker compute location is unrestricted; RODO/data-residency questions have no answer below Enterprise | Dissent D4 | M | H | Pin Supabase to an EU region and keep all owner data there; if a named processing location is ever required, treat as trigger **T1** and migrate to Render (Frankfurt) — do not attempt to solve it on Cloudflare |
| Cumulative workerd-specific debugging exceeds the ~$5/mo the choice saves | Dissent D1 / D8 | M | M | Track time lost to runtime-specific rewrites; at ~4 hours treat as trigger **T6** and migrate rather than continuing to absorb it |
| Batch-shaped work (registry import, 200-owner e-mail fan-out) outgrows a request-scoped runtime | Dissent D3 | M | M | Do not build on `waitUntil` beyond a single fan-out; if Cloudflare Queues becomes necessary, treat as trigger **T4** and re-evaluate against a Node host first |
| Protokół/PDF export enters scope and requires Browser Rendering instead of a standard Node library | Dissent D6 | M | M | Treat as trigger **T2**; price the Cloudflare-specific path against migrating to Render before committing to Browser Rendering |
| Lock-in accumulates (KV sessions, Cron Triggers, Queues, Hyperdrive) until migration is no longer ~15 minutes | Dissent D7 | M | H | Keep Supabase access, mail sending and file parsing behind thin modules with no workerd-specific imports — the standing instruction in the Dissent section |
| FR-007 threshold logic needs a real SQL transaction that PostgREST cannot express | Dissent D9 | L | H | Implement the threshold crossing as a Postgres function invoked via RPC, keeping correctness in the database rather than the runtime; escalate to trigger **T7** if that proves insufficient |
| No support escalation path on the $5 plan during an active vote | Dissent D10 | L | M | Accept for MVP; revisit before the first paying wspólnota, since resolutions have no end date and an outage lands mid-vote |

### Time-Dependent Risks (post-launch degradation)

Rows below come from the [Degradation Scenarios](#degradation-scenarios--why-a-green-deploy-falls-apart-after-months) analysis. They differ from the rows above in trigger, not in subject: these fire after months of normal operation with no corresponding change in the repo. Likelihood is assessed **over a 6–12 month horizon**, not at launch.

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| ~~CI has never run — workflow triggers on `master`, repo branch is `main`, so lint/build gate nothing~~ **Resolved 2026-08-01**; residual: the check is not required, so a red build still does not block a merge | Degradation G13 | L (was Certain) | H | Trigger corrected to `main` in `.github/workflows/ci.yml`. **Remaining action:** enable branch protection on `main` and mark the `ci` job a required status check — until then the signal exists but is advisory |
| Rotated/expired Supabase credentials deploy successfully and degrade silently, because both env vars are `optional: true` | Degradation G6 | H | H | Add a startup assertion or a `/health` route that fails loudly when a secret is absent in production; keep `optional` only for local/preview; verify with `wrangler secret list` after every rotation |
| Live tally CPU cost grows with accumulated buildings × open resolutions until it crosses the invocation ceiling | Degradation G1 | H | H | Replace per-lokal server rendering with a single aggregate SQL query or a materialised tally row; add a closed/archived state for resolutions so the working set stops growing; re-run the 200-unit load test at each 10× of real data |
| Unindexed append-only audit and vote tables turn into sequential scans as row counts grow | Degradation G3 | H | M | Index the audit trail on `(resolution_id, created_at)` and equivalents at creation time, not after the incident; `EXPLAIN` the tally query against a seeded 500k-row fixture before the first paying wspólnota |
| Reminder cron's per-tick work grows without bound and fails silently — no user-visible error, only missing e-mails | Degradation G10 | H | M | Make each tick idempotent, bounded (process a capped batch per fire) and self-reporting: write a run record to Postgres with counts, and alert on a missed or empty run rather than relying on the platform |
| Schema drift with no migration history makes `wrangler rollback` unusable exactly when it is needed | Degradation G14 | H | H | Put every schema change in `supabase/migrations/` and apply it only from there; treat a hand-edit in the Supabase dashboard as an incident, not a shortcut |
| Astro 6 / adapter 13 reach EOL while the coupled 6→7 bump stays deferred, so fixes stop arriving | Degradation G9 | M | H | Schedule the Astro 6→7 + adapter 13→14 bump as its own work item on a calendar date, not on a trigger; the cost of this migration only rises, and it must never coincide with a live vote |
| Pinned `compatibility_date` (2026-05-08) drifts from the runtime; a deferred bump lands months of change at once | Degradation G7 | M | M | Bump the compatibility date deliberately on a schedule, alone in its own deploy, verified against a preview URL — never bundled with a feature change |
| Caret ranges float on any non-CI `npm install`, so the deployed artifact is not the one CI validated | Degradation G8 | M | M | Deploy only from CI, or `npm ci` before every manual deploy; treat a `package-lock.json` change in a feature PR as requiring its own review |
| Subrequest count per invocation grows past the plan cap on the largest tenants | Degradation G2 | M | M | Batch Supabase reads into single queries with joins rather than per-lokal fetches; assert a query-count budget in the tally path during development |
| Reminder fan-out creates a synchronized traffic spike that crosses ceilings the average load never approaches | Degradation G11 | M | M | Stagger the fan-out across a window instead of firing a batch at once; size capacity against the peak, not the mean |
| Transactional-mail caps and eroding domain reputation cause silent non-delivery of voting links | Degradation G12 | M | H | Persist provider message IDs and webhook delivery/bounce events in Postgres so "sent" and "delivered" are distinguishable; set up SPF/DKIM/DMARC before the first real building; monitor the bounce rate |
| KV session write quotas and the ~1 write/s per-key ceiling bite as admin concurrency grows | Degradation G4 | M | M | Do not write the session on every request; keep session payloads minimal and re-resolve the user from Supabase, as `src/middleware.ts` already does |
| Supabase connection-pool exhaustion and maintenance windows surface as unretried 500s | Degradation G5 | M | M | Wrap Supabase access in the thin module mandated by the standing instruction and give it bounded retry with jitter on connection-level errors only |
| Preview discipline decays until every change is validated in production | Degradation G15 | M | M | Define a staging environment in `wrangler.jsonc` with its own Supabase project and synthetic registry data; make `wrangler versions upload` a required step in the deploy runbook |
| 7-day log retention leaves months-long degradation with no trend data and no alerting | Degradation G16 | M | M | Export the signals that matter (error counts per route, cron run records, tally render duration) to Postgres or an external sink; do not rely on Workers Logs to answer "when did this start" |

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
- **Formal RODO/GDPR assessment.** The Dissent (D4) establishes that Worker execution location is unrestricted below Enterprise; it does not determine whether that is *acceptable* under Polish law for this data. That determination belongs with PRD Open Question #1 and its owner.

## Revision History

- **2026-08-01 — initial research.** Six platforms scored, Cloudflare Workers recommended, Render runner-up, three anti-bias lenses applied.
- **2026-08-01 — G13 remediated.** Corrected the CI trigger in `.github/workflows/ci.yml` from `master` to `main`, so lint and build now actually run on push and PR. Risk downgraded from Certain to L; the residual — making the `ci` job a required status check via branch protection — is a GitHub settings change and remains open.
- **2026-08-01 — degradation analysis added.** Added `## Degradation Scenarios` (G1–G16) covering post-launch instability — failures triggered by data growth, config/dependency drift, silently failing scheduled work, and an eroded feedback loop — plus a `### Time-Dependent Risks` block in the register. Four scenarios are grounded findings about the repo as it stands, not projections: CI targets a `master` branch that does not exist (G13), both Supabase secrets are `optional` so credential loss deploys green (G6), there is no migration history (G14), and no staging environment is defined (G15). The recommendation and `decision_status` are unchanged.
- **2026-08-01 — dissent recorded.** Added `## Dissent`, `### Reconsider Triggers` (T1–T7), and eight derived risk-register rows. Retracted the "zero migration cost" argument (D8) and recorded that the interview's persistent-connections answer was allowed to override `has_background_jobs: true` in `tech-stack.md` (D3). The recommendation is unchanged; `decision_status` is now `recommended-with-recorded-dissent`.
