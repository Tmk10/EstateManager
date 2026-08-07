---
change_id: share-weighted-vote
title: Share weighted vote
status: implemented
created: 2026-08-03
updated: 2026-08-03
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

### Error codes added by S-03 (Phase 1)

The plan's Phase 4 contract enumerated `EM008`–`EM010`. Three more exist; all six must be in
the final record, and any endpoint touching these paths must map them.

| Code | Raised by | When |
| --- | --- | --- |
| `EM008` | `assert_voting_link_frozen` (`before update`) | A link's `token`, `owner_id` or `resolution_id` is changed. `building_id` and `created_at` stay editable. |
| `EM009` | `assert_resolution_deletable` (`before delete`) | A resolution that has left draft is deleted. |
| `EM010` | `assert_vote_immutable` (`before update or delete`) | Any update or delete of a row in `public.votes`, unconditionally. |
| `EM011` | `cast_vote` | `p_choice` is null or outside `('for','against')`. Raised **before any lookup**, so it distinguishes nothing about the token space. |
| `EM012` | `assert_voting_link_issuable` (`before insert`) | A **new** link is issued for a resolution that has left draft. Links for an owner who already holds one pass through, so `open.ts`'s `on conflict do nothing` upsert stays idempotent. |
| `EM013` | `assert_voting_link_deletable` (`before delete`) | A link belonging to a non-draft resolution is deleted. |

`EM012` and `EM013` were added during the Phase 1 implementation review (finding F1). Without
them, `EM008` was bypassable: an administrator could delete a delivered link, insert a
replacement carrying a token of their choosing, and have `cast_vote` record a binding vote
for that owner at their full weight — reproduced end to end through PostgREST before the fix,
refused at every step after it. The two migrations are one guarantee and neither holds alone.

**Carry into Phase 2:** `EM011` must produce a *neutral* redirect — `/vote/<token>` with no
`?error=` — not a named message. The error-model boundary forbids naming any failure before a
token has resolved, and a forged `choice` is rejected before the lookup.

### The first `security definer` **write** in the project

`public.cast_vote(text, text)` is the whole write path into `public.votes`, and it is
`security definer` — which CLAUDE.md's no-definer rule exists to prevent. The argument is
written into the migration itself (`20260803090500_create_votes.sql:244`) rather than left
here, because that is where a reader meets it. In short: the rule protects the **registry's**
single write path, where `import_building_units` stays `invoker` precisely so a building the
caller cannot see raises `EM001`. Here there is no caller identity to preserve — the voter is
`anon`, denied on every table in the schema by design, and a policy cannot see a bearer token.
The alternative is an `anon` insert policy, which needs the browser to post its own
`owner_id`, `resolution_id` and `share_bps`, with the policy `using (true)` because it has no
way to check any of them. That is strictly worse than what `S-02` already rejected.

The client sends a token and a choice and nothing else. It never names an owner, a resolution
or a weight: `cast_vote` resolves the link, sums the owner's units and writes the row itself.

### `share_bps` on a vote is a snapshot, and it is authoritative

The weight is copied onto the vote row at the moment it is cast. The registry is static in v1
(`import_building_units` raises `EM002` on re-import, no edit screen exists), so this changes
no outcome today. It exists so `S-05` and `S-06` read what a vote **was worth when it was
cast** rather than reconstructing what the shares happen to be when someone asks. Stated in
`comment on table public.votes`: the snapshot outranks any later recomputation. A future
release that lets udziały move must not silently reweigh votes already cast.

### `public.votes` denies writes to both roles — deliberately unlike every other table

Eight policies, one per operation × role, as the convention demands. But `insert`, `update`
and `delete` are `false` for **both** `anon` and `authenticated`, where all seven other tables
grant them to `authenticated`. That is not an oversight and must not be "fixed" back to
consistency: *głos jest ostateczny*, and the only writer is `cast_vote`, which is
`security definer` and therefore not subject to policies at all.

Which is why finality is enforced three times, at three different callers, none redundant:

| Enforcement | Binds |
| --- | --- |
| `unique (resolution_id, owner_id)` | everything, including `cast_vote` |
| The six write policies, all `false` | PostgREST callers (`anon`, `authenticated`) |
| `assert_vote_immutable` → `EM010` | `cast_vote` itself, the only thing RLS does not bind |

See also the residual below: the policies stand alone, without a matching `revoke`.

### Two product decisions, both the user's call

- **A second visit shows the receipt.** The roadmap left open what a returning owner sees.
  `resolve_voting_link` was widened with `own_vote_choice` / `own_voted_at` — the reader's own
  data, the same standard `owner_share_bps` already met — so the link stays useful after the
  vote instead of becoming a dead end. The copy says so: *"Zachowaj ten link — pod nim zawsze
  zobaczysz to potwierdzenie."*
- **The confirm step is a GET.** Pressing `Za` navigates to `/vote/<token>?wybor=za`, a read
  with no side effect; only the confirm screen POSTs. This keeps the back button and a
  double-tap harmless. An unrecognised `?wybor` falls through to the buttons rather than
  erroring — it is caller-controlled and says nothing about the token.

### Finding F4 reversed: the vote page now sets its headers

`S-02`'s review recorded F4 (no `Cache-Control` / `X-Robots-Tag` / `Referrer-Policy` on
`/vote/<token>`) and **skipped** it, correctly at the time: the page rendered a resolution the
owner was entitled to read and nothing else, so there was nothing to lose. `S-03` moves the
stakes — the page now renders a **receipt naming how someone voted**, and the token now leads
to a write. All three headers are set, and set **before** the `view` branch: a header that
differs between a hit and a miss is exactly as observable as a body that does.

### Still open from `S-02`, and now a hard prerequisite

`voting_links_*_authenticated` and the new `votes_select_authenticated` are `using (true)`.
PRD v1 has no roles model and no table binding a user to a building, so a scoped predicate
would resolve to `true` for every caller and read as a restriction while restricting nothing.
This was `Block: no` in the `S-02` review **for one administrator account**. It is a hard
prerequisite for a **second**: today any authenticated user reads every building's vote count,
and with `S-05` will read every building's tally. The v2 roles model must land before a second
account does.

### Review finding F2 — closed 2026-08-07

`public.votes` denied `insert` / `update` / `delete` to both roles by RLS policy alone; no
`revoke` was written, so Supabase's default table-level grants still stood behind the
policies. Verified denied for both roles through PostgREST at the time. The exposure was to
a future edit that flipped `votes_insert_authenticated` to `true` — which would read like
restoring consistency with the other seven tables — rather than to anything live. Skipped
knowingly at the time; closed by `supabase/migrations/20260807113212_revoke_votes_dml_grants.sql`,
a one-line `revoke` that changes no observable behaviour today (the policies already deny
all three) and does not touch `cast_vote`'s write path, which is `security definer` and was
never subject to these grants.
