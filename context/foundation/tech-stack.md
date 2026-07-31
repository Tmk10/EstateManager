---
starter_id: 10x-astro-starter
package_manager: npm
project_name: estate-manager
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: true
---

## Why this stack

A solo developer shipping a share-weighted resolution-voting MVP in five
after-hours weeks needs a pinned, opinionated starter rather than an assembled
one. Astro+Supabase+Cloudflare is the recommended default for `(web, js)` and
clears all four agent-friendly gates. The product needs exactly two surfaces:
an authenticated administrator area (registry import, resolution creation, live
share tally) and an unauthenticated tokenized page an owner opens once from an
e-mail link — both server-rendered pages plus API routes, no client-side app.
Supabase supplies Postgres, the admin e-mail/password login, and file-import
storage out of the box; the threshold rule is arithmetic over a small table, so
explicit TypeScript and Zod contracts at the boundary are the whole data story.
The PRD's `large` user scale is read-count, not write-load, so the edge deploy
is sufficient. Two PRD requirements fall outside the starter and are owned
explicitly: transactional e-mail for individual voting links (FR-002, FR-004)
via a mail API called from an Astro API route, and the limited reminder series
(FR-010, nice-to-have) via Cloudflare Cron Triggers or Supabase `pg_cron`.
