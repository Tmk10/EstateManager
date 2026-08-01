# Production Administrator Access (F-01) Implementation Plan

## Overview

Roadmap item `F-01` (`production-admin-access`) — the first foundation. Its job is to make
administrator access to production **real and demonstrated** rather than assumed, and to stop a
missing or rotated Supabase credential from shipping as a green deploy.

Four things land together: the registration path the product decided against is deleted, a
successful sign-in lands on the authenticated surface instead of the starter landing page, a
post-deploy health assertion turns a broken deploy red, and both that assertion and the existing
lint gate are proven by exercise instead of assumption.

Nothing here is a rewrite of authentication. The sign-in path already works; this change removes
what contradicts the product decision, and makes the failure modes loud.

## Current State Analysis

**Already done.** Commit `b1a9e6f` landed the sign-in notice at `src/pages/auth/signin.astro:16-25`
— it states both that accounts come from the Supabase dashboard and the MVP credentials
`test@test.com` / `Test123!`. That third of `F-01`'s outcome needs verification, not work.

**The registration path is live and wider than "remove signup".** `/auth/signup` returns `200` on
production today. Reachable traces:

| File | What it is |
| --- | --- |
| `src/pages/api/auth/signup.ts` | Form-data endpoint calling `supabase.auth.signUp()`, redirecting to `/auth/confirm-email` |
| `src/pages/auth/signup.astro` | The registration page |
| `src/pages/auth/confirm-email.astro` | Post-signup "check your inbox" page, branching on `import.meta.env.DEV` |
| `src/components/auth/SignUpForm.tsx` | The form component |
| `src/components/Topbar.astro:29-32` | "Sign up" nav link |
| `src/components/Welcome.astro:47-52` | "Sign Up" call-to-action button |
| `README.md:148-149`, `README.md:134-142` | Route table rows and the "Email confirmation in local development" section |

The four shared components (`FormField`, `PasswordToggle`, `SubmitButton`, `ServerError`) are
imported by `SignInForm.tsx` as well — verified by grep. They stay.

**No successful production login has ever occurred.** `context/changes/deployment/deployment.md`
§"What was not verified" is explicit: only *rejection* of bad credentials is proven against cloud
Supabase (`302 → /auth/signin?error=Invalid%20login%20credentials`). The MVP account does not yet
exist in the production Supabase project — creating it is a prerequisite of Phase 3, performed in
the dashboard.

**The silent-secret hole.** `SUPABASE_URL` / `SUPABASE_KEY` are `optional: true` in
`astro.config.mjs:19-20`. `createClient()` in `src/lib/supabase.ts:6-8` returns `null` when either
is unset, and every auth path no-ops while the build stays green. `/api/health` already detects the
condition and is documented, but **nothing consumes its verdict** — `deploy.yml` publishes and
stops. Production currently answers `200 {"status":"ok"}`, verified during planning.

**The deploy gate is unproven in the negative.** `deploy.yml` orders `lint → build → wrangler
deploy` precisely so a failure never ships, and `CLAUDE.md` names this in-job ordering as the only
substitute for branch protection. It has published green twice; that a *failing* lint stops the
deploy has never been demonstrated.

## Desired End State

- `/auth/signup`, `/auth/confirm-email` and `POST /api/auth/signup` return `404` on production; no
  page links to them.
- Signing in with the MVP account on the live Worker lands the administrator on `/dashboard`,
  the session survives a page load, sign-out ends it, and `/dashboard` redirects again afterwards
  — demonstrated, with the result recorded.
- A deploy that publishes a Worker which cannot reach Supabase produces a **red** GitHub Actions
  run rather than a green one.
- A commit that fails lint produces a red run in which `wrangler deploy` never executes —
  demonstrated once, then reverted.
- `CLAUDE.md` §Current state and the deployment runbook's outstanding list reflect all of the
  above, with no stale claims about `/auth/signup` or unverified smoke tests.

### Key Discoveries:

- `src/pages/auth/signin.astro:16-25` — the dashboard-accounts notice already exists; do not
  rewrite it.
- `src/components/auth/SignInForm.tsx:3-6` — shared components are co-owned with the sign-up form;
  deleting `SignUpForm.tsx` alone is safe, deleting the shared four is not.
