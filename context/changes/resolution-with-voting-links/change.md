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

### Phase 5 — production and the record

**The branch was rebased onto `origin/main` before the PR (2026-08-02).** `S-07`
(`dashboard-help-section`, PRs #21/#22) landed on `main` while this slice was being reviewed, so
the branch was two commits behind. One conflict, in `src/middleware.ts`: both sides edited
`PROTECTED_ROUTES` — `S-07` appended `/help`, this slice added the comment explaining why `/vote`
is **absent**. Resolved by keeping both. The rebase rewrote every commit hash, so the SHAs in the
`## Progress` section of `plan.md` were rewritten with it: `c34888c → 8ae9ba0`, `1e16ab1 →
80cb479`, `a1e4439 → 6ca7e3d`, `f4c77d7 → 4ec1bbf`. The pre-rebase hashes exist nowhere reachable
and are recorded here only so a reader who meets them in an older document can map them.

**Both migrations applied to production before the merge (2026-08-02).** `npx supabase db push`
against project `swsvohyahbamfonekvaa` applied `20260802181500_create_resolutions_and_voting_links`
and `20260802214500_restrict_voting_link_token_select`, in that order, and `migration list --linked`
now shows both in the Remote column. This is the ordering the plan insists on and the reason it
does: reversed, the merge would have deployed a page calling `resolve_voting_link` before the
function existed. Forward-only — `wrangler rollback` reverts code, never schema. Residual **G14**
(no migration history in CI) stays open.

Checked against **production** PostgREST afterwards, as `anon`, rather than assumed from a clean
`db push`:

| probe                                            | result                              |
| ------------------------------------------------ | ----------------------------------- |
| `?select=token` on `voting_links`                 | `401` / `42501 permission denied`    |
| `?select=owner_id` on `voting_links`              | `200`, `[]` — grant present, RLS denies rows |
| `rpc/resolve_voting_link` with a made-up token    | `[]` — callable by `anon`, reveals nothing |
| `?select=id` on `resolutions`                     | `200`, `[]`                          |

The first row is the one worth keeping: the column-level revoke is live on production, so a future
`.select("…, token")` fails at the database there too, not only locally.

**Deployed 2026-08-02 by merging PR #23** (squash). `ci` green on the PR in 59s; `deploy.yml` green
in 1m19s including its `/api/health` assertion, which returned `{"status":"ok","email":"ok"}` at
`20:16:24Z`. Note the standing caveat from `CLAUDE.md`: Workers Builds deploys the same commit
seconds later, so a green assertion certifies the version live when it ran, not necessarily the one
serving traffic afterwards.

**The live walkthrough needed a building that did not exist.** Production held one building
(`Test`) with **no registry**, and a registry import is one-shot per building (`EM002`). Rather than
spend that building's only import, a second building — `S-02 smoke test`, Testowa 1, Warszawa —
was created on production and given a three-lokal registry: 50,00 / 30,00 / 20,00 m², shares
50,00% / 30,00% / 20,00%, with the third owner (`Ewa Bezmailowa`) deliberately carrying **no**
e-mail address. Nothing was sent to anyone: no fanout exists until `S-04`, and the two addresses are
`@example.com`. The building is still there, labelled as what it is.

What the live Worker did, all as `curl` against
`https://estate-manager.estate-manager.workers.dev`:

| step                                              | result on production                                            |
| ------------------------------------------------- | --------------------------------------------------------------- |
| create resolution `1/2026`                        | `302` to the resolution page                                     |
| create the same number again                      | `302` back with `Uchwała o tym numerze już istnieje w tym budynku.` |
| _Uruchom głosowanie_                              | `302`; status **Głosowanie otwarte**, `opened_at` rendered        |
| press it a second time                            | `302`, no error, no duplicate links                              |
| owners with a link                                | 2 — Anna 50,00%, Jan 30,00%, both _Wystawiony_                    |
| owner without an e-mail                           | Ewa listed in the amber **Właściciele bez linku** panel, 20,00%   |
| **43-char token strings in the page HTML**        | **none**; `/vote/` appears `0` times                              |

The last row is the one this slice exists to be able to claim, and it is now claimed against
production rather than against a local stack.

**The unauthenticated path, no session, on production.** Three bad tokens — a 43-character made-up
one, a five-character truncated one, and `%20` — each returned `200` and **exactly 989 bytes**, the
identical neutral page (_"Ten link jest niepoprawny albo głosowanie nie zostało jeszcze
uruchomione."_), `lang="pl"`, zero outbound links. Byte-identical is stronger than the plan asked
for: there is nothing in a hit-versus-miss comparison to measure. `/vote/../../buildings` is worth
knowing about — it comes back `302` to `/auth/signin`, because path normalisation resolves it to
`/buildings` before routing ever sees `/vote`, so it is the protected-route gate answering, not a
leak. `/buildings` without a session still redirects to `/auth/signin`.

Re-probed as `anon` **after** real rows existed, since an empty table proves less than a populated
one:

| probe                                | result                              |
| ------------------------------------ | ----------------------------------- |
| `resolutions?select=id`              | `[]`                                |
| `voting_links?select=owner_id`       | `[]`                                |
| `voting_links?select=token`          | `42501 permission denied for table` |
| `voting_links?select=*`              | `42501`                             |
| `owners?select=email`                | `[]`                                |
| `POST resolutions`                   | `401`                               |

**A real token, read from the database, renders on production.** Both live links were fetched with
`curl` — no cookies, no session, nothing but the URL — against
`https://estate-manager.estate-manager.workers.dev/vote/<token>`:

| link | bytes | shows                                                   | does **not** show          |
| ---- | ----- | ------------------------------------------------------- | -------------------------- |
| 1    | 1801  | `1/2026`, `S-02 smoke test`, `Anna Testowa`, `50,00`     | `Jan Testowy`, any token   |
| 2    | 1800  | `1/2026`, `S-02 smoke test`, `Jan Testowy`, `30,00`      | `Anna Testowa`, any token  |
| bogus | 989  | the neutral page                                         | everything                 |

Each reader sees their own name and their own share and nobody else's, and neither page echoes the
token back into the HTML — `[A-Za-z0-9_-]{43}` matches **zero** times in both, `/vote/` zero times.
So a screenshot of the voting page is not a copy of the credential; only the address bar is.

**The zero-rows error model cost an evening, and that is the honest entry.** Before the above, a
43-character token believed to be genuine rendered the neutral page, and it read as a live defect in
the flagship flow. It was not: comparing that string against the stored `voting_links.token` values
byte-for-byte — through `service_role`, the only reader the column grant leaves — showed it matched
**neither** of the two rows. The resolver had been correct at every step; an unknown token returns
`[]` by design. What made the diagnosis expensive is exactly the property the slice is built to
have: a hit and a miss are indistinguishable, so the system cannot tell you "that token is wrong",
and no amount of staring at the page narrows it down. Ruling out `security definer`, `force row
level security`, RLS, PostgREST schema cache and project identity all came before the one check
that settled it in a second. **The lesson for `S-03` and `S-04`: when a link "does not work", the
first move is to compare the token to the stored value, not to inspect the read path.** Do not add
a diagnostic that distinguishes the two cases in the response — that is the property, not a bug —
but an administrator-side view that answers "is this token one of mine?" would be a legitimate
feature, since the administrator may see their own building's links.

**`status:` stays `impl_reviewed`, not `done`.** Phase 5's contract in `plan.md` says
`status: done`, but no change in this repository has ever carried that value — `building-create`,
`building-units-import` and `dashboard-help-section` all shipped to production and all sit at
`impl_reviewed`, because `/10x-archive` is what stamps a change closed. Following the plan
literally here would have made this the only change with a status nothing else uses.

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
