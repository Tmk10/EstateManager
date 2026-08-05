---
change_id: finished-votes-archive
title: Audit trail of a settled uchwała (S-06)
status: implementing
created: 2026-08-05
updated: 2026-08-05
archived_at: null
---

## Notes

Roadmap item `S-06` (`context/foundation/roadmap.md` §S-06), the last piece of stream B and —
since `S-05` landed — the smallest piece left on the roadmap.

**The change-id does not describe the scope, and that is deliberate.** The slice was originally
"Przegląd zakończonych głosowań" with its own archive list. On 2026-08-03 the roadmap resolved
that there is **no separate archive**: a settled uchwała does not move anywhere, it stays on the
shared list `S-05` built and changes its badge. The identifier stayed `finished-votes-archive`
because it is quoted in closed records and in `CLAUDE.md`, and renaming it would invalidate them
retroactively. The scope is the roadmap entry, not the folder name.

**The trail already exists in the data; only the read is missing.** `S-03` made `public.votes`
store the owner, the choice, the moment, and the weight *as of that moment*, and `EM010` refuses
every update and every delete of a vote. So the durable requirement — *dla każdej zakończonej
uchwały da się w dowolnym momencie wykazać, które udziały złożyły się na wynik* — is already
satisfied on the write side. What is left is the reading surface and one decision about its
depth.

### The open question this change has to settle first

Roadmap §S-06 Unknowns, owner: użytkownik, `Block: no`:

> Jak głęboki ma być ślad przy zachowaniu bariery „właściciel nie poznaje głosów innych
> właścicieli" — czy administrator widzi rozbicie na konkretne lokale, czy wyłącznie sumy?

The PRD requires the outcome be reproducible but does not say who may see the breakdown. This is
the main scope decision in the slice and belongs in `plan.md`, not in the implementation.

### Fixtures that already exist for this

The local database carries two decided uchwały, settled through the application on 2026-08-05
(see `context/changes/live-tally-and-outcome/change.md`):

- `7/2026` — `passed` at **5001 bps**, the narrowest possible crossing (50,01% against 49,99%
  uncast). The boundary fixture.
- `6/2026` — `rejected` at 7499 bps.

Neither can be unmade (`EM007`, `EM010`), which is exactly why they are worth more as fixtures
than as spares.

### Platform note carried from the roadmap

`infrastructure.md` §D5/§G3: log retention is days, so the whole trail must live in the database —
the platform contributes nothing here. The trail table is also the fastest-growing and least
indexed table in the schema.