- `src/pages/api/auth/signin.ts:18` — post-login redirect target is `/` today, a one-line change.
- `wrangler.jsonc:9` — `not_found_handling: "404-page"`, and there is no `src/pages/404.astro`;
  production already answers unknown paths with `404`, verified during planning. Deleting the route
  files is sufficient — no stub, no redirect.
- `src/pages/api/health.ts:29-49` — returns `503` for *both* `missing-credentials` and
  `unreachable`; it deliberately never echoes the URL or key.
- `.github/workflows/deploy.yml:26-34` — the `lint → build → deploy` ordering with the comment
  explaining it is the gate. The new assertion appends after `wrangler-action`.

## What We're NOT Doing

- **Not touching `PROTECTED_ROUTES`.** `/dashboard` is already gated; no new protected route exists
  until `S-01`.
- **Not rebuilding `/dashboard`.** It stays the placeholder showing the signed-in email. `S-01`
  gives it content; inventing an admin home now means `S-01` redoes it.
- **Not replacing the public test credentials.** Parked as PRD §Open Questions nr 3 — blocking for
  deployment with a real registry, not for the PoC.
- **Not making the env vars required.** Considered and rejected: with `access: "secret"` these
  validate at runtime, so the Worker would throw on first access *including inside `/api/health`*,
  killing the probe that diagnoses the condition — and it would never fire in CI, where the secrets
  are present, while production reads platform secrets the build never sees.
- **Not adding a middleware kill-switch.** The CI assertion covers the operator; a runtime 503 gate
  for visitors is a second mechanism for one condition, against a foundation the roadmap scopes as
  deliberately minimal.
- **Not auto-rolling-back on a failed health assertion.** The probe cannot distinguish "bad deploy"
  from "Supabase is down", and one recorded rollback target predates the secrets entirely.
- **No starter cleanup beyond the registration path.** The `config-status.ts:16` link to the
  `10x-astro-starter` README, the unset `site` option for `@astrojs/sitemap`, and the Node 20
  deprecation annotations stay as recorded residuals.
- **Nothing in this repo creates users in the production project.** No script, no seed, no
  service_role key. Production accounts are a manual dashboard prerequisite, by design — see Phase 0.
- **No seed data beyond the administrator account.** Buildings, units and owners belong to `S-01`,
  which extends the same `supabase/seed.sql`.
- **No test files.** This repo has no test runner (`CLAUDE.md`); "automated verification" here means
  lint, build, `curl`, and observing a CI run.

## Implementation Approach

Five phases, each its own commit straight to `main` (per `context/foundation/lessons.md` — never a
feature branch). Phases 0–2 are code and CI; every push to `main` auto-deploys, so Phase 3's
production verification exercises exactly what they shipped. Phase 4 proves the gate and syncs the
written record last, because it is the only phase that deliberately reddens CI and its docs updates
depend on the outcomes of everything before it.

Phase 0 establishes the environment asymmetry the rest of the plan relies on: **local creates the
administrator automatically, cloud requires it to already exist.** Local data is disposable and
wants zero friction; production must have no code path capable of minting administrators. A
consequence worth stating, because it removes the plan's sharpest object: no service_role key is
fetched or handled anywhere.

Phase 0 comes first for a diagnostic reason too — it verifies the cloud account against production
**as it stands today**, before any code changes. That separates "the account works" from "our
changes work": if Phase 3 later fails, Phase 0 has already ruled out the account as the cause.

Ordering matters in three places: Phase 0 before Phase 3, Phases 1–2 live before Phase 3 runs, and
Phase 3's result before Phase 4's record sync can be written.

## Critical Implementation Details

**Timing & lifecycle.** Phase 4 deliberately commits a lint error, and this repo runs husky +
lint-staged with `eslint --fix` on `*.{ts,tsx,astro}` (`package.json`). The hook will silently
repair the error before it is ever committed, producing a green run that proves nothing. That
commit must bypass the hook (`git commit --no-verify`), and the plan is worthless if it does not.

**Debug & observability.** `/api/health` answers `503` for a missing credential and `503` for an
unreachable Supabase — indistinguishable to the caller by design, since neither may leak the URL or
key. The CI assertion therefore cannot tell a bad deploy from a dependency outage, which is the
reason it fails the job for a human to judge rather than acting on the verdict itself. Retrying
briefly before failing is what keeps a transient Supabase blip from reddening an otherwise good
deploy.

---

## Phase 0: Seed locally, verify on cloud

