---
change_id: production-admin-access
title: Make administrator access on production real and verified
status: implemented
created: 2026-08-01
updated: 2026-08-01
archived_at: null
---

## Notes

Roadmap item `F-01` from `context/foundation/roadmap.md`. Foundation, not a slice —
it unlocks `S-01` and through it the whole administrator stream, because none of those
pieces is verifiable on production until someone can log in there.

Four things in one change: delete the registration path the product decided against
(PRD §Access Control, 2026-08-01), land the admin on `/dashboard` instead of the starter
landing page, turn a missing or rotated Supabase secret from a green deploy into a red
one, and prove both the health assertion and the lint gate by exercising them.
