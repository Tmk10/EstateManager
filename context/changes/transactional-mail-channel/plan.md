# Transactional Mail Channel (`F-02`) — Implementation Plan

## Overview

Connect Cloudflare Email Service through the native Workers `send_email` binding and prove
that **one real message leaves the deployed Worker**, sent from a domain we own, and arrives
in an inbox we control.

This is a foundation, not a slice. Its whole value is removing the unknown that could make
`S-04` (`voting-link-email-fanout`) unbuildable: whether this runtime can send mail at all,
and through which interface. Scope is deliberately one message — not a fanout.

The provider decision is already made and is not reopened here: `research.md` (decision
record) and `docs-cloudflare-email.md` (API reference, retrieved later and authoritative
where the two overlap).

## Current State Analysis

**What exists.** The app is deployed and live at
`https://estate-manager.estate-manager.workers.dev` on Workers **Free**. `wrangler.jsonc`
declares `assets`, `kv_namespaces` (`SESSION`) and `observability` — no `send_email`.
`src/lib/config-status.ts` has exactly one entry (Supabase) and feeds a banner through
`src/layouts/Layout.astro:23`. `src/pages/api/health.ts` probes Supabase and returns
`200 {"status":"ok"}` or `503`; `.github/workflows/deploy.yml` curls it with `--fail` as the
final deploy step.

**What is missing, and what it costs.**

- **No mail of any kind.** No provider account, no domain onboarded for sending, no binding.
- **`worker-configuration.d.ts` does not exist.** `npx wrangler types` has never been run in
  this repo. `SESSION` and `ASSETS` have survived without generated types because nothing
  reads them; `EMAIL` is the first binding that will be called, so this change is the one
  that introduces the file.
- **We are on Workers Free.** Email Sending is unavailable there. `infrastructure.md` argues
  independently for Paid because of the 10 ms CPU ceiling, so the $5/mo is not attributable
  to email alone — but this change is what actually spends it.
- **No sending domain is onboarded.** Cloudflare Email Service has no provider test domain.
  The domain is bought (confirmed 2026-08-01); it still has to be enabled for sending.

**Key constraints discovered.**

- `nodejs_compat` on workerd ships `net`/`tls` as throwing stubs, so SMTP is structurally
  ruled out. A binding or an HTTP API are the only available shapes (`infrastructure.md` §D2).
- Astro 6 + `@astrojs/cloudflare` 13 **removed** `Astro.locals.runtime.env`. Bindings come
  from `import { env } from "cloudflare:workers"` (`docs-cloudflare-email.md` §3). Every
  tutorial showing the old accessor is wrong for this repo.
- `src/middleware.ts`'s `PROTECTED_ROUTES` is the only auth gate, matched with `startsWith`.
- Type-aware ESLint with `projectService` means a changed `wrangler.jsonc` requires
  `npx wrangler types && npx astro sync` before `npm run lint` will tell the truth.

## Desired End State

A signed-in administrator can fire `POST /api/email/test` against the **deployed** Worker and
a Polish test message, sent from `glosowanie@<domain>`, arrives in a real inbox. The endpoint
returns the Cloudflare `messageId`. `src/lib/email.ts` exists as the helper `S-04` will
import. A missing or misnamed binding is visible in two places — the config-status banner and
an `email` field in `/api/health` — without failing the deploy.

**How to verify:** the production curl round trip in Phase 4 returns `200` with a `messageId`,
the message is in the inbox, and the `messageId` is recorded in `change.md`.

### Key Discoveries

- `src/lib/config-status.ts:11` computes `configStatuses` at **module scope** from
  `astro:env/server` values. A binding check cannot safely join it in that form — see
  *Critical Implementation Details*.
- `src/pages/api/health.ts:16` has a `json(body: Record<string, string>, status)` helper; an
  `email` field fits its existing shape with no signature change.
- `src/middleware.ts:19` matches with `startsWith`, so registering `/api/email` protects
  `/api/email/test` and anything added later under it.
- `.github/workflows/deploy.yml` runs `npx astro sync` but **never** `npx wrangler types` —
  the committed `worker-configuration.d.ts` is CI's only source of binding types.
- `deploy.yml`'s health curl uses `--fail`, so anything non-2xx fails the deploy. This is why
  the `email` field must be reported inside a `200` body rather than flipping the status code
  (decision below).
