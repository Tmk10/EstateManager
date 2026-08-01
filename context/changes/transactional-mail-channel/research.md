---
change_id: transactional-mail-channel
doc: research
researched_at: 2026-08-01
revised_at: 2026-08-01
decision: Cloudflare Email Service
runner_up: Resend
decision_status: decided
roadmap_refs: [F-02, S-04]
sources: [cloudflare-email-service skill, developers.cloudflare.com/email-service, Context7 /websites/resend]
---

# Transactional mail — provider decision and API research

Closes the `F-02` unknown from `context/foundation/roadmap.md`: *"Który dostawca poczty
transakcyjnej — i czy da się go wołać po HTTP z runtime'u Workers?"*, and carries the API
surface needed for `S-04` (`voting-link-email-fanout`).

> **Revised 2026-08-01.** The first pass of this research recommended **Resend** and rejected
> Cloudflare Email Service on one ground: it requires a domain we own, and we owned none.
> That ground disappeared when we decided to buy the domain through Cloudflare Registrar
> (§4). The recommendation was rewritten to Cloudflare. Resend is kept in full as the
> documented fallback — §7 — because two of the risks below could send us back to it.

## 1. Decision

**Cloudflare Email Service (Email Sending), via the native Workers `send_email` binding.**

Consequences accepted with this choice, none of them hidden:

- **It is beta.** Documented as beta as of June 2026: "features and APIs may change before
  general availability". This is the one channel the entire product thesis depends on.
- **It requires the Workers Paid plan ($5/mo).** We are on Workers Free today, so this
  choice spends money `F-02` did not previously need. `context/foundation/infrastructure.md`
  already argues for Paid from day one because of the 10 ms CPU ceiling — an argument
  unrelated to email — so the $5 is not attributable to this decision alone.
- **There is no batch endpoint and no idempotency key.** `S-04` must build both by hand
  (§3).

### Why this over Resend

- **No API key.** The binding is declared in `wrangler.jsonc` and travels with the deploy.
  That deletes a failure class `CLAUDE.md` records as a standing trap: CI builds with GitHub
  secrets while the running Worker reads platform secrets the build never sees. Resend's API
  key is exactly that kind of secret. This is the strongest single argument, because the
  project has already been bitten by the shape of it once (`F-01`).
- **One account.** Domain, DNS, Worker and mail in the same place; domain onboarding is one
  CLI command rather than a cross-vendor DNS paste.
- **Per-message granularity suits a fanout better than an atomic batch.** Resend's batch
  fails *whole* on one malformed record; individual sends degrade to "175 delivered, 5
  failed, retry those 5" — the behaviour `S-04` actually wants when a registry row has a bad
  address.

### Constraints this had to satisfy

1. **No SMTP.** `nodejs_compat` on workerd ships `net` and `tls` as non-functional stubs
   whose methods throw, so Nodemailer and every SMTP client is structurally ruled out
   (`infrastructure.md` §D2). A binding or an HTTP API are the only shapes available.
   Satisfied — the binding is native to the runtime, which is the strongest possible form of
   "yes, this runtime can send mail".
2. ~~**Provider-owned test domain**, so `F-02` needs no DNS work.~~ **Retired.** This was a
   scope-limiting device for `F-02` while no domain existed. Buying the domain (§4) replaces
   it. `F-02`'s outcome text in `roadmap.md` still says "na jego domenie testowej" and should
   be amended.
3. **Cost.** Now $5/mo rather than $0 — see §1.

### Provider comparison (unchanged, kept as the record)

| Provider | Free tier | Own domain needed? | Interface | Verdict |
| --- | --- | --- | --- | --- |
| **Cloudflare Email Service** | Workers Paid $5/mo; 3 000/mo included, then $0.35/1k. Sending to verified destination addresses free on all plans | Yes | **Native `send_email` binding**, plus REST | **Chosen** |
| Resend | 3 000/mo, **100/day**, 1 domain | Yes, to send to real addresses | REST + JS SDK | **Fallback** — §7 |
| Brevo (FR) | 300/day ≈ 9 000/mo, no card | No — verified sender address suffices | REST v3 | Rejected; Brevo rewrites free-provider sender addresses |
| Mailgun | 5 000/mo | Sandbox: no, but max **5 authorized recipients** | REST | Dead end without a credit card |
| MailerSend | 500/mo, 100/day | Trial domain, own-verified recipients only | REST | Free tier cut twice: 12k → 3k → 500 |
| AWS SES | ~3 000/mo for 12 months, then $0.10/1k | Yes (sandbox: verified recipients) | REST + SigV4 | Cheapest at scale, most setup |
| Postmark | 100/month | Yes | REST | Too small to develop against |
| SendGrid | **none** | — | — | Permanent free tier removed 27 May 2025 |

