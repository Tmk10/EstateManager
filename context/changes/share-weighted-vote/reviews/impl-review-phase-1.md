<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Share-Weighted Vote (S-03)

- **Plan**: `context/changes/share-weighted-vote/plan.md`
- **Scope**: Phase 1 of 4 — Schema: hardening, `public.votes`, and the one write door
- **Date**: 2026-08-03
- **Verdict**: NEEDS ATTENTION (at review time) → **RESOLVED** after triage
- **Findings**: 0 critical, 2 warnings, 1 observation
- **Commit reviewed**: `186af7a`
- **Triage**: F1 fixed (Fix A, verified), F2 skipped knowingly, F3 fixed. Post-triage,
  Safety & Quality and Scope Discipline both clear; F2 remains as a recorded residual in
  `change.md`. The fix is uncommitted at the time of writing — it lands with Phase 2's
  commit, or as its own if Phase 1 is re-committed first.

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Success criteria re-run

| Check | Result |
|---|---|
| 1.1 Both migrations apply against a reset stack | PASS — 9 migrations, no errors |
| 1.2 `db:types` shows `cast_vote` + 2 new columns | PASS — regeneration is byte-identical to the committed file |
| 1.3 `astro sync && lint` | PASS — clean |
| 1.4 `build` | PASS — clean |

Manual rows 1.5–1.11 were each executed against the local stack during implementation and
re-confirmed here; every one has observable evidence (error codes, row counts, PostgREST
status codes). No rubber-stamping found.

## Findings

### F1 — An administrator can still cast any un-voted owner's vote, and the migration claims otherwise

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: `supabase/migrations/20260803090500_create_votes.sql:150-160` (policy comment); `context/changes/share-weighted-vote/plan-brief.md:37`
- **Detail**:
  The votes policy comment states: *"An administrator who could insert into this table could
  cast any owner's vote... so it is denied at the table rather than merely left out of the UI."*
  The plan-brief's decision table makes the stronger claim that the votes RLS *"closes the
  review's worry that any admin account could cast any owner's vote."*

  Both overclaim. `EM008` freezes a link's `token` / `owner_id` / `resolution_id`, but
  `voting_links` still carries `insert` and `delete` policies of `using (true)` /
  `with check (true)` for `authenticated` (inherited from S-02). Delete-then-insert routes
  around the freeze.

  Reproduced end to end against the local stack as a plain signed-in administrator through
  PostgREST — no superuser, no token ever read:

  ```
  PATCH voting_links (repoint Anna's link)  -> EM008   (hardening works)
  DELETE voting_links?id=eq.<Anna's link>   -> 204
  POST   voting_links {owner_id: Anna, token: "ATTACKERCHOSENTOKEN..."} -> 201
  POST   rpc/cast_vote {that token, "against"} (as anon) -> vote_recorded: true
  SELECT votes -> {owner_id: <Anna>, choice: "against", share_bps: 3334}
  ```

  Anna Nowak's binding vote was cast at her full 3334 bps weight by someone who is not her.

  Scope note, stated plainly: the *capability* predates this phase — it is the open S-02
  prerequisite that `voting_links_*_authenticated` is `using (true)`, logged `Block: no`, and
  the plan lists "No roles model" under What We're NOT Doing. What Phase 1 introduced is
  (a) the consequence — that capability now casts binding votes rather than merely issuing
  links — and (b) a comment and a plan-brief entry asserting the hole is closed. The
  plan-brief's own Success Criteria says the vote "cannot be... cast by anyone but the link's
  holder — and each of those is refused by the database, not by the UI." That criterion is
  currently not met.

- **Fix A ⭐ Recommended**: Close it in the schema — add to the hardening migration a
  `before insert` trigger on `voting_links` refusing a link for a resolution that has left
  draft *when no link for that (resolution, owner) already exists*, and a `before delete`
  trigger refusing deletion of a link on a non-draft resolution.
  - Strength: Makes the plan-brief's stated success criterion true, and does it in the exact
    migration that already exists for this purpose, in the same shape as `EM008`/`EM009`.
    Verified viable against `open.ts`: links are minted at step 3 while the resolution is
    still `draft` and the status flips at step 5, so the normal open path is untouched.
    Unlike most roles-model gaps, this one is closable without a roles model.
  - Tradeoff: One subtlety must be handled — `open.ts`'s upsert uses
    `ON CONFLICT DO NOTHING`, and a `before insert` trigger fires *before* the conflict is
    detected, so an unconditional refusal would break the idempotent re-press on an
    already-open resolution. The "only if no link already exists" condition above is what
    preserves it. Also costs a third migration if done after Phase 1 is merged.
  - Confidence: MEDIUM-HIGH — the `open.ts` ordering is read and confirmed; the trigger
    shape mirrors two triggers already working in this migration.
  - Blind spot: The `ON CONFLICT DO NOTHING` × `before insert` interaction is reasoned
    through but not yet executed — it must be tested by double-pressing "Uruchom głosowanie"
    on an already-open resolution before this is called done.

- **Fix B**: Leave the capability open as the already-accepted v1 risk, but correct the two
  overclaiming texts — narrow the policy comment to what is actually true (the policies stop
  a *direct* write to `votes`; they do not stop an administrator who controls `voting_links`)
  and record the residual in `change.md` for `S-05`/`S-06` to plan against.
  - Strength: Honest, cheap, and consistent with the project's existing posture — v1 trusts
    the administrator with every owner's personal data and the whole registry already, and
    S-02 logged this specific gap as accepted.
  - Tradeoff: Ships a slice whose headline security property is weaker than its own plan
    says, and leaves a real capability behind a comment rather than a constraint.
  - Confidence: HIGH — purely documentary, nothing can regress.
  - Blind spot: None significant.