- The repo's auth endpoints take **form data** and reply with `context.redirect()`; `/api/health`
  replies with JSON. The new endpoint follows `/api/health`, not the auth endpoints — it is a
  diagnostic fired by `curl`, not a browser form flow.

## What We're NOT Doing

- **Not building a fanout.** One message. `S-04` owns sending to a building.
- **Not probing the subrequest limit.** Whether ~70 sequential `EMAIL.send()` calls fit one
  Worker invocation stays open and is `S-04`'s first task. Answering it here would burn most
  of a day's ceiling and turn a foundation into load testing.
- **Not building retry/backoff or an error-code classification table.** A single send
  exercises at most one code; a table shipped unproven is how wrong mappings reach production.
  `S-04` builds it against a real fanout.
- **Not tuning deliverability.** SPF/DKIM records are added by Cloudflare's onboarding, but
  which folder the message lands in is explicitly out of scope (PRD §Non-Goals, v2). The
  roadmap outcome is worded to match.
- **Not gating the deploy on the binding.** Decided this session: `/api/health` reports the
  binding but does not fail on it. See *Open consequence* under Phase 3.
- **Not enabling inbound Email Routing.** Cloudflare's own warning: the domain then receives
  *all* mail addressed to it. This change only sends.
- **Not building a daily send counter.** 70 lokale against a 100/day PoC ceiling leaves 30
  spare; `E_DAILY_LIMIT_EXCEEDED` as a surfaced error is enough for the PoC.
- **Not writing the `FR-004` voting-link email.** The link format doesn't exist yet — `S-03`
  decides it.
- **Not automating the manual prerequisites.** Buying the domain, upgrading the plan and
  onboarding for sending stay manual, exactly like `F-01`'s Supabase dashboard step.

## Implementation Approach

Prove the channel from the outside in, so that each failure has exactly one possible cause.

1. **Account and domain first, with no code involved** (Phase 1). `wrangler email sending send`
   proves the domain end from the CLI before `src/lib/email.ts` exists. If Phase 4 then fails,
   it cannot be the domain.
2. **Binding and types before behaviour** (Phase 2). The binding config and the generated
   types are the part that silently breaks lint and CI; land them on their own and prove the
   `wrangler types → astro sync → lint → build` sequence green.
3. **One helper owns the `cloudflare:workers` import** (Phase 3). `src/lib/email.ts` is the
   only module importing it; `config-status.ts` and `health.ts` both go through the helper.
   That keeps a build-time module-resolution risk in one file and gives `S-04` one entry point.
4. **Production is the proof** (Phase 4). `wrangler dev` with `"remote": true` proves the
   account and domain, not that the deployed Worker resolves the binding. `astro dev` and
   production diverge precisely here.

## Critical Implementation Details

**`config-status.ts` must stop computing at module scope.** Today `configStatuses` and
`missingConfigs` are module-scope constants (`src/lib/config-status.ts:11,21`), evaluated when
`Layout.astro` imports the module. Binding access through `cloudflare:workers` is not
guaranteed to be populated during module evaluation the way `astro:env/server` values are.
Convert both to functions (`getConfigStatuses()` / `getMissingConfigs()`) and update the single
call site at `src/layouts/Layout.astro:23`. Doing this the lazy way is not optional polish —
a top-level binding read is the failure mode that would make the banner throw on first render.

**CI never runs `npx wrangler types`.** `deploy.yml` runs `npm ci → astro sync → lint → build`.
The committed `worker-configuration.d.ts` is therefore the only source of binding types in CI.
If it drifts from `wrangler.jsonc`, local lint stays green while CI types the binding wrongly
or fails. Re-run `wrangler types` and commit the result in the same commit as any
`wrangler.jsonc` change — never separately.

**Ordering on a changed config.** `npx wrangler types && npx astro sync && npm run lint &&
npm run build`. Skipping either generate step makes the type-aware lint report failures that
have nothing to do with the code.

**`"remote": true` must never reach a commit.** It sends real mail from `wrangler dev`.
Cloudflare's guidance is to remove it before deploying; here it is never committed at all, and
the README documents it as a temporary local edit. Check `git diff wrangler.jsonc` before
committing in Phases 2–4.

---

## Phase 1: Prerequisites and channel proof outside the app

### Overview

Everything that happens in a browser, a dashboard or a CLI — before any repository change.
Ends with a real message sent from our domain by `wrangler`, proving the account and domain
independently of application code.

### Changes Required

#### 1. Workers Paid plan