Note on Brevo, so the record is not misleading: it *does* have a transactional endpoint
(`POST /v3/smtp/email`) taking recipients inline with per-recipient `params` — it does **not**
require contact lists. The list/group model is its marketing-campaign API, a different
surface. It was rejected on sender-address rewriting and vendor sprawl, not on that.

## 2. Setup — what must exist before any code

All of this is manual, like the Supabase dashboard step in `F-01`. This repo does not
automate it.

1. **Buy the domain in Cloudflare Registrar.** Sold at registry cost; the zone lands on
   Cloudflare DNS as part of the purchase, so there is no transfer wait.
2. **Upgrade to the Workers Paid plan.** Email Sending is unavailable on Free.
3. **Onboard the domain for sending:**
   ```bash
   npx wrangler email sending enable <domain>
   npx wrangler email sending list      # confirm it is listed
   ```
4. **Declare the binding** in `wrangler.jsonc`:
   ```jsonc
   { "send_email": [{ "name": "EMAIL" }] }
   ```
   Optionally restrict which `from` addresses it may use:
   ```jsonc
   { "send_email": [{ "name": "EMAIL", "allowed_sender_addresses": ["glosowanie@<domain>"] }] }
   ```
5. **Regenerate types:** `npx wrangler types`. This writes the real `SendEmail`,
   `EmailAddress` and `EmailAttachment` types into `worker-configuration.d.ts`. Use the
   generated types — do not hand-write them. Note this interacts with the repo's type-aware
   lint rule (`npx astro sync` before `npm run lint`).

**Do not enable inbound Email Routing on the root domain.** Cloudflare's own warning: it then
receives *all* mail for that domain. `S-04` only sends.

## 3. API surface for `S-04`

### Sending

```typescript
const response = await env.EMAIL.send({
  to: "wlasciciel@example.com",
  from: { email: "glosowanie@<domain>", name: "EstateManager" },
  subject: "Głosowanie nad uchwałą",
  html: "<p>…indywidualny link…</p>",
  text: "…indywidualny link…",
});
```

- **Always send both `html` and `text`.** Some clients render only plain text, and it helps
  spam scoring.
- Max **50** combined `to` + `cc` + `bcc` per call — irrelevant here, since every owner gets
  a distinct message, but it is what `E_TOO_MANY_RECIPIENTS` means.
- Total size (body + attachments) ≤ 25 MiB.
- For local development, `{ "send_email": [{ "name": "EMAIL", "remote": true }] }` proxies
  sends to the real service.
- `List-Unsubscribe` and `List-Unsubscribe-Post` are on the allowed-header whitelist, which
  matters if reminders (`FR-010`) are ever unparked.

### The fanout, and the two things Cloudflare does not give us

