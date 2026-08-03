---
change_id: share-weighted-vote
title: Share weighted vote
status: impl_reviewed
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

### Known residual, deliberately not fixed (review finding F2)

`public.votes` denies `insert` / `update` / `delete` to both roles by RLS policy alone; no
`revoke` was written, so Supabase's default table-level grants still stand behind the
policies. Verified denied for both roles through PostgREST today. The exposure is to a future
edit that flips `votes_insert_authenticated` to `true` — which would read like restoring
consistency with the other seven tables — rather than to anything live. Skipped knowingly;
the fix is one `revoke` line.