**File**: none — Cloudflare dashboard.

**Intent**: Email Sending is unavailable on Workers Free, which is where the Worker runs
today. Upgrade the account to Workers Paid ($5/mo).

**Contract**: The account hosting the `estate-manager` Worker is on Workers Paid. Recorded in
`change.md` with the date, since it is the first recurring cost the project carries.

#### 2. Domain onboarding for sending

**File**: none — `wrangler` CLI against the already-purchased domain.

**Intent**: Enable Email Sending on the domain and confirm Cloudflare wrote the
authentication records into the zone it already hosts. DNS propagation is typically 5–15
minutes, so this is the step with a wait in it.

**Contract**: `wrangler email sending list` includes the domain, and
`wrangler email sending dns get <domain>` shows SPF (TXT) and DKIM records present.

```bash
npx wrangler email sending enable <domain>
npx wrangler email sending list
npx wrangler email sending dns get <domain>
```

Do **not** run `wrangler email routing enable` — inbound routing on the root domain makes it
receive all mail addressed to it, and this change only sends.

#### 3. Read the account's sending limits

**File**: none — dashboard or Cloudflare API.

**Intent**: Close the one item the research left open and bounded. The PoC ceiling of 100
messages/day is **our** figure, carrying the assumption that Cloudflare's undocumented quota
is at least 100. Answering "is theirs ≥ 100?" costs a minute while the account is open; if it
is lower, `S-04`'s fanout planning changes before it starts rather than after.

**Contract**: The actual daily quota (or the finding that it is still not exposed) is written
into `change.md` and, if it contradicts 100/day, into `docs-cloudflare-email.md` §9.

```
Dashboard → Compute & AI → Email Service → Email Sending
GET /accounts/{account_id}/email/sending/limits
```

#### 4. CLI proof send

**File**: none.

**Intent**: Send one message from the domain with no application code in the picture. This is
the step that makes a Phase 4 failure diagnosable — after this passes, a failed production
send cannot be the domain.

**Contract**: `wrangler email sending send` exits 0 and the message arrives in an inbox you
control.

```bash
npx wrangler email sending send \
  --from "glosowanie@<domain>" \
  --to "<inbox you control>" \
  --subject "EstateManager — test kanału (CLI)" \
  --text "Test kanału pocztowego z wiersza poleceń."
```

### Success Criteria

#### Automated Verification

- `npx wrangler email sending list` lists the domain
- `npx wrangler email sending dns get <domain>` shows SPF and DKIM records
- `npx wrangler email sending send …` exits 0

#### Manual Verification

- The Cloudflare account is on the Workers Paid plan
- The CLI message arrives in the inbox (any folder)
- The account's daily sending limit is recorded in `change.md`, with an explicit note on
  whether it is ≥ 100

**Implementation Note**: Pause here for confirmation before touching the repository. Phase 2
onwards assumes the domain sends.

---

## Phase 2: Binding, generated types, and the mail helper

### Overview

The repository changes that make `env.EMAIL` exist and typed, plus the helper that wraps it.
No routes, no UI. Ends with the full generate-then-verify sequence green.

### Changes Required

#### 1. Declare the binding

**File**: `wrangler.jsonc`

**Intent**: Add the `send_email` binding, locked to the single sending identity the product
has. A binding not listed here is `undefined` at runtime and does not throw at deploy time —
locking the sender means code sending from anything else fails loudly at the binding rather
than quietly reaching owners from a wrong address.

**Contract**: A top-level `send_email` array alongside the existing `kv_namespaces`, with
binding name `EMAIL`:

```jsonc
"send_email": [
  {
    "name": "EMAIL",
    "allowed_sender_addresses": ["glosowanie@<domain>"]
  }
]
```

`"remote": true` is **not** committed (see *Critical Implementation Details*).

#### 2. Generate and commit the binding types

**File**: `worker-configuration.d.ts` (new, committed)

**Intent**: `npx wrangler types` writes the real `SendEmail`, `EmailAddress` and
`EmailAttachment` types from the workerd runtime. Both Cloudflare's and Astro's docs say to
use the generated types rather than hand-writing them, and CI never runs this command — the
committed file is CI's only source.

**Contract**: `worker-configuration.d.ts` exists at the repo root, is committed (it is not
covered by any `.gitignore` rule), and declares `EMAIL` on the environment interface.
`tsconfig.json` already includes `**/*`, so no tsconfig change is needed.

