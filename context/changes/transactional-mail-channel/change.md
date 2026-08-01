---
change_id: transactional-mail-channel
title: Connect a transactional mail provider and send the first real message from the Worker
status: implementing
created: 2026-08-01
updated: 2026-08-01
archived_at: null
---

## Notes

Roadmap item `F-02` from `context/foundation/roadmap.md`. Foundation, not a slice — it
unlocks `S-04` (voting-link fanout) and exists to remove the one unknown that could make
`S-04` unbuildable: whether mail can be sent from the workerd runtime at all, and through
which interface.

Scope stays one message, not a fanout.

**Provider: Cloudflare Email Service**, via the native Workers `send_email` binding —
decided 2026-08-01, rationale in `research.md`. Resend was the first recommendation and is
kept there in full as the documented fallback (`research.md` §7).

Two files, different jobs: `research.md` is the **decision record**, `docs-cloudflare-email.md`
is the retrieved **API reference** (setup, binding, `send()`, error codes, local dev). The
reference was retrieved after the decision, so where the two overlap it wins. Its §3 carries
the finding that would otherwise break the implementation: on Astro 6 with
`@astrojs/cloudflare` 13, `Astro.locals.runtime.env` is gone — bindings come from
`import { env } from "cloudflare:workers"`.

Three things this decision changes about `F-02` as the roadmap describes it:

1. **The outcome text is now wrong.** `roadmap.md` says the message goes out "na domenie
   testowej dostawcy". Cloudflare has no test domain — it sends from a domain we own, so
   `F-02` now includes buying it. Amend the roadmap.
2. **It costs money.** Email Sending requires the Workers Paid plan ($5/mo); we are on
   Workers Free. `infrastructure.md` independently argues for Paid because of the 10 ms CPU
   ceiling, so the charge is not attributable to email alone.
3. **It is beta.** Accepted knowingly on the one channel the product thesis depends on;
   `research.md` §7 records what would send us back to Resend.

Manual prerequisites, like the Supabase dashboard step in `F-01` — this repo does not
automate them: buy the domain in Cloudflare Registrar, upgrade to Workers Paid, run
`npx wrangler email sending enable <domain>`, add the `send_email` binding to
`wrangler.jsonc`, regenerate types.

Carried into `S-04` and worth knowing now: Cloudflare has **no batch endpoint and no
idempotency key**, so the fanout is N individual sends plus per-lokal send state in Postgres.
Whether that many binding calls fit one Worker invocation is unverified and is the first
thing to settle when `S-04` starts.

**PoC scale, decided 2026-08-01: 100 messages/day, building of 70 lokale.** Sized with slack
on purpose, so neither `F-02` nor `S-04` has to be built around a quota. One building's
fanout goes out in a day with 30 messages spare — enough for retries, a late lokal, or a
re-run. **No daily counter is needed for the PoC**; handling `E_DAILY_LIMIT_EXCEEDED` as an
administrator-visible error is enough.

The daily figure is ours, not Cloudflare's — their quota is undocumented and not settable, so
it carries the assumption that theirs is at least 100. That is the one item here that can
still bite, and it costs a minute: `F-02` should check it while the account is open
(Dashboard → Email Sending, or `GET /accounts/{account_id}/email/sending/limits`). Full
reasoning: `docs-cloudflare-email.md` §9.

Note that earlier documents plan around 180–200 lokale — `infrastructure.md`'s pre-mortem and
dissent D3. Those are dated records and stay as written; 70 is the figure for new planning.

## Implementation record

### Phase 1 — prerequisites and CLI channel proof (2026-08-01)

| Fact | Value |
| --- | --- |
| Cloudflare account | `tomek.maq@gmail.com`, id `72ac380fcf7d9f647d667e0573b46c10` |
| Plan | **Workers Paid** — upgraded 2026-08-01, the project's first recurring cost ($5/mo) |
| Sending domain | `estatemanager.dev` |
| Sending identity | `glosowanie@estatemanager.dev` |
| Email Sending enabled | yes — zone tag `4c36269602024d25960b7cfb850ff916`, created 2026-08-01T19:34:11Z |
| DKIM selector | `cf-bounce` |
| Return-path domain | `cf-bounce.estatemanager.dev` |

`wrangler email sending dns get` confirms SPF (`v=spf1 include:_spf.mx.cloudflare.net ~all` on
`cf-bounce`), DKIM (`cf-bounce._domainkey`), DMARC (`v=DMARC1; p=reject;`) and three bounce MX
records pointing at `route{1,2,3}.mx.cloudflare.net`.

**CLI proof send.** `npx wrangler email sending send --from glosowanie@estatemanager.dev --to
<inbox> --subject "EstateManager — test kanału (CLI)"` exited 0 and the message **arrived**.
The domain end of the setup is therefore proven before any application code exists — a later
failure from the deployed Worker cannot be the domain.

**Daily sending limit: 200 messages/day** (read from the dashboard, 2026-08-01). This closes
the one open item from `docs-cloudflare-email.md` §9: the PoC ceiling of 100/day carried the
assumption that Cloudflare's own quota is at least 100, and it is — with 2× headroom. One
building of 70 lokale fits comfortably, and a full `FR-010` reminder round fired on the same
day as the fanout (140 messages) now fits too, which the 100/day figure did not cover.

`wrangler` does not expose the quota: `wrangler email sending settings <domain>` reports only
enabled/tag/DKIM selector/return-path. The number is dashboard-only
(Compute & AI → Email Service → Email Sending).

### Phase 3 — an `Origin` header is required to curl any form endpoint

Not anticipated by the plan, and it corrects the plan's own curl recipes.

Astro's built-in CSRF protection (`security.checkOrigin`, **on by default** and not configured
in `astro.config.mjs`) rejects every non-GET **form** submission that arrives without an
`Origin` header, with `403 Cross-site POST form submissions are forbidden`. It runs *before*
middleware, so the 403 pre-empts the auth gate entirely.

Consequence: `curl -X POST … -d "…"` against `/api/email/test` **or** `/api/auth/signin`
returns `403`, not the expected `302`/`200`. Every curl recipe in this change needs

```bash
-H "Origin: <the same origin being called>"
```

With the header supplied, the auth gate behaves exactly as designed: an unauthenticated
`POST /api/email/test` returns `302` to `/auth/signin`.

This is not specific to `F-02` — it applies to any form endpoint in this repo, which is why it
is written into `README.md` rather than left here.