### Overview

Settle where the administrator account comes from, and make the two environments explicitly
different rather than accidentally so:

- **Local** — the account is **created automatically** by a seed file, so a fresh `supabase db reset`
  yields a working admin with no manual step.
- **Cloud** — the account is a **prerequisite**. Nothing in this repo creates users in the production
  project; the account must already exist there, and this phase only proves that it does.

That asymmetry is the point. Local wants zero friction and its data is disposable; production wants
no code path capable of minting administrators, on a product whose guardrail is that owners' data
never leaves their building. Keeping creation out of the cloud path also means **no service_role key
is ever fetched, exported, or handled** by this plan — the sharpest object in the earlier draft is
gone entirely.

**Why local can be automatic and cloud cannot.** Verified during planning: `supabase/config.toml:209`
sets `enable_confirmations = false` for local, so a locally seeded user is immediately able to sign
in. The hosted project reports `mailer_autoconfirm: false` (`GET /auth/v1/settings`), so any account
created there without an explicit confirmation flag lands unconfirmed and *cannot* sign in — which is
what the dashboard's **Auto Confirm User** tickbox exists to override. The environments genuinely
behave differently; the plan reflects that instead of papering over it.

The Supabase CLI cannot help either way — v2.98.2 has no user-management command.

### Changes Required:

#### 1. Local seed file

**File**: `supabase/seed.sql` (new)

**Intent**: Give a local database a working administrator account with no manual step, so
`npx supabase start && npx supabase db reset` is the whole local setup.

**Contract**: `supabase/config.toml:60-65` already declares `[db.seed] enabled = true` with
`sql_paths = ["./seed.sql"]`, and that file does not exist yet — this creates the file the config
already points at. It runs automatically on `supabase db reset`.

The seed inserts `test@test.com` / `Test123!` into `auth.users` with `email_confirmed_at` set, using
`crypt(…, gen_salt('bf'))` for the password. Two things are load-bearing and are the reason this is
worth spelling out:

- **A matching `auth.identities` row is required.** A user row alone is the classic way to produce
  an account that appears in the dashboard and still fails sign-in — GoTrue resolves email logins
  through the identities table. The identity's `provider` is `email` and its `identity_data` carries
  `sub` and `email`.
- **It must be idempotent.** `[db.seed]` also runs on `npx supabase seed`, not only after a wipe, so
  the insert must no-op when the user already exists rather than erroring on the unique constraint.

`auth.users` is Supabase-owned and its columns have changed across GoTrue versions, so the schema
this seed writes is the one assumption most likely to age badly. That is exactly why the phase's
verification is *signing in*, not *selecting the row* — the only trustworthy check is that the
account actually authenticates.

**Scope note**: the file seeds an administrator account and nothing else. Buildings, units and owners
belong to `S-01`, which extends this same file.

#### 2. Cloud account (prerequisite — not created by this repo)

**System**: Production Supabase project (hosted, EU Frankfurt / `eu-central-1` — the project whose
`anon` key is held as the `SUPABASE_URL` / `SUPABASE_KEY` Workers Secrets)

**Intent**: State plainly that the production account is an input to this change, not an output of
it. Nothing here creates it.

**Contract**: `test@test.com` / `Test123!` must already exist in the production project, confirmed.
If it does not, create it via Supabase dashboard → **Authentication → Users → Add user** with
**Auto Confirm User** ticked — the procedure already documented in `README.md`, unchanged by this
plan. Without auto-confirm the account exists and cannot sign in, failing identically to a missing
one.

No script, no seed, and no service_role key touches the production project. Step 3 is the only thing
this phase does against cloud, and it is read-only.

The credentials are deliberately public and already displayed on `/auth/signin` — a recorded,
accepted consequence for a PoC on test data, not an oversight (PRD §Access Control, Open Question
nr 3).

#### 3. Confirm the cloud account authenticates against production

**Target**: `https://estate-manager.estate-manager.workers.dev`

**Intent**: Prove the account works before four phases of work depend on it, and while the code is
still unchanged — so a later failure in Phase 3 cannot be blamed on the account. This step is also
what proves the account was created in the *same* project the live Worker authenticates against:
Workers Secrets are write-only and cannot be read back, so signing in through the Worker is the only
available proof.

**Contract**: `POST /api/auth/signin` on the live Worker with the MVP credentials as **form data,
not JSON** (the auth endpoints take form data and answer with a redirect carrying `?error=`, never a
JSON error body).