#### 3. The mail helper

**File**: `src/lib/email.ts` (new)

**Intent**: The single module that imports `cloudflare:workers`, exporting one function to
send a message and one to report whether the binding is present. `S-04` imports this rather
than reaching for the binding itself. Unlike `src/lib/supabase.ts`, this needs no per-request
construction — `env` is a module-scope import, so a plain function is correct.

**Contract**: Two exports.

- `isEmailConfigured(): boolean` — whether `env.EMAIL` is a usable binding. Called by
  `config-status.ts` and `health.ts`; must not throw when the binding is absent.
- `sendTestEmail(to: string): Promise<{ ok: true; messageId: string } | { ok: false; code: string; message: string }>`
  — sends the fixed Polish test message and never throws. Binding errors arrive as `Error`
  with a **string** `.code` (`E_SENDER_NOT_VERIFIED`, `E_RATE_LIMIT_EXCEEDED`, …); catch,
  log the code and message, and return them. No retry, no classification — this change sends
  one message, which cannot be partially rate-limited, and an unproven table is worse than
  none.

The `from` value must be the exact address in `allowed_sender_addresses`, and the message
carries **both** `html` and `text` — some clients render only plain text, and it improves spam
scoring. The `from` shape on the binding is `{ email, name }`; the REST API uses `address`
instead, and mixing the two is a documented trap.

The message body itself is a short Polish test that identifies itself as such — not a draft of
the `FR-004` voting-link email, whose link format `S-03` has not decided yet.

### Success Criteria

#### Automated Verification

- `npx wrangler types` succeeds and writes `worker-configuration.d.ts`
- `npx astro sync` succeeds
- `npm run lint` passes
- `npm run build` passes
- `git diff wrangler.jsonc` shows no `"remote": true`

#### Manual Verification

- `worker-configuration.d.ts` is staged for commit, not ignored
- `EMAIL` appears in the generated environment interface

---

## Phase 3: Trigger endpoint and the missing-binding surface

### Overview

The authenticated endpoint that fires a send, and the two places a missing binding becomes
visible. Includes proving the negative case locally — the half that is easy to skip and is the
reason `F-01` existed.

### Changes Required

#### 1. The trigger endpoint

**File**: `src/pages/api/email/test.ts` (new)

**Intent**: The way a message is sent from the deployed Worker. It stays in the repository
after this change as a live smoke test, so the channel can be re-verified after any deploy —
which matters on a beta API that may change under us.

**Contract**: `POST`, taking **form data** with a required `to` field. Responds with JSON —
following `/api/health`, not the auth endpoints, because this is a `curl` diagnostic and not a
browser form flow. `200 {"status":"sent","messageId":"…"}` on success;
`400 {"status":"error","error":"missing-recipient"}` when `to` is absent or not a plausible
address; `502 {"status":"error","code":"E_…","message":"…"}` when the binding rejects the
send. `cache-control: no-store` on every response.

The message body is fixed; only the recipient varies. That keeps the endpoint from becoming an
ad-hoc mailer while still allowing re-verification against a different inbox without a code
change.

#### 2. Protect the endpoint

**File**: `src/middleware.ts`

**Intent**: Only a signed-in administrator may fire a send. `PROTECTED_ROUTES` is the only
auth gate in the app — an endpoint not listed there is not protected.

**Contract**: `"/api/email"` added to `PROTECTED_ROUTES`. Matching is `startsWith`, so this
covers `/api/email/test` and anything added under it later. Unauthenticated callers get the
existing redirect to `/auth/signin` (a `302` to `curl`), consistent with `/dashboard`.

#### 3. Surface the binding in config-status

**File**: `src/lib/config-status.ts`, `src/layouts/Layout.astro`

**Intent**: A missing binding must be visible rather than silent. The binding removes the API
key — and with it the whole "green deploy, dead feature" class that `F-01` closed for Supabase
— but it does not remove the need to check the binding exists.

**Contract**: Convert the module-scope `configStatuses` / `missingConfigs` constants into
`getConfigStatuses()` / `getMissingConfigs()` functions, and update the single call site at
`src/layouts/Layout.astro:23`. The new entry uses `isEmailConfigured()` from `@/lib/email`,
with a Polish message in the style of the existing Supabase entry
("Kanał pocztowy nie jest skonfigurowany — …"). The lazy form is required, not cosmetic; see
*Critical Implementation Details*.

