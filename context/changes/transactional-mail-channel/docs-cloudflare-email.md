---
change_id: transactional-mail-channel
title: Cloudflare Email Service — API reference for F-02
retrieved: 2026-08-01
sources:
  - context7: /websites/developers_cloudflare_email-service
  - context7: /withastro/docs
  - skill: cloudflare-email-service (bundled reference set)
---

# Cloudflare Email Service — API reference for `F-02`

Retrieved documentation for the provider chosen in `research.md` §1. This file is the
**API reference**; `research.md` is the **decision record**. Where they overlap, this file
is the newer of the two and wins — it was retrieved after the decision was made.

Everything below is what `F-02` needs to send one real message from the deployed Worker,
plus the parts `S-04` will need on top of it.

> **The one thing that is not in `research.md` and would break the implementation:**
> on Astro 6 with `@astrojs/cloudflare` 13, `Astro.locals.runtime.env` **no longer exists**.
> Bindings are reached by importing `env` from `cloudflare:workers`. See §3.

---

## 1. Prerequisites — manual, outside this repo

Ordered; each step blocks the next. None of it is automated here, exactly like the Supabase
dashboard step in `F-01`.

1. **Workers Paid plan.** Email Sending is unavailable on Workers Free — we are on Free today.
2. **A domain we own**, on Cloudflare DNS. `workers.dev` is not a candidate; it belongs to
   Cloudflare and takes no records of ours. Cloudflare Email Service has **no provider test
   domain** — this is why `F-02`'s scope grew to include buying one.
3. **Onboard the domain for sending:**
   ```bash
   npx wrangler email sending enable <domain>
   npx wrangler email sending list            # confirm it is listed
   npx wrangler email sending dns get <domain>  # verify SPF + DKIM records landed
   ```
   Onboarding auto-adds the SPF (TXT) and DKIM (CNAME/TXT) records for a zone Cloudflare
   already hosts. DNS propagation is typically 5–15 minutes.

   Dashboard equivalent: **Compute & AI → Email Service → Email Sending → Onboard Domain →
   Add records and onboard**.

4. **Do not enable inbound Email Routing on the root domain.** Cloudflare's own warning:
   the domain then receives *all* mail addressed to it. `F-02` and `S-04` only send.

Full CLI surface (`npx wrangler email --help`):

```
wrangler email sending
├── enable/disable   <domain>          # toggle email sending
├── dns get          <domain>          # show sending DNS records (SPF, DKIM)
├── send             --from --to ...   # send an email (builder flags)
└── send-raw         --from --to ...   # send a raw MIME email

wrangler email routing                 # inbound — not used by this change
├── enable/disable   <domain>
├── dns get          <domain>
├── rules list/create/update/delete
└── addresses list/create/delete
```

`wrangler email sending send` is worth knowing for `F-02`: it proves the domain end of the
setup from the CLI, **before** any application code exists, which separates "the domain is
wrong" from "my Worker code is wrong".

```bash
npx wrangler email sending send \
  --from "glosowanie@<domain>" \
  --to "<test inbox>" \
  --subject "Test" \
  --text "Test."
```

---

## 2. The binding in `wrangler.jsonc`

Current `wrangler.jsonc` has `assets`, `kv_namespaces` and `observability`. Add a
top-level `send_email` array:

```jsonc
{
  "send_email": [{ "name": "EMAIL" }]
}
```

Optionally lock the binding to the addresses it may send **from** — recommended here, since
the product has exactly one sending identity:

```jsonc
{
  "send_email": [
    {
      "name": "EMAIL",
      "allowed_sender_addresses": ["glosowanie@<domain>"]
    }
  ]
}
```

A binding not listed in `wrangler.jsonc` is `undefined` at runtime — it does not throw at
deploy time. This is the `F-01` failure class again (green deploy, dead feature), and the
reason `env.EMAIL` must be surfaced through `src/lib/config-status.ts`.

---

## 3. Reaching the binding from Astro 6 — read this before writing code