**No batch endpoint.** One `send()` call per lokal — for the PoC building fixed at **70
lokale** on 2026-08-01, that is 70 calls. (This paragraph said 180 when written, from
`infrastructure.md`'s pre-mortem; see `docs-cloudflare-email.md` §9.) Design implications:

- Failures are **per message**, which is the good half: a single unusable address does not
  sink the building's fanout. Collect outcomes, report the failures to the administrator —
  this connects directly to `S-04`'s open unknown about lokale with no email address.
- **Verify whether 70 binding calls fit one Worker invocation.** Per-request subrequest
  limits apply (50 on Free, higher on Paid) and it is unconfirmed whether `EMAIL.send()`
  counts against them. This is exactly the class of limit that only appears in production —
  `infrastructure.md` §D3 and §G11 already flag the fanout as batch-shaped work on a
  request-scoped runtime. Settle it before designing `S-04`, not after.

**No idempotency key.** A re-run or double-click must not re-send voting links — owners
receiving two links for one resolution is a product defect. Build per-lokal send state in
Postgres and make the fanout resume rather than restart. This is not pure overhead: `S-06`
needs per-lokal audit records anyway, and `S-04` needs to know which lokale lack an address.

**Daily quota is undocumented.** `E_DAILY_LIMIT_EXCEEDED` exists as an error code but the
retrieved docs do not state the number. Find the real figure before the first real building.

### Error handling

Binding errors are thrown as `Error` with a string `.code`:

| Code | Meaning | Retry? |
| --- | --- | --- |
| `E_VALIDATION_ERROR`, `E_FIELD_MISSING` | Bad payload | No — fix the request |
| `E_SENDER_NOT_VERIFIED`, `E_SENDER_DOMAIN_NOT_AVAILABLE` | Domain not onboarded | No — finish §2 |
| `E_TOO_MANY_RECIPIENTS` | >50 combined to/cc/bcc | No — split |
| `E_RECIPIENT_SUPPRESSED` | Address bounced or reported spam | No — surface to the admin |
| `E_RECIPIENT_NOT_ALLOWED` | Not in the allowed destination list | No |
| `E_RATE_LIMIT_EXCEEDED` | Rate limited | Yes — exponential backoff |
| `E_DAILY_LIMIT_EXCEEDED` | Daily quota reached | No — wait, or request an increase |
| `E_DELIVERY_FAILED` | SMTP delivery failure | Yes if transient |
| `E_INTERNAL_SERVER_ERROR` | Service unavailable | Yes — exponential backoff |

Cloudflare maintains the **suppression list** itself, so `E_RECIPIENT_SUPPRESSED` is the
signal that an owner must be reached on the paper channel — which the PRD already allows as
a parallel route.

The REST API (`POST /accounts/{id}/email/sending/send`) exists for non-Workers callers and
uses different field names — `from.address` not `from.email`, `reply_to` not `replyTo`, and
numeric error codes. We do not need it; noted so nobody mixes the two shapes.

## 4. The sending domain

Buy through **Cloudflare Registrar** so domain, DNS, Worker and mail sit in one account.

**Pick the domain name deliberately.** It becomes the product's sending identity, and
redoing §2 later is avoidable work — a throwaway domain now means doing this twice.

Email Sending domain onboarding is `wrangler email sending enable`; Cloudflare manages the
authentication records for a zone it already hosts, which is the main reason this path is
shorter than the cross-vendor alternative in §7.

`estate-manager.estate-manager.workers.dev` is not a candidate: `workers.dev` belongs to
Cloudflare and takes no records of ours.

## 5. Notes for implementation on workerd

- **The binding removes the secret, not the need to check for it.** There is no API key to
  rotate or lose, but a missing or misnamed binding still fails at runtime. `env.EMAIL`
  should be surfaced through `src/lib/config-status.ts` alongside Supabase, so the failure
  is loud rather than a green deploy with a broken channel — the exact pattern `F-01` closed.
- **`astro dev` and production diverge precisely here.** `F-02`'s value is that it exercises
  the call on the deployed Worker. `"remote": true` narrows the gap locally but does not
  close it.
- **`npx wrangler types` output must be committed and lint kept green** — the repo runs
  type-aware ESLint with `projectService`.
- The legacy `EmailMessage` + `mimetext` API still works but is not needed; use the
  structured `send()` form.

## 6. What `F-02` should now prove

Scope stays one message, but the outcome text changes: it is no longer "one message from the
provider's test domain", it is **one message from our own domain via the binding**. Worth
confirming in the same pass, since the Worker is already deployed:

- the binding resolves and `env.EMAIL.send()` succeeds against a real inbox;
- a missing binding is detectable (config-status), not silent;
- the real daily quota, from the dashboard or by asking support.

## 7. Fallback: Resend

Kept because two risks in §1 could send us back: the beta designation, and the Workers Paid
requirement. Resend is GA and free at this volume.

- **Free plan:** 3 000/month, **100/day**, one domain, 30-day log retention, webhooks.
- **Shared test domain `onboarding@resend.dev` only delivers to the account's own address.**
  Confirmed against Resend's knowledge base: any other recipient returns **403**. Good enough
  for a one-message spike, useless for a fanout — which is why Resend also requires a
  verified domain for `S-04`.
- **Test recipient addresses:** `delivered@resend.dev`, `bounced@resend.dev`,
  `complained@resend.dev`, `suppressed@resend.dev`, all except `suppressed` supporting `+`
  labels (`delivered+lokal1@resend.dev`). They simulate events rather than reaching an inbox,
  and count against quota. Whether they work while sending from `onboarding@resend.dev` is
  undocumented.
- **Batch endpoint** `POST /emails/batch`: up to 100 messages per request, each with its own
  `to`/`subject`/`html`; **atomic** — one invalid message fails the whole request. Accepts an
  `idempotencyKey` (`409` on conflict), which is the one thing Cloudflare lacks.
- **Rate limit** 10 req/s per team; `429` on breach. Retry on `429`/`500`; never on
  `400`/`422`/`401`/`403`/`409`.
- **Domain verification on Cloudflare DNS:** the Resend dashboard has a *Sign in to
  Cloudflare* button (Domain Connect) that writes the records automatically. Manual
  equivalent: MX `send` priority 10 → `feedback-smtp.<region>.amazonses.com`, TXT SPF on
  `send`, TXT DKIM on `resend._domainkey`. Cloudflare traps: proxy must be **DNS Only** (grey
  cloud), and paste only the subdomain (`send`, not `send.example.com`) because Cloudflare
  appends the zone.
- **Region matters if we ever switch:** `eu-west-1` should be chosen at domain creation for
  GDPR reasons, and is best treated as fixed thereafter.

Switch triggers: Email Service still in beta when `S-04` starts and the beta proves unstable;
or a decision to stay on Workers Free.

## 8. Open items

- **Real daily quota for Cloudflare Email Sending.** Still undocumented. Bounded 2026-08-01
  by fixing a PoC ceiling of **100/day** against a 70-lokal building, which reduces the
  question to "is theirs ≥ 100?" — answerable from the Dashboard or
  `GET /accounts/{account_id}/email/sending/limits`. Do it inside `F-02`. See
  `docs-cloudflare-email.md` §9.
- **Do 70 `EMAIL.send()` calls fit one Worker invocation?** Subrequest accounting is
  unconfirmed (§3). Settle before designing `S-04`. Sharper now, not softer: with the daily
  budget matched to the building, nothing else forces the fanout across requests, so this
  limit is the binding one.
- **Does Email Sending reach GA before `S-04`?** A beta API change on this path is the main
  risk taken by §1.
- **GDPR / processor status.** Owner names and addresses of a wspólnota are personal data and
  the provider is a processor. Cloudflare is at least the same processor already handling the
  application traffic, which is simpler than adding a second US vendor — but a processing
  agreement is still owed. Not a blocker for a PoC on test data; it becomes one at the same
  moment PRD §Open Questions no. 3 does.
- **Which domain name to buy** (§4).
- **`roadmap.md` needs amending**, not just annotating: `F-02`'s outcome says the message
  goes out "na jego domenie testowej" (the provider's test domain), which this decision makes
  false. `S-04` also gains a dependency on the domain and on Workers Paid.

## Sources

- [Cloudflare Email Service docs](https://developers.cloudflare.com/email-service/)
- [Cloudflare Email Service — Workers API](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/)
- [Cloudflare Email Service — send bindings](https://developers.cloudflare.com/email-service/configuration/send-bindings/)
- [Cloudflare Email Service — email headers reference](https://developers.cloudflare.com/email-service/reference/headers/)
- [Cloudflare Email Service — beta announcement](https://blog.cloudflare.com/email-service/)
- `cloudflare-email-service` skill references (`sending.md`, `rest-api.md`)
- [Resend — Send Email API reference](https://resend.com/docs/api-reference/emails/send-email)
- [Resend — Idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys)
- [Resend — 403 error using the resend.dev domain](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain)
- [Resend — Test email addresses](https://resend.com/docs/dashboard/emails/send-test-emails)
- [Resend — New Free Tier](https://resend.com/blog/new-free-tier)
- [Brevo — Send a transactional email](https://developers.brevo.com/docs/send-a-transactional-email)
- [Mailgun — Sandbox domains](https://documentation.mailgun.com/docs/mailgun/user-manual/domains/domains-sandbox)
- [MailerSend pricing](https://www.mailersend.com/pricing)
- [Mailtrap — Best Transactional Email Services 2026](https://mailtrap.io/blog/transactional-email-services/)