#### 4. Report the binding in the health probe

**File**: `src/pages/api/health.ts`

**Intent**: Make the binding's absence visible to anything that curls the Worker, without
letting a beta channel block deploys.

**Contract**: When Supabase checks pass, the `200` body gains an `email` field —
`"ok"` when the binding resolves, `"missing"` when it does not. The **status code does not
change**: `deploy.yml`'s `curl --fail` must still succeed with a missing binding. Supabase
keeps its existing `503` behaviour untouched. The existing
`json(body: Record<string, string>, status)` helper takes this with no signature change.

> **Open consequence, accepted this session.** Because the field is informational, nothing
> stops a deploy that ships without the binding — the `email` field is only seen by someone
> who reads the body. This is a deliberate step down from the Supabase treatment: `F-01` made
> a missing Supabase secret fail the deploy, and a missing `EMAIL` binding will not. The
> reasoning is that a beta channel should not be able to block shipping the rest of the app.
> Revisit when `S-04` makes the channel load-bearing for a real building.

#### 5. Prove the negative case locally

**File**: none — a temporary local edit, reverted.

**Intent**: A surface that has never been seen failing is not known to work. `F-01` proved its
deploy gate with a deliberate lint error; this is the same move, one notch cheaper because it
runs locally.

**Contract**: With the `send_email` entry temporarily removed from `wrangler.jsonc`,
`npm run dev` shows the config-status banner and `/api/health` returns `200` with
`"email":"missing"`. Restore the entry; `git status` clean afterwards.

### Success Criteria

#### Automated Verification

- `npx astro sync && npm run lint && npm run build` pass
- `curl -i -X POST http://localhost:4321/api/email/test` without a session returns a `302` to `/auth/signin`
- With the binding removed, `curl http://localhost:4321/api/health` returns `200` with `"email":"missing"`
- With the binding restored, `curl http://localhost:4321/api/health` returns `200` with `"email":"ok"`
- `git status` is clean of the temporary binding removal

#### Manual Verification

- The config-status banner appears on a page load when the binding is absent, and disappears when it is present
- A local send with `"remote": true` temporarily added and a signed-in session delivers a message to the test inbox
- `"remote": true` is removed again and does not appear in `git diff`

**Implementation Note**: Pause here for confirmation before pushing. Phase 4 deploys to
production.

---

## Phase 4: Deploy and prove from production

### Overview

The phase that carries the actual value of `F-02`. A passing local run with `"remote": true`
proves the account and domain; only this proves the **deployed** Worker resolves the binding.

### Changes Required

#### 1. Push and let the pipeline run

**File**: none — `git push origin main`.

**Intent**: Deploy through the existing gate rather than `wrangler deploy`, which would
publish a tree CI never validated — the exact thing `deploy.yml`'s ordering exists to prevent.

**Contract**: `deploy.yml` runs `npm ci → astro sync → lint → build → wrangler deploy →
curl /api/health` and finishes green. Pushing to `main` is its own opt-in, separate from
committing.

#### 2. The production round trip

**File**: none — `curl` against the live Worker.

**Intent**: Sign in as the administrator, fire the endpoint, and confirm a `messageId` comes
back from the deployed Worker.

**Contract**: A two-step curl using the cookie jar, mirroring the login round trip `F-01`
proved on 2026-08-01:

```bash
BASE=https://estate-manager.estate-manager.workers.dev

curl -s -c /tmp/em-cookies.txt -X POST "$BASE/api/auth/signin" \
  -d "email=test@test.com" -d "password=Test123!"

curl -s -b /tmp/em-cookies.txt -X POST "$BASE/api/email/test" \
  -d "to=<inbox you control>"
```

The second call returns `200` with a `messageId`.

#### 3. Record the proof

**File**: `context/changes/transactional-mail-channel/change.md`

**Intent**: The `messageId` and the date are the durable evidence that the channel worked
once, in production, on a beta API. When Cloudflare changes something under us, this is the
record that dates the last known-good send.

**Contract**: A dated entry carrying the `messageId`, the sending domain, the recipient
(redacted if you prefer), and the account's daily limit finding from Phase 1.

### Success Criteria

#### Automated Verification

- The `deploy.yml` run for this push is green, including the health assertion
- `curl "$BASE/api/health"` returns `200` with `"status":"ok"` and `"email":"ok"`
- The production `POST /api/email/test` returns `200` with a `messageId`
- `curl -i -X POST "$BASE/api/email/test"` without a session returns `302`