`@astrojs/cloudflare` 13 / Astro 6 **removed** the runtime accessor that most tutorials and
older answers still show.

```ts
// ❌ Astro 5 and earlier — does not work here
const email = Astro.locals.runtime.env.EMAIL;

// ✅ Astro 6 + @astrojs/cloudflare 13
import { env } from "cloudflare:workers";
const email = env.EMAIL;
```

Two related renames from the same migration:

| Astro 5 | Astro 6 |
| --- | --- |
| `Astro.locals.runtime.env` | `import { env } from "cloudflare:workers"` |
| `Astro.locals.runtime.ctx` | `Astro.locals.cfContext` |

Consequences for this repo:

- `env` is a **module-scope import**, not a request-scoped value. It works in `src/lib/`
  helpers without threading `Astro`/`context` through — unlike Supabase, which is built
  per-request from headers in `src/middleware.ts`. A mail helper in `src/lib/` can therefore
  be a plain function.
- `SUPABASE_URL` / `SUPABASE_KEY` keep coming from `astro:env/server`; that is unrelated
  machinery for typed env vars and does **not** carry bindings. `EMAIL` is a binding, so it
  arrives through `cloudflare:workers` and never appears in `astro.config.mjs`'s `env.schema`.
- `src/env.d.ts` currently declares only `App.Locals.user`. Do **not** hand-write a `Runtime`
  interface there — see §4.

---

## 4. Types

```bash
npx wrangler types
```

This generates `worker-configuration.d.ts` with the real `SendEmail`, `EmailAddress` and
`EmailAttachment` types from the workerd runtime. Astro's docs and Cloudflare's both say the
same thing: use the generated types, do not hand-write them. Re-run it every time
`wrangler.jsonc` or `.dev.vars` changes.

Repo-specific: the generated file must be **committed**, and this interacts with the
type-aware lint rule — the working order on a changed config is

```bash
npx wrangler types && npx astro sync && npm run lint && npm run build
```

---

## 5. `send()`

The modern structured API. `env.EMAIL.send(options)` returns a promise resolving to an
object carrying `messageId`.

```typescript
import { env } from "cloudflare:workers";

const response = await env.EMAIL.send({
  to: "wlasciciel@example.com",
  from: { email: "glosowanie@<domain>", name: "EstateManager" },
  subject: "Głosowanie nad uchwałą",
  html: "<p>…indywidualny link…</p>",
  text: "…indywidualny link…",
});

console.log(response.messageId);
```

| Field | Required | Notes |
| --- | --- | --- |
| `to` | yes | `string` or `string[]` |
| `from` | yes | `string`, or `{ email, name }`. **Workers binding uses `email`**; the REST API uses `address` — do not mix the shapes |
| `subject` | yes | |
| `html` | — | |
| `text` | — | |
| `cc`, `bcc` | — | count toward the recipient cap |
| `replyTo` | — | `replyTo` on the binding, `reply_to` on REST |
| `headers` | — | whitelist only, see below |
| `attachments` | — | not needed by this change |

Limits that matter:

- **Max 50 combined `to` + `cc` + `bcc` per call.** Irrelevant to `S-04` — every owner gets a
  distinct message — but it is what `E_TOO_MANY_RECIPIENTS` means.
- **Total size (body + attachments) ≤ 25 MiB.**
- **Always send both `html` and `text`.** Some clients render only plain text, and it improves
  spam scoring.

### Custom headers

Only whitelisted headers are accepted; at most 20 non-`X-` headers, each value ≤ 2,048 bytes,
16 KB total. `List-Unsubscribe` and `List-Unsubscribe-Post` are on the whitelist, which is
what would matter if reminders (`FR-010`) are ever unparked:

```typescript
await env.EMAIL.send({
  to: "user@example.com",
  from: "glosowanie@<domain>",
  subject: "…",
  html: "…",
  headers: {
    "List-Unsubscribe": "<https://…/unsubscribe?id=abc123>",
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    "X-Resolution-Id": "…",
  },
});
```

`From`, `To` and friends must be set via the dedicated fields, not `headers` — doing
otherwise raises `E_HEADER_USE_API_FIELD`.

