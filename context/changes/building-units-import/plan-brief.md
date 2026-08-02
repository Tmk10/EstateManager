# Building Units Import — Plan Brief

> Full plan: `context/changes/building-units-import/plan.md`

## What & Why

Roadmap item `S-01b`. An administrator uploads a CSV listing a building's units — number,
floor area, owner name, owner e-mail — reviews a preview in which every unit already carries
its computed share, confirms, and gets a registry whose shares total exactly 100.00%.

This is the data model the rest of the product stands on: `S-02` issues one voting link per
unit, `S-03` weighs a vote by its unit's share, `S-05` measures the 50% threshold against the
sum of all shares. It is also the first table holding other people's personal data.

## Starting Point

`S-01` shipped the `buildings` table, the eight-policy RLS pattern, generated types, and the
form-data-plus-redirect endpoint idiom. `supabase/seed.sql` seeds one demo building and
deliberately no units, so there is a ready import target after every reset. There is no test
runner, and migrations are applied by hand (`db push`, residual G14).

## Desired End State

`/buildings/<id>` shows a unit registry — number, area, share as `X,YZ%`, owner, e-mail or
*brak* — with a total row reading **100,00%**. A malformed file produces every error at once
with line numbers and writes nothing. A second import into the same building is refused.

## Key Decisions Made

| Decision | Choice | Why |
| --- | --- | --- |
| Data model | Two tables: `units` + `owners` | One owner row per person lets `S-04` send one message to someone owning two units |
| Owner identity | The e-mail address | The only naturally unique field that is also the delivery channel |
| File format | CSV, UTF-8, `;` separated | No parser dependency on workerd; Excel exports it in one click |
| Share storage | Computed at import, stored as `share_bps` | Integer hundredths of a percent, 10000 per building — the threshold comparison stays exact |
| Rounding | Largest remainder method | Sum is exactly 100.00% by construction; each unit is within 0.01 pp of its true value |
| Tie-break | Input (file) order | Makes a re-parse of the same bytes reproduce identical shares — what allows the confirm step to recompute rather than trust the client |
| Re-import | Refused with a message | Registry is static (PRD `## Non-Goals`); changing shares mid-vote would move the threshold |
| Owner without e-mail | Accepted, stored as null | The threshold counts *all* shares, so dropping the unit would falsify the denominator |
| Partial failures | All-or-nothing, full error list | A half-imported building would be permanently stuck, since re-import is refused |
| Atomicity | One `plpgsql` function via `rpc` | `supabase-js` has no multi-statement transaction; `security invoker` keeps RLS in force |
| RLS | Repeat the `buildings` pattern, unscoped `authenticated` | v1 has no roles model and no user↔building binding; a predicate that is always true reads as protection while protecting nothing. Real scoping arrives with `S-02`'s token |
| Preview | Upload → preview → confirm | With re-import refused and no edit screen, this is the last moment a human can catch a typo'd area |
| CSV template | Empty — headers only — served from a route, on the import page | No example row to accidentally leave behind; generating it from the parser's `CSV_HEADERS` makes template-vs-validator drift impossible |
| Total floor area | Stored as `buildings.total_area_m2`, written by the import function | Asked for explicitly. It is a denormalization — recoverable as `sum(units.area_m2)` — so two deferred triggers make the stored value and the units it came from unable to disagree |

## Scope

**In scope:** `units` + `owners` schema with 16 policies, composite FK preventing
cross-building units, a `total_area_m2` column on `buildings`, deferred triggers asserting
both the 10000 bps share total and the stored area total, `import_building_units`
function, CSV parser, largest-remainder arithmetic, upload/preview/confirm screens, registry
view, and an **empty CSV template** — headers only — downloadable from the import page and
generated from the parser's own header constant so the two cannot drift apart.

**Out of scope:** XLSX, column-mapping UI, editing or deleting units, co-ownership,
multi-building portfolio, seeding units, sending e-mail (`S-04`), voting links (`S-02`), any
owner-facing page, a test runner, a CI migration step.

## Architecture / Approach

Bytes → `parseUnitsCsv` (validate, collect every error) → `computeShareBps` (largest
remainder, integer arithmetic) → preview page carrying the **original CSV text** in a hidden
field → confirm endpoint **re-parses and recomputes** → one `rpc` call writing owners, units
and the building's total area atomically → deferred triggers verify both totals at commit.

The client never supplies a share. TypeScript computes, the database verifies.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Schema and write path | Both tables, 16 policies, composite FK, `total_area_m2`, two deferred triggers, import function, regenerated types | Triggers must be `deferrable initially deferred` or a multi-row insert fails on row 1 |
| 2. Parser and arithmetic | Two dependency-free modules, verified by a throwaway `node --experimental-strip-types` script | The only correctness-critical code in the product, with no test runner behind it |
| 3. Screens | Building detail, empty-template download, upload island, preview, confirm endpoint | File upload is genuinely new UI — `FormField` is text-only |
| 4. Production and record | Branch merged to `main`, migration pushed, deploy verified, `CLAUDE.md` and roadmap updated | `db push` is irreversible and nothing in CI applies migrations |

**Prerequisites:** Docker running for the local Supabase stack; `S-01` merged (it is — `d6c3cd3`); the Supabase project already linked from `S-01`.
**Estimated effort:** ~4 sessions, one per phase, each ending in one commit.

## Open Risks & Assumptions

- The real PoC building's file format is unknown. Fixed headers plus a downloadable template is the bet; if the manager's export differs wildly, the cost is manual column renaming, not a redesign.
- A Windows-1250 fallback for decoding depends on whether workerd's `TextDecoder` exposes that label. The plan works without it — the file is rejected with an instruction to save as UTF-8.
- Unscoped `authenticated` policies are correct for v1 and become wrong the moment a second administrator or a second building matters. `S-02` is where that gets revisited; the `building_id` index is created now so the predicate lands on an indexed column.
- The registry has no repair path. A confirmed bad import can only be fixed through the Supabase dashboard. The preview step is the mitigation; it is not a guarantee.

## Success Criteria (Summary)

- An administrator imports a 70-unit CSV and the registry totals exactly 100,00%.
- A broken file tells them everything that is wrong in one pass, and changes nothing.
- The same file imported twice cannot corrupt a building or double its registry.
