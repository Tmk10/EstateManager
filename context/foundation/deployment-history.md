---
project: estate-manager
doc_type: deployment-history
status: append-only
companion: context/changes/deployment/deployment-plan.md
---

# Deployment History

One entry per deployment, newest last. **Append only** — never rewrite a past
entry to make it look correct in hindsight. `infrastructure.md` is deliberately
not touched by deployments; it stays the research-and-decision artifact, and its
value depends on not being retrofitted after the fact.

---

## 2026-08-01 — first production deployment

| | |
|---|---|
| **Commit** | `f8d35e10a6a6b0524ff170eb584787aebf1a210f` |
| **Worker** | `estate-manager` |
| **URL** | https://estate-manager.estate-manager.workers.dev |
| **Version ID (current)** | `b86cd1b3-830e-459f-bc80-a2137a492c7c` |
| **Rollback targets** | `545af708-218a-450e-a1c5-951fc8917102`, `10ff270e-33e3-4f30-93c9-c5d853942611` (both created implicitly by `wrangler secret put`), `d411e297-ac61-476e-b060-bb3ae4df0ca5` (initial deploy, before secrets — **do not roll back to this one**, it has no credentials) |
| **Plan** | [`deployment-plan.md`](../changes/deployment/deployment-plan.md), sections A–D |
| **Bundle** | 1913 KiB raw / 391 KiB gzip; Worker startup 21 ms |
| **Cloudflare plan** | Workers **Free** |

### What changed

Executed sections A–D of the deployment plan: identity rename off
`10x-astro-starter`, the `/api/health` route as the **G6** mitigation,
`deploy.yml` for auto-deploy-on-merge, and the README / `tech-stack.md`
corrections.

### Deviations from the plan as written

These are the places execution diverged from the approved document. Recorded
because the plan is the contract, and silent drift is what makes runbooks rot.

1. **`package-lock.json` was renamed too.** The plan's A1 lists three files. The
   lockfile carries the package name in two places, and leaving it stale would
   desync it from `package.json` — which `npm ci` in `deploy.yml` depends on.
2. **The `SESSION` KV namespace had to be created — the plan never anticipated
   it.** `@astrojs/cloudflare` enables Astro sessions by default and generates
   `dist/server/wrangler.json` containing `kv_namespaces: [{ binding: "SESSION" }]`
   with **no id**. Left alone this resolves through wrangler's interactive
   provisioning flow, which has no TTY inside GitHub Actions. Namespace
   `1a914a1c1f00405794482cea29c6bfd3` was created and pinned in `wrangler.jsonc`
   so that both the manual and CI paths are deterministic.
3. **C9 was already satisfied.** `wrangler login` had been completed before the
   session; the pre-flight's own recorded state ("not authenticated") was stale.
4. **The GitHub remote existed but pointed at a repository that did not.** It
   was also named `EstateManager` rather than `origin`. Removed and recreated
   via `gh repo create` — `gh` **is** installed, contrary to what both the plan
   and the pre-flight assumed.
5. **Node was v26.0.0 locally against a `.nvmrc` pin of 22.14.0.** `fnm` was
   installed and 22.14.0 made active, so local verification matches CI's node 22
   rather than diverging from it.
6. **`503` bodies carry a `status` field the plan did not specify.** The plan
   gives `503 { supabase: "unreachable" }`; the implementation emits
   `{ status: "degraded", supabase: "unreachable" }` for consistency with the
   other two responses.
7. **First deploy was made from an uncommitted working tree.** The commit above
   captures that state after the fact rather than before it. Every subsequent
   deployment goes through `deploy.yml` from a committed SHA, so this applies to
   the first deployment only.

### Verification

