# EstateManager

Głosowanie nad uchwałami wspólnoty mieszkaniowej z wagą według udziałów — bez zebrania i bez zbierania podpisów po mieszkaniach.

Wymagania produktowe i reguły domenowe: [`context/foundation/prd.md`](./context/foundation/prd.md).

## Tech Stack

- [Astro](https://astro.build/) v6 - Modern web framework with server-first rendering
- [React](https://react.dev/) v19 - UI library for interactive components
- [TypeScript](https://www.typescriptlang.org/) v5 - Type-safe JavaScript
- [Tailwind CSS](https://tailwindcss.com/) v4 - Utility-first CSS framework
- [Supabase](https://supabase.com/) - Authentication and backend-as-a-service
- [Cloudflare Workers](https://workers.cloudflare.com/) - Edge deployment runtime

## Prerequisites

- Node.js v22.14.0 (as specified in `.nvmrc`)
- npm (comes with Node.js)

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

## Available Scripts

- `npm run dev` - Start development server (Cloudflare workerd runtime)
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint with type-checked rules
- `npm run lint:fix` - Auto-fix ESLint issues
- `npm run format` - Run Prettier

On a fresh clone run `npx astro sync` before `npm run lint` — the type-checked rules need Astro's generated types.

## Project Structure

```md
.
├── src/
│ ├── layouts/ # Astro layouts
│ ├── pages/ # Astro pages
│ │ ├── api/ # API endpoints
│ │ └── auth/ # Sign-in / sign-up / confirm-email pages
│ ├── components/ # UI components (Astro & React)
│ │ ├── auth/ # Auth form islands (React)
│ │ └── ui/ # shadcn/ui components
│ ├── lib/ # Supabase client, helpers
│ ├── styles/ # Global Tailwind styles
│ └── middleware.ts # Session resolution + route protection
├── supabase/ # Local Supabase config, migrations
├── context/ # Product docs (PRD, tech stack, infrastructure)
├── public/ # Public assets
├── wrangler.jsonc # Cloudflare Workers config
```

## Supabase Configuration

This project uses [Supabase](https://supabase.com/) for authentication. Environment variables are declared via Astro's `astro:env` schema and are treated as **server-only secrets** — they are never exposed to the client.

### First-time setup (local, no cloud project needed)

Requires [Docker](https://www.docker.com/) and ~7 GB RAM.

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

4. To stop the stack when done:

```bash
npx supabase stop
```

The local Studio UI is available at `http://localhost:54323`.

Authentication itself needs no tables — it uses Supabase Auth's built-in `auth.users`. Domain tables for EstateManager go in `supabase/migrations/`, named `YYYYMMDDHHmmss_short_description.sql`, with RLS enabled on every table.

### Using a cloud Supabase project instead

If you prefer to use a hosted Supabase project, add these variables to your `.env` and `.dev.vars` files:

| Variable       | Description                                                |
| -------------- | ---------------------------------------------------------- |
| `SUPABASE_URL` | Project URL from Supabase dashboard → Settings → API       |
| `SUPABASE_KEY` | `anon` public key from Supabase dashboard → Settings → API |

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_KEY=<anon-key>
```

Two constraints on the hosted project, both load-bearing:

- **Region must be EU (Frankfurt / `eu-central-1`).** Worker compute location cannot be pinned below an Enterprise plan, so where the data lives is the only residency lever this architecture has. The region is immutable after project creation — getting it wrong means recreating the project and re-issuing every credential.
- **Use the `anon` key, never the service-role key.** A service-role key bypasses Row Level Security entirely, on an app whose guardrail is that owners' data never leaves their building.

### Email confirmation in local development

By default Supabase requires email confirmation before a user can sign in. To skip this during local development:

1. Open the Supabase dashboard for your project
2. Go to **Authentication → Email → Confirm email**
3. Toggle it **off**

Users can then sign in immediately after sign-up without clicking a confirmation link.

### Auth routes

| Route                 | Description                                                             |
| --------------------- | ----------------------------------------------------------------------- |
| `/auth/signin`        | Email/password sign-in form                                             |
| `/auth/signup`        | Email/password sign-up form                                             |
| `/auth/confirm-email` | Post-signup "check your inbox" page                                     |
| `/dashboard`          | Example protected page (redirects to `/auth/signin` if unauthenticated) |

Route protection is handled in `src/middleware.ts`. Add paths to the `PROTECTED_ROUTES` array there to require authentication.

**Product decision (2026-08-01):** administrator accounts are created **directly in the database, through the Supabase dashboard** — the product has no self-service registration (`context/foundation/prd.md` §Access Control). To add one: Supabase dashboard → **Authentication → Users → Add user**, enter email and password, and tick *Auto Confirm User* so the account can sign in without a confirmation mail. For the MVP the database holds `test@test.com` with password `Test123!`, and `/auth/signin` states both facts on screen. `/auth/signup` and `/auth/confirm-email` are starter leftovers scheduled for removal in roadmap item `F-01`; do not build on them.

## Health check

`GET /api/health` reports whether the running Worker can actually reach Supabase. It is unauthenticated and deliberately excluded from `PROTECTED_ROUTES` — it has to answer before auth works.

| Response | Meaning |
| --- | --- |
| `200 {"status":"ok"}` | Credentials present and Supabase answered its `/auth/v1/health` probe |
| `503 {"status":"misconfigured","supabase":"missing-credentials"}` | One or both env vars are unset |
| `503 {"status":"degraded","supabase":"unreachable"}` | Credentials present but Supabase did not answer — covers a **rotated or revoked key**, which a presence check alone would miss |

This exists because both Supabase vars are `optional: true` in `astro.config.mjs`. That is intentional — it lets local dev and preview builds degrade to the config-status banner instead of failing — but it also means a production deploy can go green while the app is non-functional. This route is what makes that condition loud. The endpoint never echoes the URL or the key.

## Deployment

Production runs on [Cloudflare Workers](https://workers.cloudflare.com/) as the Worker named `estate-manager`.

Deployment is automatic: every push to `main` runs `.github/workflows/deploy.yml`, which does `npm ci → astro sync → lint → build` and only then `wrangler deploy`. Any failing step fails the job and nothing ships — that in-job sequence *is* the gate, since branch protection would not cover direct pushes.

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
