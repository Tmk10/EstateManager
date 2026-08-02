<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Resolution with Voting Links

- **Plan**: `context/changes/resolution-with-voting-links/plan.md`
- **Scope**: Phases 3 and 4 of 5
- **Date**: 2026-08-02
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 6 observations
- **Commits reviewed**: `a1e4439` (p3), `f4c77d7` (p4) — 12 files, +1214 / −25

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

Success criteria re-run at review time: `npx astro sync && npm run lint && npm run build` clean;
`grep -c '"/vote"' src/middleware.ts` → `0`; `voting-token.ts` executed directly → 200 000 tokens,
43 chars, zero collisions, zero format violations. Every Manual row marked `[x]` has observable
evidence in the transcript (PostgREST probes and rendered HTML), not a rubber stamp.

## Findings

### F1 — The "bez linku" panel asserts a reason it never checked

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence / Reliability
- **Location**: `src/pages/buildings/[id]/resolutions/[resolutionId].astro:117`, `:311-317`
- **Detail**: The plan defines the block below the table as owners **without an e-mail address**.
  The code partitions on `owner.token === null` and then prints copy asserting *"Ci właściciele nie
  mają adresu e-mail w rejestrze"*. Those are different conditions. `OwnerRow` already carries
  `email` (declared `:19`, populated `:96`), so the page can tell them apart and does not. Today the
  two coincide, so nothing is visibly wrong — but any owner who has an e-mail and no link (F2's
  truncation, a manually deleted row, a future S-04 path) is reported to the administrator as a
  registry gap. They would go and "fix" an e-mail address that is already correct, and the single
  visible symptom of *open vote, incomplete links* would be disguised as data entry.
- **Fix**: Partition on `owner.email === null`. Keep the current copy for that group; render
  "e-mail w rejestrze, brak linku" as a separate, louder block telling the administrator to press
  _Uruchom głosowanie_ again.
- **Decision**: FIXED — `[resolutionId].astro` now partitions into `ownersWithoutEmail` (token and
  e-mail both null, amber, existing copy) and `ownersMissingLink` (e-mail present, no link, red
  `role="alert"` with its own _Uruchom głosowanie_ form). A comment above the split states why the
  two must not be folded together.

### F2 — The completeness check compares two numbers from the same read

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Reliability
- **Location**: `src/pages/api/buildings/[id]/resolutions/[resolutionId]/open.ts:57-61` vs `:94-104`
- **Detail**: Step 2's owners read carries no explicit range, so Supabase's "Max rows" cap (default
  1000) truncates it silently. Step 4 then compares the true link `count` against `owners.length` —
  and `owners.length` is the truncated number. The two agree, the check passes, and step 5 opens the
  vote with the remainder holding no link. That is precisely the failure step 4 exists to catch; the
  plan's words for it are "turns *open implies a complete set of links* from an argument in this plan
  into something the code checks", and as written it does not. Theoretical at ~70 units per building.
- **Fix**: Count owners with a separate `select("id", { count: "exact", head: true })` on the same
  predicate and compare the link count against **that**, so the two sides come from different reads.
- **Decision**: FIXED — step 2 now issues the rows read and a `count: "exact", head: true` read in
  parallel, errors from either fail the same way, and step 4 compares the link count against
  `ownerCount`. The comment names the PostgREST "Max rows" cap as the reason.

### F3 — Workers Logs persist every token, which falsifies a stated invariant

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `wrangler.jsonc:14-16`; invariant claimed in `src/lib/voting-token.ts:12-14` and
  `.../open.ts:17-19`
- **Detail**: `"observability": { "enabled": true }` records each invocation's request URL. The token
  lives in the path, so every voting link an owner opens is written to Cloudflare's log store for the
  retention window and is readable by anyone with dashboard access. The application code honours the
  rule scrupulously — no `console.` in any new file, no error path interpolates a token,
  `CopyLinkButton` keeps the URL out of its failure state — and the platform undoes it underneath.
  Note the ceiling: an administrator already sees every token of their buildings on screen (F10), so
  this widens the audience to Cloudflare-dashboard holders, who here are the same person.
- **Fix**: Stop citing "the token never reaches a log line" as an established property. Record in the
  change record and in `CLAUDE.md` that Workers Logs is the one place tokens are persisted, with the
  retention window — or move the secret out of the URL path if the guardrail must hold literally
  (that is an S-03-sized change, not a Phase 5 one).
