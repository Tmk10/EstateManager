# Voting Link Email Fanout — Plan Brief

> Full plan: `context/changes/voting-link-email-fanout/plan.md`

## What & Why

Roadmap slice `S-04`. An administrator presses one button and every owner in the building who
has an e-mail address receives the resolution's full text plus their own individual voting link.
Until this exists, links have to be carried by hand, and the PRD's success criterion — over 50%
of all shares voting "za" through the electronic channel alone — cannot be measured at all.

## Starting Point

`F-02` proved one message can leave the deployed Worker through Cloudflare's native `send_email`
binding, and deliberately stopped there: `src/lib/email.ts:50-55` says a retry and
error-classification table would be unproven on a single send, and leaves both to this slice.
The registry already anticipated the fanout — `public.owners` is one row per person keyed by
e-mail, so an owner holding two units gets one message, and `owners.email` is nullable because
an owner without an address keeps their voting weight and loses only the link.

**`S-02` is planned but not implemented.** No `resolutions` table, no `voting_links` table, no
`/vote/<token>` route. This plan is written against `S-02`'s post-review plan as a contract, and
carries a Phase 0 that verifies the delivered code matches before anything is built on it.

## Desired End State

A signed-in administrator opens a resolution whose vote is running, sees how many owners are yet
to be contacted, presses _Roześlij linki_, waits while the messages go out, and then reads —
in the same table that shows the links — who received theirs and who did not, with a Polish
sentence for each failure. Pressing the button again sends only to the owners still missing a
message, so an interrupted run is repaired by repeating it and nobody ever receives two links.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Dependency on unbuilt `S-02` | Plan against its plan, plus a Phase 0 pre-flight gate | Keeps a complete plan available now while turning the paper contract into something the implementer checks rather than assumes. |
| Execution model | Synchronous — the administrator waits, and is told so | `waitUntil`'s 30-second cap may not cover 70 sends and hides failures until a reload; the wait is made safe by writing state per owner, not by shortening the run. |
| Send state | Four columns on `voting_links`, status **derived** not stored | The right row already exists with the right uniqueness; deriving status from the timestamps avoids a second field to keep consistent. |
| Second press | Resume — only owners with no successful send | Cloudflare offers no idempotency key, so a resend guarantee has to live in Postgres; this is also the retry mechanism. |
| Retry | None inside the run | An immediate retry is the wrong answer to `E_RATE_LIMIT_EXCEEDED`, and backoff sleeps would extend a request already being waited on. |
| Owners with no address | Listed separately, named as the paper channel, never counted as failures | Matches the PRD's explicit parallel paper route; a silent omission would read as a bug. |
| Trigger | A separate button, not `S-02`'s launch action | Keeps an irreversible 30-second external side effect off the launch endpoint and lets links be reviewed before anything leaves the building. |
| Message content | Full resolution text plus the link | The `EM006` freeze makes the text immutable once the vote is open, so the usual "two copies can diverge" objection cannot occur here. |
| Reporting | Per-owner status column in the links table | "Who got their link" is the only question this slice exists to answer, and `E_RECIPIENT_SUPPRESSED` then points at the person to phone. |
| Missing `EMAIL` binding | Recorded per owner like any other failure, button not gated | Uniform with every other failure and cleared by the resume — and it is the only failure this slice can produce on demand. |
| Production verification | Small test building, inboxes we control | Exercises the real binding end to end for a handful of messages against a 200/day quota. |

## Scope

**In scope:** send-state columns and their migration; a dependency-free Polish message composer
with HTML escaping; `sendVotingLinkEmail` in `src/lib/email.ts`; the Cloudflare error-code →
Polish map; the fanout endpoint with resume semantics; the button, its wait warning and the
per-owner status column; a live fanout on production against controlled inboxes.

**Out of scope:** reminders (`FR-010`); in-run retry or backoff; a per-owner "send again"
button; a daily send counter; making `/api/health` fail on a missing binding; deliverability
work; sending as part of `S-02`'s launch action; anything belonging to `S-03`, `S-05`, `S-06`.

## Architecture / Approach

```
[resolution page]  --POST-->  /api/buildings/<id>/resolutions/<rid>/send
                                   |
                                   |  select voting_links where sent_at is null
                                   |      join owners (full_name, email)
                                   v
                            for each owner, sequentially:
                              buildVotingLinkMessage()   (src/lib/voting-link-email.ts — no imports)
                              sendVotingLinkEmail()      (src/lib/email.ts — the only cloudflare:workers importer)
                              update that row's send state   <-- per owner, never batched
                                   |
                                   v
                            redirect with counts only (no tokens, no addresses)
```

Sequential and per-owner-write are the two load-bearing choices: concurrency risks
`E_RATE_LIMIT_EXCEEDED` turning a slow success into a partial failure, and batching the writes
would make an interrupted run re-send everything it had already delivered.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 0. Pre-flight | Confirmation that `S-02` shipped the assumed schema, token format and screens | `S-02` not built at all, or built differently — the gate is the mitigation |
| 1. Send state | Four columns, one check, one partial index on `voting_links` | Widening what `anon` can read; checked by re-probing `resolve_voting_link` |
| 2. The message | Dependency-free composer + `sendVotingLinkEmail` + Polish error map | Unescaped administrator text reaching a mail client as markup |
| 3. The fanout | Endpoint, button with wait warning, per-owner status column | Resume being wrong — the one bug that mails two links to one owner |
| 4. Production | Migration, PR, live fanout to controlled inboxes, records updated | Real Cloudflare failure codes ship unexercised (stated as a residual) |

**Prerequisites:** `S-02` implemented and merged; `F-02`'s domain and Workers Paid plan (already
in place); a linked Supabase checkout for `db push`; 3–5 inboxes you control.
**Estimated effort:** ~3–4 sessions across five phases, of which Phase 0 is minutes if `S-02`
landed as planned.

## Open Risks & Assumptions

- **The whole plan assumes `S-02`'s plan is what gets built.** Phase 0 catches drift, but drift
  in the link-per-owner rule or in whether links exist for owners without an address would
  require revising Phase 3's resume query, not just noting a difference.
- **Cloudflare's own failure codes cannot be produced on demand**, so their Polish sentences
  ship unexercised. The `E_BINDING_MISSING` walk-through proves everything around them —
  record, continue, render, resume — and the first real failure is the test.
- **The wall clock is estimated, not measured.** Per-send latency against the beta binding is
  unknown; if a 70-owner run turns out to exceed what a browser will hold, the answer is
  chunking (already sketched as an alternative), not concurrency.
- **The production test building is permanent.** No screen deletes a building and the registry
  is static in v1.

## Success Criteria (Summary)

- An administrator presses one button and every owner with an address receives exactly one
  message carrying the resolution and their own link.
- The links table answers "who got theirs" per owner, in Polish, including for failures.
- A second press — or a press after an interrupted run — sends only to owners still missing a
  message, and never a second link to anyone.