- **Decision**: FIXED via Fix A. Added `EM012` (`assert_voting_link_issuable`, `before insert`)
  and `EM013` (`assert_voting_link_deletable`, `before delete`) to
  `20260803090000_harden_voting_links_and_resolutions.sql`, and a cross-reference in the
  votes migration's policy comment so neither file reads as the whole guarantee. The
  migration was extended in place rather than adding a third file, since it had been applied
  only to the local stack — Phase 4 still owns the production push.

  Re-ran the full attack against the hardened schema: repoint → `EM008`; delete →
  `EM013` (was `204`); replacement insert → `23505` (the link still exists); a link for a
  brand-new voter → `EM012`; the attacker-chosen token → `[]` from `cast_vote`; `votes`
  empty. The genuine holder still votes (`vote_recorded: true`).

  Blind spot closed: the `ON CONFLICT DO NOTHING` × `before insert` interaction was executed,
  not just reasoned about. A re-press of open.ts's upsert on an already-open resolution
  returns `201` and inserts nothing (link count unchanged at 3), so idempotency survives.
  Draft resolutions still mint links normally. Types unchanged (trigger functions are not
  exposed), lint and build clean.

### F2 — `public.votes` write denial rests on RLS policies alone, against this repo's own precedent

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `supabase/migrations/20260803090500_create_votes.sql:118-215`
- **Detail**:
  The migration writes no `grant` / `revoke` statements. Supabase's default privileges give
  `anon` and `authenticated` table-level `insert` / `update` / `delete` on every new table in
  `public`, so the *only* thing denying a write to `votes` is the eight policies.

  That is consistent with every other table here — but this repo already learned the opposite
  lesson one migration earlier. `20260802214500` records that before it ran, "one policy edit
  was all that separated the internet from a table of bearer credentials", and responded by
  removing the grant rather than trusting the policy. The plan anticipated this too, listing
  under Key Discoveries that "the votes table's own grants must be written knowing that a
  table-level `select` outranks a column-level revoke" — that note was not acted on.

  Consequence: a future migration or reviewer flipping `votes_insert_authenticated` to
  `with check (true)` — which reads like restoring consistency with the other seven tables —
  silently reopens direct vote forgery. A revoke would still stand behind it. `cast_vote` is
  unaffected either way: it runs as the table owner, which grants do not constrain.
- **Fix**: Add `revoke insert, update, delete on public.votes from authenticated, anon;` to
  the votes migration, with a comment tying it to the precedent in `20260802214500`.
- **Decision**: SKIPPED — the eight policies deny the writes today and were verified doing so
  through PostgREST for both roles. The finding is defence-in-depth against a future edit,
  not a live hole. Left open deliberately; if it is ever revisited, the fix is one line.

### F3 — `EM011` and the zero-weight early return are additions the plan does not describe

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: `supabase/migrations/20260803090500_create_votes.sql:258-262`, `:283-287`
- **Detail**:
  Two behaviours exist in `cast_vote` that the plan does not name. Both were surfaced at the
  manual gate and neither is a defect:
  - `EM011` for a `choice` outside the vocabulary. The plan said only "rejected before any
    lookup" without a mechanism. Verified to distinguish nothing: identical error for a real
    and a made-up token, because no lookup has happened.
  - A zero-rows early return when the owner's summed `share_bps` is `0`. Unreachable in v1
    and commented as such.

  The risk is bookkeeping, not behaviour: `EM011` is a new code in a schema whose error
  codes are enumerated in `change.md`, and Phase 4's contract lists only `EM008`–`EM010`.
  Phase 2's endpoint must also treat `EM011` as a neutral redirect with no `?error=`, since
  the error-model boundary forbids naming anything before a token resolves.
- **Fix**: Add `EM011` to the Phase 4 `change.md` note alongside `EM008`–`EM010`, and carry
  the neutral-redirect requirement into Phase 2.
- **Decision**: FIXED. `change.md` now carries a six-row table covering `EM008`–`EM013`
  (F1's fix added `EM012` and `EM013`), the note that `EM011` is raised before any lookup,
  the Phase 2 requirement that `EM011` produce a neutral redirect with no `?error=`, and
  F2's skipped residual recorded alongside it.

## Plan adherence detail

Every planned item is present and matches intent:

| Planned | Status |
|---|---|
| `EM008` freezing `token`/`owner_id`/`resolution_id`, `building_id` deliberately excluded | MATCH |
| `EM009` on delete of a non-draft resolution | MATCH |
| `public.votes` columns, `unique (resolution_id, owner_id)`, both check constraints, composite FKs, `created_at default now()` | MATCH |
| Eight policies, `select` true/authenticated + false/anon, writes false for both, deviation commented | MATCH — verified through PostgREST |
| `EM010` `before update or delete` trigger, unconditional | MATCH |
| `cast_vote` definer/volatile/`search_path=''`, `on conflict do nothing`, zero rows on miss, narrow return | MATCH |
| `resolve_voting_link` dropped + recreated with 2 columns, ACL re-issued, comment updated | MATCH |
| `database.types.ts` regenerated in the same commit | MATCH |

No planned item missing. No unplanned source file touched — the diff is exactly the two
migrations, the generated types, and the change folder.
