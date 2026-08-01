# Transactional Mail Channel (`F-02`) — Plan Brief

> Full plan: `context/changes/transactional-mail-channel/plan.md`
> Research: `context/changes/transactional-mail-channel/research.md` (decision record)
> API reference: `context/changes/transactional-mail-channel/docs-cloudflare-email.md`

## What & Why

Connect Cloudflare Email Service through the native Workers `send_email` binding and prove one
real message leaves the **deployed** Worker, from a domain we own, into an inbox we control.
This is a foundation, not a slice: it exists to remove the single unknown that could make
`S-04` (voting-link fanout) unbuildable — whether this runtime can send mail at all, and
through which interface. Scope is one message, deliberately not a fanout.

## Starting Point

The app is live on Workers **Free** with no mail of any kind: no binding in `wrangler.jsonc`,
no `worker-configuration.d.ts` (`wrangler types` has never run here), no onboarded sending
domain. The provider decision is already made — Cloudflare Email Service over Resend, mainly
because the binding has no API key and therefore deletes the "green deploy, dead feature"
failure class that `F-01` spent a whole change closing. The domain is bought; it still has to
be enabled for sending, and the plan still has to be upgraded to Paid.

## Desired End State

A signed-in administrator fires `POST /api/email/test` against the live Worker and a short
Polish test message arrives, sent from `glosowanie@<domain>`; the endpoint returns
Cloudflare's `messageId`. `src/lib/email.ts` exists as the helper `S-04` will import. A missing
binding shows up in the config-status banner and in an `email` field on `/api/health`.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Provider | Cloudflare Email Service, `send_email` binding | No API key — deletes the failure class `F-01` closed | Research |
| Runtime env access | `import { env } from "cloudflare:workers"` | Astro 6 + adapter 13 removed `Astro.locals.runtime.env` | Research |
| Trigger | Protected `POST /api/email/test` | Matches the repo's only auth gate; provable by curl exactly like `F-01`'s login round trip | Plan |
| Code lifetime | Helper **and** endpoint stay committed | `S-04` imports the helper; the endpoint stays a live smoke test on a beta API | Plan |
| Missing-binding surface | config-status banner **plus** a non-gating `email` field in `/api/health` | Visible without letting a beta channel block deploys | Plan |
| Proof of success | Inbox receipt **and** `messageId` | A `messageId` alone can come back on a dead channel | Plan |
| Sender lock | `allowed_sender_addresses: ["glosowanie@<domain>"]` | One sending identity; wrong-address sends fail at the binding, not at the owner's inbox | Plan |
| Message content | Minimal Polish test message, `html` + `text` | The `FR-004` link format doesn't exist yet — `S-03` decides it | Plan |
| Local dev | `"remote": true` never committed, README-documented | Cloudflare's own guidance; the flag sends real mail from `wrangler dev` | Plan |
| Error handling | Catch, log `.code`, return it — no retry table | A single send can't exercise the table; unproven mappings reach production | Plan |
| Fanout subrequest probe | Not here — carried to `S-04` | Would burn most of a day's ceiling and turn a foundation into load testing | Plan |

## Scope

**In scope:** Workers Paid upgrade · domain onboarding for sending · the `send_email` binding ·
first `wrangler types` run and the committed `worker-configuration.d.ts` · `src/lib/email.ts` ·
protected trigger endpoint · config-status and `/api/health` surfacing · one proven production
send · four stale documents corrected.

**Out of scope:** the fanout · the subrequest-limit probe · retry/backoff and error-code
classification · deliverability tuning (parked to v2) · inbound Email Routing · a daily send
counter · the real `FR-004` voting-link email · automating any manual prerequisite.

## Architecture / Approach

Prove the channel from the outside in, so each failure has exactly one possible cause. The CLI
send in Phase 1 proves the domain **before** any code exists; if the production send later
fails, it cannot be the domain. `src/lib/email.ts` is the only module importing
`cloudflare:workers` — both `config-status.ts` and `health.ts` go through it, keeping a
build-time module-resolution risk in one file and giving `S-04` a single entry point. Unlike
`src/lib/supabase.ts`, no per-request construction is needed: `env` is a module-scope import,
so the helper is a plain function.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Prerequisites & CLI proof | Paid plan, onboarded domain, one CLI-sent message, the real daily quota | Spends money; 5–15 min DNS wait; quota could turn out below our 100/day assumption |
| 2. Binding, types, helper | `send_email` in `wrangler.jsonc`, committed `worker-configuration.d.ts`, `src/lib/email.ts` | CI never runs `wrangler types` — a stale committed file mistypes the binding silently |
| 3. Endpoint & failure surface | Protected `POST /api/email/test`, banner + health field, negative case proven locally | `config-status.ts` computes at module scope today and must become lazy, or the banner throws on first render |
| 4. Deploy & prove | A real `messageId` from the live Worker, recorded | The one thing local dev cannot prove; failure here reopens the provider decision |
| 5. Docs & close-out | roadmap, CLAUDE.md, README, change.md corrected | Two of these are stale from the provider decision, not the code — easy to skip |

**Prerequisites:** a Cloudflare account able to upgrade to Workers Paid; the purchased domain
on Cloudflare DNS; an inbox you control for the test send. The domain name itself still has to
be supplied — the plan carries `<domain>` as its only placeholder.

**Estimated effort:** ~1–2 sessions. Most of the calendar is Phase 1's dashboard work and DNS
propagation, not code — the code surface is one helper, one endpoint, and three small edits.

## Open Risks & Assumptions

- **Cloudflare Email Service is beta**, on the one channel the product thesis depends on.
  Accepted knowingly; Resend stays documented as the fallback (`research.md` §7).
- **The 100/day ceiling is our number, not Cloudflare's.** Phase 1 checks whether theirs is
  ≥ 100. If it is lower, `S-04`'s fanout planning changes before it starts.
- **A missing binding will not fail the deploy** — a deliberate step down from the Supabase
  treatment `F-01` built. Worth revisiting when `S-04` makes the channel load-bearing.
- **Whether ~70 sequential sends fit one Worker invocation is still open** and stays `S-04`'s
  first task. Nothing here should be designed around an assumed answer.
- **A GDPR processing agreement is still owed** — not a blocker for a PoC on test data.
- **Two Phase 1 steps aren't undone by a git revert**: the billing upgrade and the zone's
  SPF/DKIM records.

## Success Criteria (Summary)

- A signed-in administrator fires one endpoint against the live Worker and a real message
  arrives in a real inbox — any folder.
- A missing binding is visible in the banner and in `/api/health`, proven by removing it.
- `S-04` can start without asking whether this runtime can send mail.