Expect `302` to **`/`** at this point, not `/dashboard` — Phase 1 has not yet changed the redirect
target in `src/pages/api/auth/signin.ts:18`. A `302` back to `/auth/signin?error=…` means the
account is missing, unconfirmed, or in the wrong project; the message text comes from Supabase Auth
and distinguishes the cases.

This is a pre-flight check, not the smoke test. The full session round trip is Phase 3, after the
code changes are live.

### Success Criteria:

#### Automated Verification:

- `npx supabase db reset` completes and applies the seed without error
- Against the local stack, signing in with the seeded credentials succeeds — the seed is verified by authentication, not by selecting the row
- Running the seed twice does not error (idempotent)
- Production `/api/health` returns `200 {"status":"ok"}`
- `POST /api/auth/signin` on the live Worker with the MVP credentials returns `302` to `/` and sets a session cookie — this is what proves the account lives in the project the Worker uses
- The same request with a deliberately wrong password still returns `302` to `/auth/signin?error=…` (the negative case remains intact)

#### Manual Verification:

- No service_role key was fetched, exported, or written anywhere by this phase
- The seed file creates an administrator account only — no buildings, units or owners
- The email and password match `/auth/signin`'s on-screen notice character for character

**Implementation Note**: The local seed needs Docker and ~7 GB RAM (`npx supabase start`, per
`CLAUDE.md`). If the local stack cannot be brought up, the seed file still lands but its verification
items stay unchecked — say so rather than marking them done, and note that `S-01` will exercise it
for real. The cloud half is independent and can proceed either way.

---

## Phase 1: Remove the registration path

### Overview

Delete every reachable trace of self-service registration, and point a successful sign-in at the
authenticated surface. After this phase the PRD's "aplikacja nie ma ekranu rejestracji" is literally
true rather than aspirational.

### Changes Required:

#### 1. Registration route and component deletions

**Files**: `src/pages/api/auth/signup.ts`, `src/pages/auth/signup.astro`,
`src/pages/auth/confirm-email.astro`, `src/components/auth/SignUpForm.tsx`

**Intent**: Remove the registration flow entirely. The product decision (PRD §Access Control,
2026-08-01) is that administrator accounts are created in the Supabase dashboard and the app has no
registration screen — these four files are starter leftovers that still work and still contradict it.

**Contract**: Four file deletions. `/auth/signup`, `/auth/confirm-email` and `POST /api/auth/signup`
cease to exist as routes and fall through to Astro's `404` handling. Do **not** delete
`src/components/auth/{FormField,PasswordToggle,SubmitButton,ServerError}.tsx` — `SignInForm.tsx`
imports all four.

#### 2. Internal links to the removed routes

**Files**: `src/components/Topbar.astro`, `src/components/Welcome.astro`

**Intent**: Drop the two links that would otherwise point at dead routes. In `Topbar.astro` the
signed-out branch keeps only "Sign in"; in `Welcome.astro` the call-to-action pair becomes a single
"Sign In" button.

**Contract**: `Topbar.astro:29-32` link removed, leaving the surrounding flex container with one
child. `Welcome.astro:47-52` anchor removed. No other markup changes — restyling the landing page is
out of scope.

#### 3. Post-login destination

**File**: `src/pages/api/auth/signin.ts`

**Intent**: Send a successful sign-in to `/dashboard` rather than `/`, so the administrator lands on
the authenticated surface and the login visibly succeeded.

**Contract**: The success-path redirect target at line 18 changes from `/` to `/dashboard`. The
error paths and the form-data contract are untouched — they keep the
`context.redirect("/auth/signin?error=…")` shape the rest of the auth endpoints use.

#### 4. README route documentation

**File**: `README.md`

**Intent**: Remove the two deleted routes from the auth route table, drop the now-moot "Email
confirmation in local development" section (nothing in the product mails a confirmation link), and
update the product-decision paragraph so it states the removal as done rather than scheduled.

**Contract**: Route table (`README.md:145-151`) loses its `/auth/signup` and `/auth/confirm-email`
rows. The `### Email confirmation in local development` section is removed. The product-decision
paragraph keeps the dashboard procedure — it is the only place the account-creation steps are
written down — and drops the "scheduled for removal in roadmap item `F-01`" clause. The directory
comment at `README.md:64` stops naming the removed pages.

