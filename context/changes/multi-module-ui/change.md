---
change_id: multi-module-ui
title: Building page becomes an index of that building's modules (S-09, level 2)
status: implemented
created: 2026-08-03
updated: 2026-08-03
archived_at: null
---

## Notes

Roadmap item `S-09` from `context/foundation/roadmap.md`, **level 2 only**. The roadmap defines
two levels of module:

- **Level 1 — `/dashboard`: application modules.** Today buildings and help.
- **Level 2 — `/buildings/<id>`: that building's modules.** Today the base module (lokale and
  właściciele) and the voting module (uchwały).

This change delivers level 2 and leaves level 1 as it is. `S-09` therefore ends this change
**partially done**, not done.

### Taken out of order, knowingly

`S-09`'s prerequisites are `S-05`, `S-07`, `S-08`. Only `S-07` is done. The roadmap puts `S-09`
last on purpose — *"to jedyny kawałek, który dotyka wszystkich wcześniejszych ekranów naraz, i
dlatego stoi na końcu: zrobiony wcześniej, byłby przebudowywany po każdym kolejnym kawałku."*

Pulled forward on the product owner's instruction (2026-08-03), with the cost named before
starting:

- `S-05` will add *Podjęta* / *Upadła* badges and the live share tally to the resolutions list
  this change creates. That is an extension of one list, not a rebuild — the smallest form the
  warning takes.
- `S-08` decides whether the cosmic starter styling stays. This change **does not answer that
  question** and deliberately writes no new visual language: the module cards reuse the card,
  border, and gradient vocabulary already on `/buildings` and `/dashboard`. If `S-08` changes
  direction, this change is re-skinned along with every other screen, not singled out.

### The route this takes from `S-05`

The roadmap assigned `/buildings/<id>/resolutions` to `S-05`, with the reasoning that building it
as a route now *"kosztuje jeden plik i jeden wpis w `PROTECTED_ROUTES`"* while building it as a
section and moving it at `S-09` costs a migration plus an invisible regression in the app's only
auth gate. This change builds that route. `S-05` inherits it instead of creating it.

The `PROTECTED_ROUTES` half of that cost turns out to be zero: the array matches with
`startsWith` and already contains `"/buildings"`, so both new routes are covered the moment they
exist. **That is a claim to verify by running it, not by reading it** — the `S-07` record sets
the standard, and an unprotected page looks identical to a protected one.

### What "module" means here

Settled by the roadmap on 2026-08-03 and not reopened: **navigational**, not commercial. A module
is its own place in the interface, always present — not an item a customer picks from an offer.
The consequence carried into this change is the readiness criterion:

> dołożenie któregokolwiek z nich później jest **wpisem w rejestr modułów, a nie przebudową
> ekranu**

so this change ships an actual registry (`src/lib/building-modules.ts`), not two hand-written
cards. The second binding rule: **v1 shows no module it does not have.** No "wkrótce", no greyed
rows. The directions the product owner named (kontakt z mieszkańcami, przeglądy, finanse) are the
shape the layout must accept, not content to display.

## Plan

See `plan.md`.

## What was built

- `src/lib/building-modules.ts` — the module registry. This file *is* the slice's readiness
  criterion: a future module is an entry here plus a route, not an edit to the building page.
- `src/components/buildings/BuildingHeader.astro` — the building context every level-2 screen
  carries: breadcrumb `Budynki / <name>`, the building's identity, and the module strip with the
  current module marked. The roadmap names this, not the cards, as the substance of `S-09`.
- `src/pages/buildings/[id]/index.astro` — rewritten as the module index. Loads only what the
  cards state (`units → id, share_bps`; `resolutions → id, status`), not the rows themselves.
- `src/pages/buildings/[id]/units/index.astro` — the registry table, moved with its behaviour
  intact (`pl` numeric collation sort, totals row, the `!== TOTAL_BPS` alarm).
- `src/pages/buildings/[id]/resolutions/index.astro` — the resolutions list, moved intact.
- Four back-links repointed so each leaf returns to its own module rather than to the index
  above it, including `api/buildings/[id]/units.ts`, which after a successful import now lands on
  the registry the administrator just created.

## Verification — incomplete, knowingly

Committed at the product owner's instruction with the walkthrough **not done**. What was run:

- `npx astro sync && npm run lint` → exit 0; `npm run build` → Complete.
- `npx prettier --check "src/**/*.{astro,ts,tsx}"` → clean apart from the generated
  `src/db/database.types.ts`, which is pre-existing and excluded from ESLint.

What was **not** run, and must be before this branch becomes a pull request:

- Walking the three routes signed in, against a building with a registry and one without.
- **The auth probe.** Both new routes rely on `PROTECTED_ROUTES` matching `"/buildings"` by
  `startsWith`, so no entry was added. That is a claim about the app's only auth gate, and the
  `S-07` record sets the standard: demonstrate it with a request, with controls (`/dashboard` →
  `302`, `/` → `200`), because an unprotected page looks identical to a protected one. Reading
  the array is not the same as trying the door.

There is no test runner in this project (`CLAUDE.md`) — nothing above is a test pass.

## Accepted consequences

- **`S-09` is now partially done**, which no other roadmap item is. The roadmap's slice table and
  backlog handoff both say so explicitly rather than leaving `proposed` to rot.
- **`S-05` inherits a route it was scoped to create.** Recorded in that slice's Unknowns so the
  next person does not build it twice.
- **The building-load block is now duplicated in six pages** under `[id]/`, up from four. Left as
  the established pattern; a shared loader is a different change from the one that was asked for.
- **The `?error=` banner on the module index is currently unreachable** — nothing redirects to
  `/buildings/<id>?error=` any more. Kept rather than deleted, so a future redirect does not
  silently drop its message.
