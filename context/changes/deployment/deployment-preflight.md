---
project: estate-manager
created_at: 2026-08-01
doc_type: pre-flight-checklist
companion: context/changes/deployment/deployment-plan.md
status: all-items-open
placement_note: >
  Moved from context/foundation/ on 2026-08-01, alongside its companion plan.
  Same tension applies: this checklist is re-read before every deployment, so it
  outlives the change that created it. Promote it back to foundation/ if it
  becomes a standing checklist rather than a one-time gate.
---

# Deployment Pre-flight

Work through this **before** starting a deployment session. Its companion, [`deployment-plan.md`](./deployment-plan.md), does not begin until every row here is green — that is step 0 of the plan.

All five items are external accounts and credentials the agent cannot create. This is the entire set of things that must exist outside the repo.

## Checklist

| ☐ | System | What to prepare | Verify with | Needed by |
|---|---|---|---|---|
| ☐ | **Cloudflare account** | Account exists; `npx wrangler login` completed (interactive OAuth). Note your `*.workers.dev` subdomain. Decide whether Workers Paid is on — the plan assumes Free. | `npx wrangler whoami` → shows an account, not "not authenticated" | C9, C11 |
| ☐ | **Cloudflare API token** | Created from the *Edit Cloudflare Workers* template. Store it the moment it appears — it is shown once and never again. | Token string in hand | D13 |
| ☐ | **GitHub repository** | Empty repo, private recommended. Do **not** initialise it with a README — the local `main` will be pushed into it. `gh` CLI is not installed, so create it via github.com. | `git remote -v` → should show `origin` | D12 |
| ☐ | **Supabase project** | Created in **EU (Frankfurt / `eu-central-1`)**. Project URL + **`anon`** key from Settings → API. | Both values in hand | B5–B8 |
| ☐ | **Local toolchain** | Node 22.14.0 per `.nvmrc`; dependencies installed. | `node -v`, then `npm ci` completes clean | A4 |

**State at time of writing (2026-08-01): all five open.** `npx wrangler whoami` reports not authenticated, `git remote -v` is empty, `gh` is not installed, and `supabase/config.toml` holds only the starter's local config with `project_id = "10x-astro-starter"`.

## Three of these are expensive to get wrong

Ordinary mistakes elsewhere in the deployment cost a re-run. These three do not:

1. **Supabase region is immutable after project creation.** Getting it wrong means recreating the project and re-issuing every credential. EU Frankfurt is not a preference — it is the mitigation for dissent item **D4** in [`infrastructure.md`](../../foundation/infrastructure.md): Worker compute location cannot be pinned below an Enterprise plan, so where the *data* lives is the only residency lever this architecture has. The RODO question is still PRD Open Question #1.
2. **The `anon` key, never the service-role key.** `src/lib/supabase.ts` uses `@supabase/ssr` cookie-based auth. A service-role key deployed to a Worker bypasses Row Level Security entirely, on an app whose guardrail is *"dane właścicieli nie wychodzą poza budynek"*.
3. **The Worker name becomes the hostname.** `wrangler.jsonc` `name` is both the Worker identity and the `*.workers.dev` subdomain. Renaming after the first deploy creates a *second* Worker rather than moving the first — which is why the rename to `estate-manager` is step A1, before anything is deployed.

## Standing instruction for the deployment session

**Ask, do not assume.** Verify each row above with its stated command rather than from memory, and stop to ask whenever something is missing, ambiguous, or differs from what these documents record — rather than inventing a value or working around the gap.

Specifically, never guess at: Worker name, Supabase region, key type (`anon` vs service-role), API token scope, repository visibility or remote URL, or whether the Workers Paid plan is active.

## What happens after this is green

Open [`deployment-plan.md`](./deployment-plan.md) and start at step 0. The ordering there is: repo prep (A) → Supabase wiring (B) → first manual deploy (C) → CI/CD auto-deploy (D) → record the outcome (E).