### Legacy `EmailMessage` API

Still supported, not needed. Recorded so nobody reintroduces it from an older tutorial:

```typescript
import { EmailMessage } from "cloudflare:email";
import { createMimeMessage } from "mimetext";
// … msg.asRaw() → new EmailMessage(from, to, raw)
```

Requires `npm install mimetext` and `nodejs_compat` (we already have the flag). Use the
structured `send()` form instead.

---

## 6. Errors

Binding errors are thrown as `Error` objects with a string `.code` and `.message`. (The REST
API returns numeric Cloudflare API codes instead — different surface, do not mix.)

```typescript
try {
  const response = await env.EMAIL.send({ /* … */ });
} catch (error) {
  console.error(`Failed: ${error.code} — ${error.message}`);
}
```

| Code | Meaning | Retry? |
| --- | --- | --- |
| `E_VALIDATION_ERROR` | Invalid payload | No — fix the request |
| `E_FIELD_MISSING` | Missing `to` / `from` / `subject` | No |
| `E_SENDER_NOT_VERIFIED` | Domain not onboarded | No — finish §1 |
| `E_SENDER_DOMAIN_NOT_AVAILABLE` | Domain unavailable for sending | No — finish §1 |
| `E_RECIPIENT_NOT_ALLOWED` | Not in `allowed_destination_addresses` | No |
| `E_RECIPIENT_SUPPRESSED` | Address bounced or reported spam | No — surface to the administrator |
| `E_TOO_MANY_RECIPIENTS` | >50 combined to/cc/bcc | No — split |
| `E_CONTENT_TOO_LARGE` | >25 MiB | No |
| `E_RATE_LIMIT_EXCEEDED` | Rate limited | **Yes** — exponential backoff |
| `E_DAILY_LIMIT_EXCEEDED` | Daily quota reached | No — wait, or request an increase |
| `E_DELIVERY_FAILED` | SMTP delivery failure | Yes if transient |
| `E_INTERNAL_SERVER_ERROR` | Service unavailable | **Yes** — exponential backoff |
| `E_HEADER_NOT_ALLOWED` | Header off the whitelist | No |
| `E_HEADER_USE_API_FIELD` | Use the dedicated field, not `headers` | No |
| `E_HEADER_VALUE_INVALID` / `_TOO_LONG` | Malformed / >2,048 bytes | No |
| `E_HEADER_NAME_INVALID` | Bad characters, or >100 bytes | No |
| `E_HEADERS_TOO_LARGE` / `_TOO_MANY` | >16 KB total / >20 non-`X-` headers | No |

Cloudflare maintains the **suppression list** itself, so `E_RECIPIENT_SUPPRESSED` is the
signal that an owner has to be reached on the paper channel — which the PRD already allows
as a parallel route.

---

## 7. Local development

```jsonc
{ "send_email": [{ "name": "EMAIL", "remote": true }] }
```

```bash
npx wrangler dev
```

`"remote": true` proxies sends to the real service during local dev — **real emails go out**,
so use only inboxes you control. Cloudflare's docs say to remove the flag before deploying.

Note the trap this creates for `F-02`: a passing local run with `remote: true` proves the
account and domain are fine, but it does **not** prove the deployed Worker resolves the
binding. `F-02`'s whole value is the send from production. Do both, in that order.

---

## 8. Still undocumented after retrieval