| Check | Result |
|---|---|
| `astro sync` + `lint` + `build` (node 22.14.0) | green |
| Local `/api/health` with `.dev.vars` | `200 {"status":"ok"}` |
| Local `/api/health` without `.dev.vars` | `503 misconfigured / missing-credentials` |
| Production `/api/health` **before** secrets | connection failed — TLS cert for a first-ever `*.workers.dev` subdomain was still provisioning |
| Production `/api/health` after secrets + redeploy | `200 {"status":"ok"}` — proves the Worker reaches Supabase with the anon key |
| Production `/`, `/auth/signin`, `/auth/signup` | `200` |
| Production `/dashboard` unauthenticated | `302` → `/auth/signin` |
| Production `/does-not-exist` | `404` |
| Production `POST /api/auth/signin`, bad credentials | `302` → `/auth/signin?error=Invalid%20login%20credentials`. The error text comes from Supabase Auth, so the deployed Worker really does authenticate against the cloud project |
| Config-status banner in production | absent — secrets are being read |
| `wrangler tail` while exercising the above | attached (`Connected to estate-manager`), logged `POST /api/auth/signin - Ok`, **no exceptions and no `nodejs_compat` stub errors** |
| CI (`ci.yml`) on first push | **success** |
| `deploy.yml` on first push | **failure, expected** — `npm ci` → `astro sync` → `lint` → `build` all passed and only the wrangler step failed on the missing `CLOUDFLARE_API_TOKEN` |
| Rollback available | yes — see rollback targets above |

**Note on the CSRF check.** A `POST` to an auth endpoint without an `Origin`
header returns `403`, not a redirect. That is Astro's `security.checkOrigin`
behaving correctly, not a broken endpoint — browsers always send `Origin`. Worth
knowing before anyone debugs a `403` from `curl` or a health-check probe.

### Not verified

- **Functional smoke (plan verification step 3)** — the *authenticated* half is
  unproven: sign up with a real inbox, click the confirmation link, sign in, load
  `/dashboard` as a logged-in user, sign out. Email confirmation is on, so this
  needs a human with a mailbox. Rejection of bad credentials **is** confirmed
  against cloud Supabase (above); no successful login has ever occurred in
  production. **Outstanding**, and note it will keep failing until B7 sets the
  Site URL, since confirmation links currently point at the wrong origin.
- **CI/CD loop (plan verification step 5)** — half proven. `CLOUDFLARE_API_TOKEN`
  was added on 2026-08-01 and `deploy.yml` then ran green end to end, publishing
  version `c7d7e037-aad5-4909-848a-b388c70b95dc` as the current deployment at
  100%. So auto-deploy-on-merge works. What is **still not proven** is the half
  that matters: that a deliberate lint error fails the job *without deploying*.
  The plan is explicit that this must be demonstrated rather than assumed,
  because it is the entire substitute for the branch protection D15 deferred.
  **Outstanding.**

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

### Gotcha: the CI token is account-owned

`CLOUDFLARE_API_TOKEN` is an **account-owned** token (prefix `cfat_`), not a
user-owned one. This matters when debugging it, because the usual validity check
lies:

```
GET /client/v4/user/tokens/verify                 -> 1000 "Invalid API Token"   (WRONG)
GET /client/v4/accounts/{account_id}/tokens/verify -> success, status: active   (right)
```

An account-owned token reports as invalid against the `/user/` endpoint even
when it is perfectly good. Verify against the account endpoint instead. This one
does have permission to enumerate `/accounts`, which is the first call
`wrangler deploy` makes — a token that cannot will fail there regardless of its
Workers permissions.

Related: when storing it, pipe the value into `gh secret set` on **stdin**. A
value passed as an argument risks landing as the secret *name*, and secret names
are not secret — they are shown in the Actions UI and in `gh secret list`.

### Follow-ups for a human

1. Supabase → Auth → URL Configuration: set **Site URL** to
   `https://estate-manager.estate-manager.workers.dev` (plan step **B7**).
   Until this is set, confirmation links in signup emails point at the wrong
   origin.
2. Prove the deploy gate: push a commit with a deliberate lint error and confirm
   `deploy.yml` fails **without** deploying, then revert. This is the D15
   substitute and the plan requires it to be demonstrated.
3. Run the functional smoke test above.
4. `src/lib/config-status.ts:16` still links the banner to the
   `10x-astro-starter` README. Left alone because the plan freezes `src/lib/`.
5. Optional cleanup: `actions/checkout@v4` and `actions/setup-node@v4` trigger a
   Node 20 deprecation annotation on every run (current releases are v7). The
   `site` option is unset in `astro.config.mjs`, so `@astrojs/sitemap` is
   installed but silently generates nothing.