### Success Criteria:

#### Automated Verification:

- `npx astro sync && npm run lint` passes
- `npm run build` passes
- No source references to the removed routes survive: `grep -rn "signup\|confirm-email" src/` returns nothing
- Local `/auth/signup` and `/auth/confirm-email` return `404` under `npm run dev`

#### Manual Verification:

- `/auth/signin` still renders with the dashboard-accounts notice intact
- Signed-out `Topbar` and the landing page show a single sign-in affordance with no broken link
- A local sign-in against the dev Supabase project lands on `/dashboard`

**Implementation Note**: After completing this phase and all automated verification passes, pause
for confirmation that the manual testing succeeded before proceeding.

---

## Phase 2: Assert deploy health in CI

### Overview

Make the deploy workflow consume `/api/health`'s verdict instead of publishing and walking away. A
Worker that cannot reach Supabase — missing secret, rotated key, wrong project — becomes a red run.

### Changes Required:

#### 1. Post-deploy health assertion

**File**: `.github/workflows/deploy.yml`

**Intent**: After `wrangler-action` publishes, probe the live `/api/health` and fail the job on
anything but `200`. This is the only check positioned to catch a missing **Workers Secret**: CI
builds with GitHub secrets, while the running Worker reads platform secrets the build never sees, so
no build-time validation can observe this failure.

**Contract**: A new final step, running only on success of the deploy step. The production URL is
declared once as a workflow-level `env` value rather than inlined, since it is also the Worker's
`*.workers.dev` hostname and must not drift from `wrangler.jsonc`'s `name`.

The retry behaviour is the non-obvious part, so it is pinned here:

```yaml
- name: Verify the deployed Worker can reach Supabase
  run: |
    curl --fail --silent --show-error \
         --retry 5 --retry-delay 5 --retry-all-errors \
         "$HEALTH_URL"
```

`--fail` is what makes a `503` an error at all; without it `curl` exits `0` on any HTTP response.
`--retry-all-errors` is required because a `503` body still counts as a completed transfer — plain
`--retry` would not re-attempt it. Together they absorb edge propagation and a brief Supabase blip,
then fail the job.

#### 2. Document the assertion

**File**: `README.md`

**Intent**: The health-check section already explains why `/api/health` exists; extend it to say the
deploy workflow now enforces it, so the next reader knows a red deploy may mean "Supabase
unreachable" and not "bad code".

**Contract**: One paragraph appended to the existing `## Health check` section, naming the retry
behaviour and the deliberate absence of auto-rollback.

### Success Criteria:

#### Automated Verification:

- `npx astro sync && npm run lint` passes (the workflow change must not break the repo's checks)
- The `deploy.yml` run for this commit completes green **with the new assertion step present and passing** in the Actions log
- Production `/api/health` still returns `200 {"status":"ok"}` after the deploy

#### Manual Verification:

- The assertion step's log shows it actually issued the request (not a skipped or no-op step)
- Reading the step in isolation makes it obvious what a failure would mean

**Implementation Note**: After completing this phase and all automated verification passes, pause
for confirmation that the manual testing succeeded before proceeding.

---

## Phase 3: Verify administrator access on production

### Overview

The phase `F-01` exists for: demonstrate the full session round trip against the live Worker — the
half of the smoke test the deployment runbook records as never having been performed.

### Changes Required:

#### 1. Confirm the Phase 0 prerequisite still holds

**System**: Production Supabase project

**Intent**: Phase 0 created and verified the MVP account. Re-confirm it before interpreting anything
here, so a failed round trip is read as a defect in the deployed code rather than a missing account.

**Contract**: Phase 0's automated checks pass unchanged. If Phase 0 was skipped, stop and do it —
this phase cannot produce a meaningful result without it.

#### 2. Execute the round trip

**Target**: `https://estate-manager.estate-manager.workers.dev`

**Intent**: Prove that cookie-based `@supabase/ssr` sessions work on workerd, not just locally —
this is the part most likely to differ between `astro dev` and production, and it has never run.

**Contract**: Sign in with the MVP credentials → confirm the redirect lands on `/dashboard` →
confirm `/dashboard` renders authenticated with the account's email → sign out → confirm
`/dashboard` redirects to `/auth/signin` again. Also confirm the deleted routes now `404` in
production, which Phase 1 only proved locally.

No repository files change in this phase; its output is a verified result and the record written in
Phase 4.

### Success Criteria:

#### Automated Verification:

- `POST /api/auth/signin` with the MVP credentials returns `302` to `/dashboard` and sets a session cookie (`curl` with a cookie jar)
- `GET /dashboard` with that cookie jar returns `200` and the body contains the account email
- `POST /api/auth/signout` returns `302`, after which `GET /dashboard` returns `302` to `/auth/signin`
- Production `/auth/signup` and `/auth/confirm-email` return `404`

#### Manual Verification:

- The same round trip driven in a browser: sign in, see `/dashboard`, reload it and stay signed in, sign out, get bounced from `/dashboard`
- The sign-in page's notice matches reality — the credentials shown are the ones that work
- No config-status banner appears on any page (secrets are being read)

**Implementation Note**: Blocked on Phase 0 and on Phases 1–2 being live. After completing it, pause
for confirmation before proceeding.

---

## Phase 4: Prove the deploy gate and sync the record

### Overview

Demonstrate that a failing lint stops the deploy, then bring the written record in line with what
Phases 1–3 established. This is the only phase that deliberately produces a red CI run.

### Changes Required:

#### 1. Demonstrate the gate, then revert

**Target**: `.github/workflows/deploy.yml`'s in-job ordering (no permanent file change)

**Intent**: `CLAUDE.md` names the `lint → build → deploy` ordering as the only gate standing in for
branch protection, and flags it as unverified. One push settles it.

**Contract**: Two commits. The first introduces a deliberate, unambiguous lint error in a source
file and **must be committed with `--no-verify`** — lint-staged's `eslint --fix` would otherwise
repair it silently and prove nothing (see Critical Implementation Details). Observe that the
`deploy.yml` run fails at the lint step and that `wrangler deploy` never executes; confirm the live
version is unchanged. The second commit reverts the error and is committed normally.

Expect `ci.yml` to fail on the same commit — that is the same gate working, not a separate problem.

#### 2. Sync the deployment runbook

**File**: `context/changes/deployment/deployment.md`

**Intent**: The runbook's verification tables and outstanding list are the durable record of what
production is known to do; three of their claims are changed by this work.

**Contract**: §"What was verified" — the row asserting `200` for `/auth/signup` is now false and
becomes a `404` claim. §"What was not verified" — the functional smoke entry moves to verified with
its result; the deploy-gate entry moves to verified with the run reference. §Outstanding — items 2
and 3 close. The append-only deployment log gains an entry for this change. Item 4
(`config-status.ts` starter link) and the open residuals table stay untouched.

#### 3. Document the local/cloud account asymmetry

**File**: `README.md`

**Intent**: Phase 0 makes local and cloud deliberately different — seeded automatically in one,
required to pre-exist in the other. Undocumented, that reads as an inconsistency and someone
eventually "fixes" it by scripting production account creation, which is precisely what the
asymmetry exists to prevent.

**Contract**: The local-development section gains the seed: `npx supabase db reset` provisions
`test@test.com` / `Test123!` from `supabase/seed.sql`, no manual step. The existing
product-decision paragraph (edited in Phase 1) states that the **production** account is created by
hand in the dashboard with *Auto Confirm User*, and that no script, seed, or key in this repo
creates users in the production project. Name the reason in one line — a code path that mints
administrators against production has no product justification and is a standing risk to the
owner-data guardrail.

Do **not** change the PRD. §Access Control's decision is untouched: accounts are created directly in
the database, and the app has no self-service registration. Seeding a local throwaway database is
not a change to that decision, and §Non-Goals is unaffected.

#### 4. Sync CLAUDE.md "Current state"

**File**: `CLAUDE.md`

**Intent**: That section is deliberately the only place these facts live, and it now carries three
stale claims: that the deploy gate's negative case is unproven, that `/auth/signup` and
`/auth/confirm-email` are working leftovers awaiting `F-01`, and the implicit assumption that a
green deploy says nothing about whether the app works.

**Contract**: The auto-deploy bullet drops the "not proven" caveat and records the demonstration.
The no-self-service-registration bullet drops the starter-leftovers sentence and states the routes
are gone. A note records that `deploy.yml` now asserts `/api/health` after publishing. The hard rule
about `optional: true` secrets in §Hard rules stays — the vars are still optional and new code must
still handle a `null` client.

#### 5. Mark the roadmap item done

**File**: `context/foundation/roadmap.md`

**Intent**: `F-01`'s status is `ready`; once verified on production it is `done`, and `S-01` becomes
unblocked.

**Contract**: The `F-01` row in §At a glance and the `### F-01` block's `**Status:**` field move to
`done`. Per the file's own note, the §Done section is `/10x-archive`'s to write — leave it alone.

### Success Criteria:

#### Automated Verification:

- The deliberate-error commit produces a `deploy.yml` run that fails at `npm run lint`, with no `wrangler deploy` step executed
- Production `/api/health` still returns `200` during the red run (the live version was untouched)
- The revert commit produces a green `deploy.yml` run including the Phase 2 health assertion
- `npx astro sync && npm run lint && npm run build` pass on the reverted tree

#### Manual Verification:

- The failed run's log confirms the deploy step is marked skipped, not failed-after-attempting
- The runbook, `CLAUDE.md` §Current state, and the roadmap contain no claim contradicted by the four phases
- A reader who knows nothing of this change can tell from `CLAUDE.md` alone what production is verified to do

---

## Testing Strategy

There is no test runner in this repository — no `npm test`, no framework, no test files
(`CLAUDE.md`). Verification is lint, build, `curl`, and reading CI logs. Nothing in this plan should
be reported as "tests passed".

### Static verification:

- `npx astro sync && npm run lint && npm run build` after each code-touching phase. The `astro sync`
  is not optional — ESLint runs `strictTypeChecked` with `projectService` and needs generated types.
- `grep` for references to deleted routes, as the deletions span pages, an endpoint, a component and
  two markup files.

### Production verification:

- `/api/health` → `200` after each deploy (Phase 2 automates this in CI).
- Session round trip with a `curl` cookie jar, then repeated in a browser (Phase 3).
- Deleted routes → `404` on the live Worker.

### Negative-case verification:

- A deliberate lint error must fail `deploy.yml` before `wrangler deploy` (Phase 4). This is the one
  test in the plan whose *failure to fail* is the finding.

### Manual testing steps:

1. Sign in at `https://estate-manager.estate-manager.workers.dev/auth/signin` with the MVP account.
2. Confirm the landing page is `/dashboard` and shows the account email.
3. Reload `/dashboard` — the session must survive.
4. Sign out; confirm `/dashboard` bounces to `/auth/signin`.
5. Visit `/auth/signup` — expect `404`.
6. Confirm no config-status banner is present on any page.

## Performance Considerations

None. The only hot-path change is a redirect target string. The health assertion runs in CI, not in
the request path.

## Migration Notes

No data, no schema — the data layer is still empty. The only migration-shaped concern is that
`/auth/signup` has answered `200` on production since the first deploy, so any bookmark to it will
start returning `404`. Accepted deliberately: the product has no registration, and a `404` says so
more honestly than a tombstone redirect.

Rollback is `wrangler rollback` to a prior version — but note the runbook's warning that
`d411e297-ac61-476e-b060-bb3ae4df0ca5` predates the secrets and must never be a rollback target.

## References

- Roadmap item: `context/foundation/roadmap.md` → `F-01`
- Product decision: `context/foundation/prd.md` → `## Access Control`, `## Non-Goals`, `## Open Questions` nr 3
- Deployment record: `context/changes/deployment/deployment.md` → "What was not verified", "Outstanding"
- Prior commit landing the sign-in notice: `b1a9e6f`
- Recurring rule (commit straight to `main`): `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 0: Create the MVP administrator account

#### Automated

- [ ] 0.1 `npx supabase db reset` applies `supabase/seed.sql` without error
- [ ] 0.2 Sign-in against the local stack with the seeded credentials succeeds
- [ ] 0.3 Running the seed twice does not error (idempotent)
- [x] 0.4 Production `/api/health` returns `200 {"status":"ok"}` — 2bcc3aa
- [x] 0.5 `POST /api/auth/signin` on the live Worker returns `302` to `/` and sets a session cookie — 2bcc3aa
- [x] 0.6 A wrong password still returns `302` to `/auth/signin?error=…` — 2bcc3aa

> 0.1–0.3 are **blocked, not failed**: Docker is not installed on this machine (`docker` not on
> PATH, no Docker.app / OrbStack), so `npx supabase start` cannot bring up the local stack. Per the
> phase's Implementation Note the seed file lands unexercised; `S-01` brings the first real local
> database and will exercise it. Re-run these three once Docker is available.
>
> Also recorded during 0.5: Astro's `security.checkOrigin` rejects a form POST without an `Origin`
> header with `403 Cross-site POST form submissions are forbidden`. Every `curl` against
> `/api/auth/*` — including Phase 3's — must send
> `-H "Origin: https://estate-manager.estate-manager.workers.dev"`.

#### Manual

- [x] 0.7 No service_role key fetched, exported or written by this phase — 2bcc3aa
- [x] 0.8 Seed creates an administrator account only — no buildings, units or owners — 2bcc3aa
- [x] 0.9 Credentials match `/auth/signin`'s on-screen notice character for character — 2bcc3aa

### Phase 1: Remove the registration path

#### Automated

- [x] 1.1 `npx astro sync && npm run lint` passes — 2287893
- [x] 1.2 `npm run build` passes — 2287893
- [x] 1.3 `grep -rn "signup\|confirm-email" src/` returns nothing — 2287893
- [x] 1.4 Local `/auth/signup` and `/auth/confirm-email` return `404` — 2287893

#### Manual

- [x] 1.5 `/auth/signin` renders with the dashboard-accounts notice intact — 2287893
- [x] 1.6 Signed-out Topbar and landing page show one sign-in affordance, no broken link — 2287893
- [x] 1.7 Local sign-in lands on `/dashboard` — 2287893

### Phase 2: Assert deploy health in CI

#### Automated

- [x] 2.1 `npx astro sync && npm run lint` passes — 1d099cc
- [x] 2.2 `deploy.yml` run completes green with the assertion step present and passing — 1d099cc
- [x] 2.3 Production `/api/health` returns `200 {"status":"ok"}` after the deploy — 1d099cc

#### Manual

- [x] 2.4 Assertion step log shows the request was actually issued — 1d099cc
- [x] 2.5 The step reads clearly enough that a failure's meaning is obvious — 1d099cc

### Phase 3: Verify administrator access on production

#### Automated

- [x] 3.1 `POST /api/auth/signin` with MVP credentials returns `302` to `/dashboard` and sets a session cookie
- [x] 3.2 `GET /dashboard` with that cookie returns `200` containing the account email
- [x] 3.3 `POST /api/auth/signout` returns `302`, after which `/dashboard` returns `302` to `/auth/signin`
- [x] 3.4 Production `/auth/signup` and `/auth/confirm-email` return `404`

> Round trip executed 2026-08-01 against `https://estate-manager.estate-manager.workers.dev`
> with a `curl` cookie jar and `-H "Origin: <base>"` (Phase 0's `checkOrigin` finding):
> `POST /api/auth/signin` → `302 /dashboard` + `sb-…-auth-token` cookie; `GET /dashboard` → `200`
> containing `test@test.com`; a second `GET /dashboard` on the same jar → `200` (session survives);
> `POST /api/auth/signout` → `302 /`; `GET /dashboard` → `302 /auth/signin`. `/api/health` → `200`,
> `/auth/signup` and `/auth/confirm-email` → `404`. This is the smoke test the deployment runbook
> records as never having been performed — Phase 4 writes it into the runbook.

#### Manual

- [x] 3.5 Browser round trip: sign in, `/dashboard`, reload stays signed in, sign out, bounced
- [x] 3.6 Sign-in page notice matches the credentials that actually work
- [x] 3.7 No config-status banner on any page

### Phase 4: Prove the deploy gate and sync the record

#### Automated

- [ ] 4.1 Deliberate-error commit fails `deploy.yml` at lint with no `wrangler deploy` executed
- [ ] 4.2 Production `/api/health` still returns `200` during the red run
- [ ] 4.3 Revert commit produces a green `deploy.yml` run including the health assertion
- [ ] 4.4 `npx astro sync && npm run lint && npm run build` pass on the reverted tree

#### Manual

- [ ] 4.5 Failed run's log confirms the deploy step was skipped, not failed-after-attempting
- [ ] 4.6 Runbook, `CLAUDE.md` §Current state and roadmap contain no contradicted claim
- [ ] 4.7 README documents the local seed and states that nothing in the repo creates production users
- [ ] 4.8 `CLAUDE.md` alone tells a new reader what production is verified to do