#### Manual Verification

- The message arrives in the test inbox — any folder counts; which folder is out of scope
- The `messageId` is recorded in `change.md`
- Cloudflare's Email Sending dashboard shows the send

**Implementation Note**: This is the phase that either closes `F-02` or reopens the provider
decision. If the deployed Worker cannot resolve the binding after Phase 1 passed, the fallback
is Resend (`research.md` §7) — do not improvise a third option.

---

## Phase 5: Documentation and close-out

### Overview

Four documents are stale as a direct result of this change. Two of them are stale *because of
the provider decision*, independent of the code.

### Changes Required

#### 1. Correct the roadmap outcome text

**File**: `context/foundation/roadmap.md`

**Intent**: `F-02`'s outcome says the message goes out "na jego domenie testowej" — the
provider's test domain. Cloudflare has no test domain, so the sentence is false. `research.md`
§8 flags this as needing amendment rather than annotation.

**Contract**: The `F-02` outcome line (and the summary-table row at line 46) name our own
domain. `F-02` status `ready → done`. `S-04`'s prerequisite note gains the domain and the
Workers Paid plan as things `F-02` delivered.

#### 2. Update the Current state snapshot

**File**: `CLAUDE.md`

**Intent**: The "Current state" section is deliberately the only place these facts live.

**Contract**: A new bullet covering: the mail channel is live via the `send_email` binding
from our own domain; the account is on Workers **Paid** (the existing text says Free); the
first production send is dated with its `messageId`; `/api/health` now reports `email` but
does **not** gate on it; `worker-configuration.d.ts` is committed and CI never regenerates it,
so `npx wrangler types` belongs in the sequence after any `wrangler.jsonc` change.

#### 3. Document the manual procedure

**File**: `README.md`

**Intent**: The prerequisites are manual and unautomated, exactly like the Supabase dashboard
procedure this README already carries. Without them written down, the next person cannot
recreate the channel.

**Contract**: A section alongside the existing Supabase and Health check sections, covering:
the Workers Paid requirement, `wrangler email sending enable/list/dns get`, the warning
against enabling inbound routing, `"remote": true` as a temporary local edit that must never
be committed, and `npx wrangler types` in the lint sequence.

#### 4. Close the change

**File**: `context/changes/transactional-mail-channel/change.md`

**Intent**: Flip the change to done and leave the residuals visible.

**Contract**: `status: done`, `updated:` today. Residuals recorded explicitly: the subrequest
question carried to `S-04`, the beta designation of Email Service, the GDPR processing
agreement still owed, and the deliberate decision that a missing binding does not fail the
deploy.

### Success Criteria

#### Automated Verification

- `npm run lint` passes (Prettier via lint-staged formats the Markdown on commit)
- `grep -c "domenie testowej" context/foundation/roadmap.md` returns 0 for the `F-02` block

#### Manual Verification

- `CLAUDE.md` no longer says the account is on Workers Free
- README's procedure is followable by someone who was not present for this change
- `change.md` status is `done` with the residuals listed

---

## Testing Strategy

There is no test runner in this repository — no `npm test`, no framework. Verification is
`npm run lint && npm run build` plus the manual steps below. Never report that tests passed.

### Automated checks

- `npx wrangler types && npx astro sync && npm run lint && npm run build` — the full sequence
  after any `wrangler.jsonc` change
- `curl` assertions on `/api/health` and `/api/email/test`, local and production

### Manual testing steps

1. **Domain, before code** (Phase 1): `wrangler email sending send` reaches the inbox.
2. **Missing binding is visible** (Phase 3): remove `send_email`, load a page, see the banner;
   curl `/api/health`, see `"email":"missing"`; restore.
3. **Auth gate holds** (Phase 3): POST `/api/email/test` with no session, get `302`.
4. **Local send** (Phase 3): with `"remote": true` and a session, a message arrives; revert the flag.
5. **Production send** (Phase 4): sign in, POST, `200` + `messageId`, message arrives.
6. **Deploy stays green with the binding present** (Phase 4): `deploy.yml`'s health assertion passes.

### What is deliberately untested

Error-code paths other than the one that happens to occur. A single send cannot exercise the
table, and `S-04` builds the classification against a real fanout.

## Performance Considerations