- **Decision**: ACCEPTED AS RISK, RECORDED — observability stays on; turning it off would cost the
  log store `/api/health` failures are diagnosed from, and moving the token out of the path is
  deferred to `S-03` or later as schema-sized work. Retention verified against Cloudflare's docs:
  **7 days maximum**. The comment headers of `voting-token.ts` and `open.ts` now scope the rule to
  this repository's source and name the platform exception; `CLAUDE.md` "Current state" carries the
  fact; rationale and the rejected options are in `change.md`.

### F4 — No `Cache-Control` on a page keyed by a bearer secret

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/pages/vote/[token].astro` (whole file)
- **Detail**: No `Cache-Control`, no `Referrer-Policy`, no `X-Robots-Tag` anywhere in `src/`, and the
  Cloudflare adapter adds none. This page is opened by unauthenticated readers on shared and family
  devices, usually from a mail client's in-app browser, and it renders the resolution plus the
  reader's own identity and weight.
- **Fix**: `Astro.response.headers.set("Cache-Control", "private, no-store")` and
  `X-Robots-Tag: noindex, nofollow`, set **unconditionally before the `view` branch** — headers that
  differ between hit and miss are as observable as body differences and would break the page's own
  first stated property.
- **Decision**: SKIPPED — the page ships without `Cache-Control`, `Referrer-Policy` or
  `X-Robots-Tag`. Consciously skipped at triage, not overlooked. If it is revisited, note the
  constraint above: the headers must be set before the `view` branch, or they become an oracle
  distinguishing a real token from a made-up one.

### F5 — `opened_at` is the Worker's clock, not `now()`

- **Severity**: 📋 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `src/pages/api/buildings/[id]/resolutions/[resolutionId]/open.ts:113`
- **Detail**: The plan says `opened_at = now()`; the code writes `new Date().toISOString()`. The
  reason is sound and is in the comment — supabase-js posts values, not SQL expressions, and `now()`
  was only reachable through the RPC the plan deliberately declined. Bounded to clock skew on a vote
  with no deadline (`FR-007`). It becomes load-bearing the moment S-05 or a deadline compares
  `opened_at` against a database-generated timestamp.
- **Fix**: Leave as is; note the deviation in the change record so S-05 plans against the real
  behaviour.
- **Decision**: ACCEPTED, RECORDED — code unchanged. `change.md` now states that `opened_at` is the
  Worker's clock while every other timestamp is the database's, that nothing observes the
  difference under `FR-007`, and that `S-05` must either treat the column as approximate or make it
  authoritative before differencing it against a database-generated timestamp.

### F6 — `status` is selected and never read

- **Severity**: 📋 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/pages/api/buildings/[id]/resolutions/[resolutionId]/open.ts:40`
- **Detail**: `.select("id, status")` loads a status the endpoint never branches on. Pressing open on
  an already-open resolution re-runs the owners read and the upsert, no-ops at step 5 and redirects
  as though it worked. Only reachable by direct POST or a double submit, since the button renders
  only in the draft branch — but as written the projection reads like a check that was intended and
  then dropped.
- **Fix**: Either branch on it and redirect early with a message, or drop it from the projection.
- **Decision**: FIXED — dropped from the projection (`.select("id")`), leaving step 5's
  `.eq("status", "draft")` as the single place the transition is enforced. Branching early was
  rejected as a second copy of the same guard, sitting where it could drift out of agreement with
  the one that gates the write. A comment at step 1 says so, and names the resulting behaviour: a
  press on an already-open resolution no-ops rather than being refused. `resolution` is now used
  only for the existence check — verified by grep, since this version of supabase-js does not
  type-check projection strings.

### F7 — The vote page's stated reason for avoiding `Layout.astro` is wrong

