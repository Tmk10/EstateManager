# EstateManager

Głosowanie nad uchwałami wspólnoty mieszkaniowej z wagą według udziałów — bez zebrania i bez zbierania podpisów po mieszkaniach.

Wymagania produktowe i reguły domenowe: [`context/foundation/prd.md`](./context/foundation/prd.md).

## Never do this

Each of these is irreversible or reaches production. They are stated in full in the sections linked beside them.

- **Never commit `"remote": true`** on the `send_email` binding — it makes local dev send real mail. Check `git diff wrangler.jsonc` before committing. → [Sending from local dev](#sending-from-local-dev)
- **Never `npx supabase db push --include-seed`** — the seed mints an administrator account, and against production that is the one code path this project refuses to have. → [Applying migrations to production](#applying-migrations-to-production)
- **Never `npx supabase db push --include-all`** — it pushes everything missing from the remote history table, which is not what you just read in the dry run. → [Applying migrations to production](#applying-migrations-to-production)
- **Never use the service-role key**, only the `anon` key — service-role bypasses Row Level Security entirely, on an app whose guardrail is that owners' data never leaves their building. → [Using a cloud Supabase project instead](#using-a-cloud-supabase-project-instead)
- **Never run `npx wrangler email routing enable`** — inbound routing on the root domain makes it receive *all* mail addressed to it. This project only sends. → [Transactional email · one-time setup](#one-time-setup-manual-not-automated-here)

Built on [Astro](https://astro.build/) (`output: "server"` — every route is server-rendered), [React](https://react.dev/) islands, TypeScript, [Tailwind](https://tailwindcss.com/), [Supabase](https://supabase.com/) for auth and Postgres, and [Cloudflare Workers](https://workers.cloudflare.com/) for hosting. Versions are in [`package.json`](./package.json); the Node version is in [`.nvmrc`](./.nvmrc) and CI holds you to it.

## Getting Started

1. Install dependencies:

```bash
npm install
```

2. Set up Supabase and configure environment variables — see [Supabase Configuration](#supabase-configuration) below.

3. Create a `.dev.vars` file for local Cloudflare dev secrets:

```bash
cp .env.example .dev.vars
```

4. Run the development server:

```bash
npm run dev
```

Without Supabase credentials the app still builds and runs, but authentication is disabled and a banner says so — the env vars are declared `optional` in `astro.config.mjs`.

## Scripts and layout

The script list lives in [`package.json`](./package.json) and the layout is `src/` — neither is copied here, because both copies had drifted before anyone noticed. Two things `package.json` does not tell you:

- On a fresh clone run `npx astro sync` before `npm run lint` — the type-checked rules need Astro's generated types.
- `src/middleware.ts` resolves the session and gates protected routes — a new page is not protected until its path is added to the `PROTECTED_ROUTES` array there.

## Supabase Configuration

This project uses [Supabase](https://supabase.com/) for authentication. Environment variables are declared via Astro's `astro:env` schema and are treated as **server-only secrets** — they are never exposed to the client.

### First-time setup (local, no cloud project needed)

Requires [Docker](https://www.docker.com/) and ~7 GB RAM. Docker is a **real prerequisite** now, not an optional convenience: the schema lives in `supabase/migrations/` and `npm run db:types` reads it from the running local stack.

If `supabase` cannot reach the Docker daemon, it is usually looking in the wrong place. Docker Desktop on macOS puts its socket at `~/.docker/run/docker.sock` and creates `/var/run/docker.sock` only when *Settings → Advanced → Allow the default Docker socket* is enabled. Either turn that on once, or prefix commands:

```bash
export DOCKER_HOST="unix://$HOME/.docker/run/docker.sock"
```

The `docker` CLI itself ships inside the app bundle (`/Applications/Docker.app/Contents/Resources/bin`) and is not always on `PATH`.

1. Create your `.env` file:

```bash
cp .env.example .env
```

2. Start the local stack (downloads Docker images on first run; `supabase/config.toml` is already committed):

```bash
npx supabase start
```

3. Copy the credentials printed by the CLI into your `.env` and `.dev.vars`:

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_KEY=<anon key from CLI output>
```

4. Provision the local administrator account:

```bash
npx supabase db reset
```

This applies every migration in `supabase/migrations/`, then `supabase/seed.sql`, which creates `test@test.com` / `Test123!` — the same credentials `/auth/signin` shows on screen — already confirmed and ready to sign in, plus one demo building so `/buildings` is not empty. There is no manual step, and re-running it is safe: every insert in the seed is idempotent.

Note that `npx supabase seed` does **not** replay `seed.sql` — that command only exposes a `buckets` subcommand. To re-run the seed without wiping the database, pipe it in yourself:

```bash
docker exec -i supabase_db_estate-manager psql -U postgres -d postgres < supabase/seed.sql
```

5. After changing the schema, regenerate the committed database types:

```bash
npm run db:types
```

`src/db/database.types.ts` is generated output. Commit it in the **same commit** as the migration that changed the schema — nothing in CI regenerates it, so a stale file means CI type-checks against a schema that no longer exists.

6. To stop the stack when done:

```bash
npx supabase stop
```

The local Studio UI is available at `http://localhost:54323`.

### Local and production create accounts differently — on purpose

Local data is disposable and wants zero friction, so the seed above creates the administrator automatically. **Nothing in this repository creates users in the production Supabase project** — no script, no seed, and no service-role key. A production account is a manual prerequisite, made by hand in the dashboard (see [Auth routes](#auth-routes) below).

That asymmetry is deliberate, not an inconsistency waiting to be tidied up. A code path capable of minting administrators against production has no product justification — every account in the database is a full administrator with sight of the registry and of owners' contact details — and it is a standing risk to the guardrail that owners' data never leaves their building. Do not "fix" this by scripting production account creation.

The two environments also behave differently underneath: `supabase/config.toml` sets `enable_confirmations = false` locally, so a seeded user can sign in immediately, while the hosted project reports `mailer_autoconfirm: false` — an account created there without an explicit confirmation flag lands unconfirmed and cannot sign in. That is what the dashboard's *Auto Confirm User* tickbox overrides.

Authentication itself needs no tables — it uses Supabase Auth's built-in `auth.users`. Domain tables for EstateManager go in `supabase/migrations/`, named `YYYYMMDDHHmmss_short_description.sql`, with RLS enabled on every table.

### Applying migrations to production

**No pipeline does this.** `deploy.yml` never invokes the `supabase` CLI and no service-role credential exists in CI, so a migration committed to the repo is not applied by pushing it. Applying it is a deliberate manual step:

```bash
npx supabase login                                  # once, browser flow
npx supabase link --project-ref <ref>               # once per checkout
npx supabase db push --dry-run                      # read every line of this
npx supabase db push
```

Three rules, each of which has a reason rather than a preference behind it:

- **Schema first, then code.** Push the migration, confirm it landed with `npx supabase migration list --linked` — the timestamp must appear in the **Remote** column, not only in Local — and only then push to `main`. Reversed, the deploy puts live code in front of a table that does not exist yet.
- **Never `--include-seed`.** The seed mints an administrator account; against production that is exactly the code path this project refuses to have (see the section above).
- **Never `--include-all`.** It pushes everything missing from the remote history table, which is not necessarily what you just reviewed in the dry run.

It is forward-only. `wrangler rollback` reverts code, never schema, so undoing a migration means writing the reversal by hand. Verify afterwards that the two schemas agree:

```bash
npx supabase gen types typescript --linked --schema public
```

Compare against the committed `src/db/database.types.ts`; they should differ only by a `__InternalSupabase` PostgREST-version block, which the remote generator emits and the local one does not.

### Using a cloud Supabase project instead

If you prefer to use a hosted Supabase project, add these variables to your `.env` and `.dev.vars` files:

| Variable       | Description                                                |
| -------------- | ---------------------------------------------------------- |
| `SUPABASE_URL` | Project URL from Supabase dashboard → Settings → API       |
| `SUPABASE_KEY` | `anon` public key from Supabase dashboard → Settings → API |

Two constraints on the hosted project, both load-bearing:

- **Region must be EU (Frankfurt / `eu-central-1`).** Worker compute location cannot be pinned below an Enterprise plan, so where the data lives is the only residency lever this architecture has. The region is immutable after project creation — getting it wrong means recreating the project and re-issuing every credential.
- **Use the `anon` key, never the service-role key.** A service-role key bypasses Row Level Security entirely, on an app whose guardrail is that owners' data never leaves their building.

### Auth routes

| Route          | Description                                                             |
| -------------- | ----------------------------------------------------------------------- |
| `/auth/signin` | Email/password sign-in form; a successful sign-in lands on `/dashboard` |
| `/dashboard`   | Example protected page (redirects to `/auth/signin` if unauthenticated) |

Route protection is handled in `src/middleware.ts`. Add paths to the `PROTECTED_ROUTES` array there to require authentication.

**Product decision (2026-08-01):** administrator accounts are created **directly in the database, through the Supabase dashboard** — the product has no self-service registration (`context/foundation/prd.md` §Access Control). To add one: Supabase dashboard → **Authentication → Users → Add user**, enter email and password, and tick *Auto Confirm User* so the account can sign in without a confirmation mail. Without that tick the account exists and cannot sign in, which fails identically to a missing one. For the MVP the database holds `test@test.com` with password `Test123!`, and `/auth/signin` states both facts on screen. The app has no registration screen: `/auth/signup`, `/auth/confirm-email` and `POST /api/auth/signup` were removed in roadmap item `F-01` and now return `404`.

This dashboard procedure is the **only** way a production account comes into existence — see [Local and production create accounts differently](#local-and-production-create-accounts-differently--on-purpose). Locally, `npx supabase db reset` does it for you.

## Health check

`GET /api/health` reports whether the running Worker can actually reach Supabase. It is unauthenticated and deliberately excluded from `PROTECTED_ROUTES` — it has to answer before auth works.

| Response | Meaning |
| --- | --- |
| `200 {"status":"ok","email":"ok"}` | Credentials present, Supabase answered its `/auth/v1/health` probe, and the `EMAIL` binding resolves |
| `200 {"status":"ok","email":"missing"}` | Supabase is fine but the `EMAIL` binding is absent — the app is up and **cannot send mail**. Informational: this does **not** fail the deploy (see [Transactional email](#transactional-email)) |
| `503 {"status":"misconfigured","supabase":"missing-credentials"}` | One or both env vars are unset |
| `503 {"status":"degraded","supabase":"unreachable"}` | Credentials present but Supabase did not answer — covers a **rotated or revoked key**, which a presence check alone would miss |

This exists because both Supabase vars are `optional: true` in `astro.config.mjs`. That is intentional — it lets local dev and preview builds degrade to the config-status banner instead of failing — but it also means a production deploy can go green while the app is non-functional. This route is what makes that condition loud. The endpoint never echoes the URL or the key.

`deploy.yml` now enforces it: after `wrangler deploy` publishes, a final step curls this endpoint and fails the job on anything but `200`, retrying up to 5 times at 5-second intervals so edge propagation or a brief Supabase blip does not redden an otherwise good deploy. Because `503` means *either* "missing credentials" *or* "Supabase unreachable" — the endpoint cannot distinguish them without leaking the URL or key — a red run needs a human to interpret. There is deliberately **no auto-rollback**: the probe cannot tell a bad deploy from a dependency outage, so rollback stays a manual `wrangler rollback` (mind the warning in the deployment runbook about which versions are safe targets).

## Transactional email

Mail is sent through **Cloudflare Email Service** using the native Workers `send_email` binding — there is no API key and no secret to rotate. **No module other than `src/lib/email.ts` may import `cloudflare:workers`** — reach the binding through that module. Check with `grep -rn 'from "cloudflare:workers"' src/`; it must return exactly one line, in `src/lib/email.ts`. (Match the import, not the bare string — four other modules mention it in comments explaining why they don't import it.)

> On Astro 6 with `@astrojs/cloudflare` 13, `Astro.locals.runtime.env` **no longer exists**. Bindings come from `import { env } from "cloudflare:workers"`. Tutorials showing the old accessor are wrong for this repo.

### One-time setup (manual, not automated here)

Like the Supabase dashboard procedure above, none of this is scripted. Each step blocks the next.

1. **Workers Paid plan** ($5/mo). Email Sending is unavailable on Workers Free.
2. **A domain you own, on Cloudflare DNS.** `workers.dev` is not a candidate, and Cloudflare has **no provider test domain** — this project uses `estatemanager.dev`.
3. **Onboard the domain for sending.** Cloudflare adds the SPF and DKIM records itself for a zone it already hosts; propagation is typically 5–15 minutes.

   ```bash
   npx wrangler email sending enable <domain>
   npx wrangler email sending list             # confirm it is listed and enabled
   npx wrangler email sending dns get <domain> # verify SPF + DKIM landed
   ```

4. **Do not run `wrangler email routing enable`.** Inbound routing on the root domain makes it receive *all* mail addressed to it. This project only sends.

The daily quota is **200 messages/day**. It is not settable and `wrangler` does not report it — read it in the dashboard under **Compute & AI → Email Service → Email Sending**.

### The binding

The binding is declared in [`wrangler.jsonc`](./wrangler.jsonc) — read its current shape there, not from a copy in this file. Two properties are load-bearing: it is named `EMAIL`, which is the name `src/lib/email.ts` reaches for, and `allowed_sender_addresses` is locked to the single sending identity, so a send from any other address fails at the binding instead of reaching an owner from a wrong `From`.

**After any `wrangler.jsonc` change, regenerate the types and commit them in the same commit:**

```bash
npx wrangler types && npx astro sync && npm run lint && npm run build
```

`worker-configuration.d.ts` is committed because CI runs `astro sync` but **never** `wrangler types` — the committed file is CI's only source of binding types. If it drifts, local lint stays green while CI types the binding wrongly.

### Sending a test message

`POST /api/email/test` sends one fixed Polish test message to a recipient you supply. It is protected by `PROTECTED_ROUTES` and stays in the repo as a live smoke test — Email Service is a **beta** API, so re-verifying after a deploy is worth the endpoint.

```bash
BASE=https://estate-manager.estate-manager.workers.dev

curl -s -c cookies.txt -X POST "$BASE/api/auth/signin" -H "Origin: $BASE" \
  -d "email=test@test.com" -d "password=Test123!"

curl -s -b cookies.txt -X POST "$BASE/api/email/test" -H "Origin: $BASE" \
  -d "to=<an inbox you control>"
# → {"status":"sent","messageId":"<…@estatemanager.dev>"}
```

> **The `-H "Origin: $BASE"` above is required, not decoration** — on `/api/auth/signin` too. Why it fails the way it does is in `CLAUDE.md`.

Responses: `200 {"status":"sent","messageId":"…"}`, `400 {"status":"error","error":"missing-recipient"}`, `502 {"status":"error","code":"E_…","message":"…"}`.

### Sending from local dev

Add one key to the `send_email` binding in `wrangler.jsonc` and run `npm run dev`:

```jsonc
// wrangler.jsonc → send_email[0] — add this key, change nothing else:
"remote": true
```

**This sends real mail** — use only inboxes you control, and **never commit the flag**. Check `git diff wrangler.jsonc` before committing. Note what a passing local run does and does not prove: it proves the account and domain, not that the *deployed* Worker resolves the binding. Only a production send proves that.

### When the binding is missing

A binding absent from `wrangler.jsonc` is `undefined` at runtime and does **not** throw at deploy time. Two surfaces make that visible: the config-status banner on every page, and `"email":"missing"` in `/api/health`. Neither fails the deploy — `deploy.yml`'s `curl --fail` still passes, deliberately, so a beta channel cannot block shipping the rest of the app.

**That decision is now overdue for revisit, and this is the open question, not a settled position.** It was argued for a channel nothing depended on. Since `S-04` (2026-08-04) the voting-link fanout mails every owner their own link, so a missing binding no longer means "a smoke-test endpoint is down" — it means a building full of owners never receives a ballot, while the deploy reports green. The failure mode was demonstrated on production the same day: with the binding removed, `/api/health` returned `200 {"status":"ok","email":"missing"}` and every owner recorded `E_BINDING_MISSING`. Revisiting means deciding whether `email:"missing"` should return `503` and fail `deploy.yml`.

Also note the propagation lag seen that day: `/api/health` kept reporting the previous binding state for ~15 s after a deploy. Retry before believing it.

## Deployment

Production runs on [Cloudflare Workers](https://workers.cloudflare.com/) as the Worker named `estate-manager`.

Deployment is automatic: every push to `main` runs `.github/workflows/deploy.yml`, which does `npm ci → astro sync → lint → build` and only then `wrangler deploy`. Any failing step fails the job and nothing ships. That in-job ordering was demonstrated on 2026-08-01 with a deliberate lint error: the job stopped at `npm run lint` with build, deploy and the health assertion all skipped.

**`deploy.yml` is not the only way code reaches production, so do not read the above as a gate.** The Cloudflare dashboard is connected to this GitHub repo directly (Workers Builds, GitHub App `cloudflare-workers-and-pages`) — configuration that exists in neither `.github/workflows/` nor `wrangler.jsonc`, so nothing in a checkout hints at it. It builds and deploys on every push to `main`, independently, and **it does not run `npm run lint`**: on the commit carrying that deliberate lint error, `deploy.yml` failed and `Workers Builds: estate-manager` reported success. Which of the two ends up serving traffic is a race — both have landed last on different days. Tell them apart by author in `npx wrangler deployments list`: `deploy.yml` lands with an empty author, Workers Builds under the account owner's e-mail. Full evidence in the [deployment runbook](./context/changes/deployment/deployment.md).

Manual deploy, rarely needed:

```bash
npm run build
npx wrangler deploy
```

Secrets live in the Workers platform, not in the repo and not in the workflow:

```bash
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_KEY
```

They are write-only — there is no read-back, ever. After deploying, confirm `/api/health` returns `200`; a `503` means the secrets did not land.

Rollback:

```bash
npx wrangler versions list
npx wrangler rollback <version-id>
```

This reverts **code only** — database migrations are not covered.

The full runbook — prerequisites, current state, and the deployment log — is [`context/changes/deployment/deployment.md`](./context/changes/deployment/deployment.md).

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs lint + build on every push and PR to `main`. Configure `SUPABASE_URL` and `SUPABASE_KEY` as repository secrets in GitHub for the build step.

## License

MIT
