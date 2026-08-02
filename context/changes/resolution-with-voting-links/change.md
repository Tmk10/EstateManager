---
change_id: resolution-with-voting-links
title: Resolution with voting links
status: impl_reviewed
created: 2026-08-02
updated: 2026-08-02
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

### Triage of `reviews/impl-review-phase-3-4.md`

**F3 — voting tokens are persisted by Workers Logs (2026-08-02).** Recorded rather than fixed.
`wrangler.jsonc` enables observability, Workers Logs stores each invocation's request URL, and the
token is in the path — so every voting link an owner opens is retained for up to 7 days (product
maximum, verified against Cloudflare's Workers Logs limits) and readable from the dashboard. The
plan's guardrail "the token must never reach a log line" was written as a property of the system;
it is only a property of our source, which does honour it. Three options were weighed:

- disabling observability would make the claim literally true but costs the log store that
  `/api/health` failures are diagnosed from — rejected;
- moving the token out of the URL path is the real fix and is schema-sized — deferred, and belongs
  in an `S-03`-or-later plan, not in Phase 5 of this change;
- recording the reality — **chosen**.

Consequence: the comment headers of `src/lib/voting-token.ts` and
`src/pages/api/buildings/[id]/resolutions/[resolutionId]/open.ts` now scope the rule to this
repository's code and name the platform exception, and `CLAUDE.md` carries the fact in
"Current state". Blast radius today is bounded: the administrator who holds the Cloudflare dashboard
already sees every token of their buildings as plain text on the resolution page (finding F10).

**F4 — no `Cache-Control` / `X-Robots-Tag` on `/vote/<token>` (2026-08-02).** Skipped at triage.
The page ships with no cache or indexing headers. Consciously accepted, not overlooked. Whoever
revisits it must set the headers **before** the `view` branch: headers that differ between a real
token and a made-up one are as observable as differing bodies, and would break the page's first
stated property.

**F5 — `opened_at` is written from the Worker's clock, not from `now()` (2026-08-02).** Code left
as it stands; recorded here so the next slice plans against the real behaviour rather than against
this plan's wording. The plan says `opened_at = now()`. The implementation
(`src/pages/api/buildings/[id]/resolutions/[resolutionId]/open.ts`, step 5) writes
`new Date().toISOString()`, because supabase-js posts **values, not SQL expressions** — `now()` was
only reachable through the RPC this slice deliberately declined, and re-introducing an RPC to gain
a few milliseconds of accuracy would have traded away the reason the two-query design was chosen.

What that means concretely: `resolutions.opened_at` is the **Worker's** clock, every other
timestamp in the schema (`created_at` defaults) is the **database's**. Nothing observes the
difference today — `FR-007` gives the vote no end date, so the value is displayed and never
compared. It stops being harmless the moment anything differences `opened_at` against a
database-generated timestamp: a voting deadline, or `S-05` ordering votes against the moment the
vote opened. Two clocks, and the skew surfaces as a tallying or eligibility bug far from this line.
`S-05` should either read `opened_at` as approximate, or move the write into a database function
and make the column authoritative before relying on it.

**F6 — `status` was projected and never read (2026-08-02).** Dropped from the projection rather
than branched on. Step 5's `.eq("status", "draft")` is the single place the draft → open
transition is enforced; an early branch would have been a second copy of that rule sitting where
it cannot be the deciding check, free to drift out of agreement with the one that gates the write.

**F8 — the create endpoint does not re-check the registry (2026-08-02).** No check added; the
reasoning is now a comment in `resolutions/index.ts`. `units.ts` re-parses and recomputes because
it guards arithmetic that must hold on write. Here the worst a direct POST can produce is an inert
**draft** in a building with no owners — nothing sent, no link, nobody able to vote — and the
guarantee that matters is enforced in `open.ts` step 2, where the status actually flips.

**F10 — the administrator held every voting token. Redesigned, 2026-08-02.** This is the one
finding that changed the build rather than the record, and it changed what the slice delivers.

The finding was that `voting_links_*_authenticated` is `using (true)` while the resolution page
printed every token in the building as plain text — so once `S-03` stores votes, any administrator
account could cast any owner's vote. The decision taken was broader than the finding: **the
administrator never sees a voting link at all.** A token is a bearer credential; rendering a
building's worth of them into a browser makes that browser a second copy of every voter's
identity, and no amount of care about logs or `Referer` headers compensates for putting the
credential on screen.

What changed:

- `src/pages/buildings/[id]/resolutions/[resolutionId].astro` reads `select("owner_id")` from
  `voting_links` instead of `select("owner_id, token")`. `OwnerRow.token: string | null` became
  `hasLink: boolean`; the table's last column shows _Wystawiony_ instead of a URL; a sentence
  above the table tells the administrator the links are in the database and go only to the owner.
- `src/components/resolutions/CopyLinkButton.tsx` **deleted**. The slice now ships no `.tsx` and
  no client island, which also disposes of finding F9 (~70 `client:load` roots).
- New migration `supabase/migrations/20260802214500_restrict_voting_link_token_select.sql`:
  table-level `select` revoked from `authenticated` **and** `anon`, then re-granted column by
  column, every column except `token`. Written that way because a column-level `revoke` does
  nothing while a table-level grant stands — the table grant has to go first. This is what makes
  the rule survive a future `.select("…, token")`, which would otherwise compile and run fine:
  supabase-js does not type-check projection strings.

Checked rather than assumed, and one assumption was wrong: `anon` held a **table-level select
grant** on `voting_links` all along (`has_column_privilege('anon', …, 'token', 'select')` returned
true before the migration). Only the `using (false)` RLS policy stood between an anonymous caller
and a table of bearer credentials — one policy edit away from exposure. The migration closes the
grant too, so that edit would no longer be sufficient.

Verified through PostgREST against the local stack after `db reset`, not by reading `pg_policy`:

| probe                                                   | result                          |
| ------------------------------------------------------- | ------------------------------- |
| `authenticated` `?select=token`                          | `403` / `42501 permission denied` |
| `authenticated` `?select=*`                              | `403` / `42501` — see note below |
| `authenticated` `?select=owner_id`                       | `200`, rows returned            |
| `authenticated` upsert with `return=minimal` (`open.ts`) | `201`                           |
| `authenticated` `count=exact` head request (`open.ts`)   | `200`, `Content-Range: 0-1/2`   |
| `anon` → `resolve_voting_link` with a real token          | resolves, one row               |
| `anon` → `resolve_voting_link` with a made-up token        | `[]`                            |

Note carried forward: `select=*` on `voting_links` is now an error for `authenticated`. Any future
projection has to name its columns.

**What this deliberately does not fix.** `S-04` must read tokens to send them, through a
`security definer` function granted to `authenticated` — which an administrator can call directly
via PostgREST. The surface narrows from every row of a table to one named, reviewable function; it
does not become impossible for a determined administrator to obtain tokens. That needs the v2
roles model or a service-role separation this repository deliberately does not have. Recorded in
`roadmap.md` under `S-04`. F10's second half — no trigger refuses `update voting_links set
owner_id = …`, and `delete from resolutions` on an open resolution cascades its links away — is
**untouched** and remains a prerequisite for `S-03`.

**Consequence for the slice.** `S-02` now ships with no delivery path: until `S-04`, a link
reaches nobody except by reading the database. Accepted deliberately — `S-02` is an intermediate
step toward `S-03` and `S-04`, and the links existing in the database is what it owes them.
`roadmap.md`'s `S-02` entry claimed the opposite (that the slice existed so `S-03` could be walked
on one hand-passed link) and has been corrected; `plan.md` carries an amendment block at the top.