- **Severity**: 📋 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: `src/pages/vote/[token].astro:20-23`
- **Detail**: The comment says the layout's config banner "carries an external documentation link
  when Supabase is unset", implying a `Referer` leak. `src/layouts/Layout.astro:30` renders that
  anchor with `rel="noopener noreferrer"`, and `noreferrer` suppresses the `Referer` header entirely
  — that specific link could not have leaked the token. The **decision** is still right, on the
  structural argument: a page that inherits a shared layout can grow an outbound link without this
  page's author noticing. The comment argues the wrong case, and a future reader who checks it will
  conclude the deviation was unnecessary. (Incidental benefit of the deviation: `lang="pl"` instead
  of the layout's `lang="en"`.)
- **Fix**: Rewrite the comment to make the structural argument rather than the `Referer` one.
- **Decision**: SKIPPED — comment left as written. The decision it defends (no shared layout on the
  vote page) stands and is not in question; only its stated reason is inaccurate. The residual risk
  is that a reader checks the `Referer` claim, finds `rel="noopener noreferrer"` on
  `Layout.astro:30`, judges the deviation unnecessary and folds the page back into the layout —
  which would reintroduce the real hazard the deviation guards against: a shared layout can grow an
  outbound link without this page's author noticing.

### F8 — Create endpoint trusts the page's registry gate

- **Severity**: 📋 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: `src/pages/api/buildings/[id]/resolutions/index.ts`
- **Detail**: `new.astro:40-48` refuses the form when the building has no owners; the endpoint does
  not re-check. That inverts the pattern `api/buildings/[id]/units.ts:43-51` sets out explicitly —
  re-parse and recompute rather than trust anything the browser posted, with a database backstop
  behind it. Verified during Phase 3: a direct POST wrote a draft into a registry-less building.
  Consequence is mild — `open.ts:66-68` refuses later with a clear Polish message — but it should
  read as a decision, not an omission.
- **Fix**: Add the owners count check to the endpoint, or state in a comment why the UI gate suffices
  here.
- **Decision**: FIXED BY COMMENT — no check added. `resolutions/index.ts` now names the asymmetry
  with `units.ts` and argues it: what a direct POST can produce here is an inert **draft** in an
  empty building — nothing sent, no link, nobody able to vote — while `units.ts` guards arithmetic
  that must hold on write. The guarantee that matters is enforced where the status flips, in
  `open.ts` step 2, and a second copy here would sit where it cannot be the deciding check. Reads as
  a decision now rather than an omission, which was the finding.

### F9 — Up to ~70 `client:load` islands on one page

- **Severity**: 📋 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: `src/pages/buildings/[id]/resolutions/[resolutionId].astro:303`
- **Detail**: One hydration root per owner row, each pulling `lucide-react` icons. Every other island
  in the repo is one per page. The component's own doc says the URL text is the feature and the
  button the convenience, which is the argument for `client:visible` — Astro server-renders the
  island either way, so the `<code>` carrying the link stays present without JS.
- **Fix**: Change the directive to `client:visible`.
- **Decision**: MOOT — dissolved by the F10 redesign. `CopyLinkButton.tsx` is deleted and the slice
  now ships no client island at all, so there is no directive left to tune.

### F10 — The freeze and the RLS posture stop short of the token itself

- **Severity**: 📋 OBSERVATION
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: `supabase/migrations/20260802181500_create_resolutions_and_voting_links.sql:232-255`,
  `:297-336`
- **Detail**: Two related gaps, both correctly out of Phase 3/4's scope, both worth carrying into
  S-03's plan rather than rediscovering there. (a) `voting_links_*_authenticated` is `using (true)`
  and the detail page prints every token in the building as plain text. Until now the unscoped
  posture leaked owner personal data; it now hands over the credential that **is** a voter's
  identity, so once S-03 stores votes, any administrator account can cast any owner's vote in any
  building. The migration argues the case for staying unscoped coherently (`:162-172`) — the point is
  that the blast radius changed category, not that the reasoning is wrong. (b)
  `assert_resolution_frozen` fires only on `update ... resolutions`. Nothing refuses
  `update voting_links set owner_id = …` (reassigning a live token to a different person — the
  composite FK permits it within the building) and nothing refuses `delete from resolutions` on an
  open resolution, which cascades its links away. No product path does either today, but the
  migration's own argument is that "głos jest ostateczny" must not rest on the UI declining to offer
  a button.
- **Fix**: Record both as prerequisites in S-03's planning: a `before update` trigger on
  `voting_links` rejecting changes to `token` / `owner_id` / `resolution_id`, a refusal of `delete on
resolutions` while `status <> 'draft'`, and the v2 roles model treated as a hard prerequisite for a
  **second** administrator account rather than a nice-to-have.
- **Decision**: (a) FIXED BY REDESIGN, going further than the finding asked: **the administrator
  never sees a voting link.** The page reads `select("owner_id")` and reports only whether a link
  exists, `CopyLinkButton.tsx` is deleted, and migration `20260802214500` revokes column-level
  `select (token)` from `authenticated` **and** `anon` — the latter turned out to hold a
  table-level grant all along, with only `using (false)` RLS in front of it. Proven through
  PostgREST: `?select=token` → `42501`, `?select=owner_id` → `200`, `open.ts`'s upsert and count
  both still `201`/`200`, `resolve_voting_link` unaffected for `anon`. Residual, recorded in
  `roadmap.md` under `S-04`: the fanout must read tokens through a `security definer` function that
  an administrator can also call directly, so this narrows the surface without closing it — that
  needs the v2 roles model. Full record and the probe table in `change.md`.
  (b) UNCHANGED and carried into `S-03` as a prerequisite: nothing refuses
  `update voting_links set owner_id = …`, and `delete from resolutions` on an open resolution still
  cascades its links away.
