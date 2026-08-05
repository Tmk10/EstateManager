# Building modules (S-09, level 2) — implementation plan

## Overview

`/buildings/<id>` stops being a screen with a registry on it and becomes the **index of that
building's modules**. The registry table and the resolutions list move to their own routes:
`/buildings/<id>/units` and `/buildings/<id>/resolutions`.

The point is not the two cards. It is that the second level of navigation exists at all: after
this change an administrator is always somewhere *in a building*, and adding a third module is an
entry in one array.

## Current State Analysis

`src/pages/buildings/[id]/index.astro` is 275 lines doing four jobs: it loads the building, loads
every unit with its owner, loads every resolution, and renders both a table and a list stacked
vertically. The resolutions section is nested inside `units.length > 0`, so a building with no
registry shows no voting module at all — not even the fact that one exists.

Routes that exist today under a building:

| Route | File | Role after this change |
| --- | --- | --- |
| `/buildings/<id>` | `[id]/index.astro` | module index (rewritten) |
| `/buildings/<id>/units/import` | `[id]/units/import.astro` | leaf of the registry module |
| `/buildings/<id>/resolutions/new` | `[id]/resolutions/new.astro` | leaf of the voting module |
| `/buildings/<id>/resolutions/<rid>` | `[id]/resolutions/[resolutionId].astro` | leaf of the voting module |

Two are added: `[id]/units/index.astro` and `[id]/resolutions/index.astro`.

### Key Discoveries

- **`PROTECTED_ROUTES` already covers both new routes.** `src/middleware.ts:39` matches with
  `startsWith` against `"/buildings"`. Nothing to add — but this must be *demonstrated*, per the
  `S-07` precedent, because the failure mode is invisible on screen.
- **The building-load block is duplicated in every page under `[id]/`** (load building →
  `loadError` string → render or show the error). Four copies today, six after this change. Not
  refactored here: it is the established pattern, and a shared loader touching six files is a
  different change from the one that was asked for. Named so the next person can decide.
- **`api/buildings/[id]/units.ts:83` redirects to `/buildings/<id>` after a successful import.**
  That address used to *be* the registry. After this change it is the module index, so the
  administrator would no longer land on the thing they just created.
- **`units/import.astro:157` labels a button „Zobacz rejestr lokali" and points at
  `/buildings/<id>`.** The same problem, and here the label becomes a lie rather than a detour.
- **`select` projections are not type-checked** (`CLAUDE.md`) — a wrong column inside
  `.select("…")` compiles. Every new query in this change names columns that already appear in
  queries on the current page, so none is a new claim about the schema.

## Desired End State

```
/buildings/<id>                    module index — 2 cards, each with live state
  ├── /units                       Rejestr lokali — the table
  │     └── /import                CSV import (unchanged)
  └── /resolutions                 Uchwały — the list
        ├── /new                   new resolution (unchanged)
        └── /<rid>                 one resolution (unchanged)
```

## Phase 1 — Module registry and building context

**`src/lib/building-modules.ts`** (new). The registry. One exported array; each entry carries
`id`, `label`, `description`, `path`. Plus `buildingModuleHref(buildingId, module)`.

Two comments belong in this file because they are decisions, not descriptions:

- v1 lists only modules that exist — no "wkrótce", no greyed rows (PRD `## Non-Goals`).
- the roadmap's readiness criterion: a future module is an entry here and nothing else.

Module labels use the words already on the screens — **„Rejestr lokali"** and **„Uchwały"** —
rather than the roadmap's internal names („moduł bazowy", „moduł głosowania"). The roadmap names
go in the file comment so the mapping is not lost.

**`src/components/buildings/BuildingHeader.astro`** (new). `.astro`, not `.tsx` — static markup.
Props: the building (`id`, `name`, `city`, `street`) and an optional `activeModule` id. Renders:

1. a breadcrumb `Budynki / <name>` where `Budynki` links to `/buildings`,
2. the building's name and address,
3. **the module nav strip**, rendered only when `activeModule` is set.

That third element is the roadmap's actual requirement for this slice — navigation carrying the
state *"I am in building X"* rather than a flat list of links. The index omits the strip because
the cards *are* the index; a module page carries it so moving sideways does not require going up
first.

## Phase 2 — The three pages

**`[id]/index.astro`** (rewrite). Loads the building, then the two counters:

- `units` → `select("id, share_bps")`, giving count and the share total; area comes from
  `buildings.total_area_m2`, which the schema already keeps equal to `sum(units.area_m2)`.
- `resolutions` → `select("id, status")`, giving the total and how many are open.

Renders `BuildingHeader` (no `activeModule`) and one card per registry entry. Each card shows the
module's own state:

- registry: `N lokali · X m² · 100,00%`, or an empty state with the CSV import call to action;
- voting: `N uchwał · M głosowań otwartych`, or an empty state.

**The voting module is listed even when the registry is empty.** This is a change in behaviour and
it is the point: the module exists whether or not it has content, and hiding it hid the product's
own structure. Its card then says the registry comes first and links there. The screens behind it
already refuse gracefully — `resolutions/new.astro:141` renders „Ten budynek nie ma jeszcze
rejestru lokali" with a link to the import.

**`[id]/units/index.astro`** (new). The table, moved with its behaviour intact: the `pl` numeric
collation sort (so „10" does not sort between „1" and „2"), the `formatShareBps` / `formatSquareMetres`
formatting, the totals row, and the `shareTotal !== TOTAL_BPS` alarm. Keeps the `?error=` banner
the old page read. Empty state keeps the import call to action.

**`[id]/resolutions/index.astro`** (new). The list, moved intact: newest first by `created_at`,
status badge, `opened_at` date, „Nowa uchwała" button, empty state.

## Phase 3 — Repoint what pointed at the old page

| File | Line | From | To |
| --- | --- | --- | --- |
| `api/buildings/[id]/units.ts` | 83 | `/buildings/<id>` | `/buildings/<id>/units` |
| `units/import.astro` | 157 | `/buildings/<id>` | `/buildings/<id>/units` |
| `resolutions/new.astro` | 163 | `/buildings/<id>` | `/buildings/<id>/resolutions` |
| `resolutions/[resolutionId].astro` | 422 | `/buildings/<id>` | `/buildings/<id>/resolutions` |

The footer links on the last two are relabelled „Wróć do uchwał"; `units/import.astro`'s footer
becomes „Wróć do rejestru lokali". Each leaf returns to its own module, not to the index above it.

**Not in scope:** adding `BuildingHeader` to the three leaf pages. They already carry the building
name and address under their own `<h1>`, so building context is present; giving them the module
strip as well is a wider diff than the request, and the boundary is recorded here rather than
crossed silently.

## Verification

No test runner exists in this project (`CLAUDE.md`) — nothing below may be reported as a test pass.

1. `npx astro sync && npm run lint && npm run build`.
2. Against `npm run dev`, signed in as `test@test.com`:
   - `/buildings/<id>` renders both module cards with correct counters;
   - `/buildings/<id>/units` renders the table and totals `100,00%`;
   - `/buildings/<id>/resolutions` renders the existing resolutions with their badges;
   - a building with no registry shows both cards, the voting one pointing at the import.
3. **Auth, demonstrated rather than read** — anonymous `GET`:
   - `/buildings/<id>/units` → `302` to `/auth/signin`
   - `/buildings/<id>/resolutions` → `302` to `/auth/signin`
   - control, `/dashboard` (known protected) → `302`
   - control, `/` (known public) → `200`

   The controls are not ceremony: a bare `302` proves nothing about which rule produced it.
4. No schema change, no migration, no `db:types` regeneration — this change reads columns that are
   already read today.