Irrelevant at this scale — one message, one binding call. The performance question that
matters (do ~70 sequential `EMAIL.send()` calls fit one Worker invocation, given per-request
subrequest limits) is explicitly **not** answered here and is `S-04`'s first task. Nothing in
this change should be designed around an assumed answer.

## Migration Notes

No data migration. Two operational changes are not revertible by a git revert:

- **The Workers Paid upgrade** is a billing change on the account, undone in the dashboard.
- **Domain onboarding for sending** adds SPF/DKIM records to the zone; undone with
  `wrangler email sending disable <domain>`.

Reverting the code alone leaves both in place, which is harmless — the binding simply goes
unused.

## References

- Decision record: `context/changes/transactional-mail-channel/research.md`
- API reference (authoritative where it overlaps the research):
  `context/changes/transactional-mail-channel/docs-cloudflare-email.md`
- Roadmap item: `context/foundation/roadmap.md` §`F-02`
- The gate pattern this extends: `.github/workflows/deploy.yml`, `src/pages/api/health.ts`
- The config-status pattern this extends: `src/lib/config-status.ts:11`, `src/layouts/Layout.astro:23`
- Auth gate: `src/middleware.ts:19`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Prerequisites and channel proof outside the app

#### Automated

- [x] 1.1 `npx wrangler email sending list` lists the domain — 38dbc91
- [x] 1.2 `npx wrangler email sending dns get <domain>` shows SPF and DKIM records — 38dbc91
- [x] 1.3 `npx wrangler email sending send …` exits 0 — 38dbc91

#### Manual

- [x] 1.4 The Cloudflare account is on the Workers Paid plan — 38dbc91
- [x] 1.5 The CLI message arrives in the inbox (any folder) — 38dbc91
- [x] 1.6 The account's daily sending limit is recorded in `change.md`, with a note on whether it is ≥ 100 — 38dbc91

### Phase 2: Binding, generated types, and the mail helper

#### Automated

- [x] 2.1 `npx wrangler types` succeeds and writes `worker-configuration.d.ts` — 7602c76
- [x] 2.2 `npx astro sync` succeeds — 7602c76
- [x] 2.3 `npm run lint` passes — 7602c76
- [x] 2.4 `npm run build` passes — 7602c76
- [x] 2.5 `git diff wrangler.jsonc` shows no `"remote": true` — 7602c76

#### Manual

- [x] 2.6 `worker-configuration.d.ts` is staged for commit, not ignored — 7602c76
- [x] 2.7 `EMAIL` appears in the generated environment interface — 7602c76

### Phase 3: Trigger endpoint and the missing-binding surface

#### Automated

- [x] 3.1 `npx astro sync && npm run lint && npm run build` pass — 7a43746
- [x] 3.2 Unauthenticated `POST /api/email/test` returns `302` to `/auth/signin` — 7a43746
- [x] 3.3 With the binding removed, `/api/health` returns `200` with `"email":"missing"` — 7a43746
- [x] 3.4 With the binding restored, `/api/health` returns `200` with `"email":"ok"` — 7a43746
- [x] 3.5 `git status` is clean of the temporary binding removal — 7a43746

#### Manual

- [x] 3.6 The config-status banner appears when the binding is absent and disappears when present — 7a43746
- [x] 3.7 A local send with `"remote": true` and a signed-in session delivers to the test inbox — 7a43746
- [x] 3.8 `"remote": true` is removed again and does not appear in `git diff` — 7a43746

### Phase 4: Deploy and prove from production

#### Automated

- [ ] 4.1 The `deploy.yml` run for this push is green, including the health assertion
- [ ] 4.2 Production `/api/health` returns `200` with `"status":"ok"` and `"email":"ok"`
- [ ] 4.3 Production `POST /api/email/test` returns `200` with a `messageId`
- [ ] 4.4 Unauthenticated production `POST /api/email/test` returns `302`

#### Manual

- [ ] 4.5 The message arrives in the test inbox
- [ ] 4.6 The `messageId` is recorded in `change.md`
- [ ] 4.7 Cloudflare's Email Sending dashboard shows the send

### Phase 5: Documentation and close-out

#### Automated

- [ ] 5.1 `npm run lint` passes
- [ ] 5.2 The `F-02` roadmap block no longer says "domenie testowej"

#### Manual

- [ ] 5.3 `CLAUDE.md` no longer says the account is on Workers Free
- [ ] 5.4 README's procedure is followable by someone not present for this change
- [ ] 5.5 `change.md` status is `done` with the residuals listed
