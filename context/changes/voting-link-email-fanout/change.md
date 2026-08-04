---
change_id: voting-link-email-fanout
title: Rozesłanie indywidualnych linków do głosowania e-mailem (S-04)
status: done
created: 2026-08-03
updated: 2026-08-04
archived_at: null
---

## Notes

Roadmap slice `S-04`. Planned 2026-08-03 against `S-02`'s plan rather than against delivered
code — `resolution-with-voting-links` was still `proposed` — so `plan.md` opens with a Phase 0
gate that verifies the inherited schema, token format and screens before anything is built on
them.

**Done 2026-08-04.** Shipped in PR #29. An administrator presses _Roześlij linki_ on an open
resolution and every owner with an e-mail address receives one message carrying the resolution's
full text and their own voting link. Pressing again resumes, sending only to owners not yet
reached.

The Phase 0 gate paid for itself. `S-02` and `S-03` had both shipped in the meantime, and
`20260802214500` had revoked `select` on `voting_links` in between — so the plan as written
described a fanout that **could not read a token** and four columns that would have been
**invisible to the page**. Both were caught before a line of schema was written; the fixes are
`public.unsent_voting_links(uuid)` and an extension of the column-level grant.

Verified live on production the same day against a test building with inboxes we control: three
owners, three messages, ~2 s per send; an owner holding two lokale received exactly one message
at her summed 40,43%; a second press sent nothing; and the `E_BINDING_MISSING` path was walked in
both directions — recorded per owner, rendered in Polish, then cleared by the resume.

Two costs accepted knowingly, both recorded in `plan.md` under **Phase 4 Findings**: the test
building and its three resolutions are permanent (`EM009` refuses to delete a non-draft
resolution), and three unintended real messages went out during the first `4.6` attempt because
`wrangler deploy` reads the adapter's generated config, not `wrangler.jsonc` — see **F4-1**, which
is the durable lesson from this slice.
