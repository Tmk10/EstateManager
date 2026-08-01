---
change_id: transactional-mail-channel
title: Connect a transactional mail provider and send the first real message from the Worker
status: researching
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