- **The daily send quota.** `E_DAILY_LIMIT_EXCEEDED` is a documented error code; the number
  behind it is still not in the docs. **Decision 2026-08-01: the PoC ceiling is 100 messages
  per day.** See §9 — this bounds the question rather than answering it, and one cheap check
  remains open (is Cloudflare's own quota ≥ 100?).
- **Whether `EMAIL.send()` counts against the per-request subrequest limit.** Unconfirmed in
  the docs, and it decides whether `S-04`'s 70-message fanout fits one Worker invocation.
  Carried into `S-04`; see `research.md` §3.
- **No batch endpoint and no idempotency key** — confirmed absent, not merely undocumented.
  `S-04` therefore needs per-lokal send state in Postgres and must resume rather than restart.

---

## 9. PoC scale — 100 messages/day, building of 70 lokale (decided 2026-08-01)

**These are PoC figures, chosen to stay out of the way.** They are sized so that nothing in
`F-02` or `S-04` has to be built around a quota. Treat them as headroom, not as a budget to
optimise against.

**The daily figure is ours, not Cloudflare's.** Their quota is not configurable by us and its
value is undocumented; `wrangler` exposes no command to read or raise it. So 100/day is two
things at once:

1. **A PoC ceiling** — the volume we plan the fanout around.
2. **An assumption** — that Cloudflare's actual quota is *at least* 100. If theirs is lower,
   ours is fiction and `S-04` meets `E_DAILY_LIMIT_EXCEEDED` regardless.

This does not close the unknown, it **bounds** it: the question drops from "what is the
limit?" (needs support) to "is the limit ≥ 100?" (one dashboard page). Answer it inside
`F-02`, while the account is already open — Dashboard → Email Sending, or
`GET /accounts/{account_id}/email/sending/limits`. This is the one item here that can still
bite, and it costs a minute to check.

### What the two numbers cover

`F-02` sends one message, so none of this constrains this change. It shapes `S-04`.

**The PoC building is 70 lokale.** Earlier documents plan around 180–200 —
`infrastructure.md`'s pre-mortem and dissent D3 — and those are dated records of reasoning,
deliberately left as written. For anything planned from here, the working figure is 70.

One building's fanout is 70 sends against a 100/day ceiling: **links go out in one day, with
30 messages spare.** The spare is the point — it absorbs retries after a transient
`E_DELIVERY_FAILED`, a lokal added late, and a re-run, without anyone having to think about
the cap.

The one case that still exceeds it is a full reminder round (`FR-010`) fired on the same day
as the fanout. Reminders are nice-to-have, unparked later, and naturally land on a different
day — so this is a note, not a constraint.

**No daily counter is needed for the PoC.** Handling `E_DAILY_LIMIT_EXCEEDED` as one row in
the error table (§6) is enough — it is the one code that should surface to the administrator
rather than be retried. Metering our own sends becomes worth building when a real building
exceeds the ceiling, not before.

### What is genuinely unresolved

Two things survive the generous numbers, both about the runtime rather than the quota:

- **Whether 70 `EMAIL.send()` calls fit one Worker invocation.** Nothing now forces the
  fanout across days, so the per-request subrequest limit is the binding question — 70
  sequential binding calls inside one request, on a runtime scoped to that request. Still
  unconfirmed in the docs (§8), still the first thing to settle when `S-04` starts.
- **Resumability, unchanged.** Cloudflare gives no batch endpoint and no idempotency key, so
  per-lokal send state in Postgres is required regardless of any cap (§8, `research.md` §3) —
  a re-run must not send a second link for the same resolution. That requirement never came
  from the daily limit, so raising the limit does not touch it. It is also not extra work:
  `S-06` needs the same per-lokal records for the audit trail.

Helpful here: `FR-007` gives the vote no deadline, so even if the fanout does end up split
across requests or days, a delayed link delays the tally without invalidating it.

---

## Sources

Retrieved 2026-08-01 via Context7 (`ctx7`) and the bundled `cloudflare-email-service` skill.

- `/websites/developers_cloudflare_email-service` — binding config, `send()`, headers, error
  codes, local development
- `/withastro/docs` — `cloudflare:workers` env import, `cfContext`, `wrangler types` typing
  guidance for the Cloudflare adapter
- https://developers.cloudflare.com/email-service/api/send-emails/workers-api
- https://developers.cloudflare.com/email-service/local-development/sending
- https://developers.cloudflare.com/email-service/reference/headers/
- https://developers.cloudflare.com/email-service/get-started/send-emails
- https://github.com/withastro/docs/blob/main/src/content/docs/en/guides/integrations-guide/cloudflare.mdx
