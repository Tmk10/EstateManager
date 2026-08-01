---
change_id: building-create
title: Create a building from a three-field form and set the data-layer contract
status: implementing
created: 2026-08-01
updated: 2026-08-02
archived_at: null
---

## Notes

Roadmap item `S-01` from `context/foundation/roadmap.md`. First slice with a database
behind it — the data layer is empty today, so this change writes the first migration.

Scope is one form with three required fields — building name, city, and street with
number — plus the row it writes. The address was split from a single free-text field on
2026-08-02: one `address` column is neither searchable nor comparable, and splitting it
now, on an empty table, costs one extra column, where splitting it later would be a data
migration that parses free text. PRD `FR-011` (added 2026-08-01, when `S-01` was split
out of the old `building-registry-import`) also binds the field set to being
**extensible**: adding a later column must be an additive migration and one more form
field, never a reshape of the table or of the write path.

The real weight is not the form. This is where the security contract for the whole
product gets established — row level security on every table, one policy per operation
per role, `anon` included, because owners vote without a session (`CLAUDE.md`
§Conventions). Setting that pattern here, on a table with three columns and no owner data
in it, is cheaper and easier to check than retrofitting it onto a populated registry.

Second thing landing here by accident of sequence: `supabase/seed.sql` gets its first
real run. It shipped from `F-01` never having been executed — Docker was unavailable at
the time — so this change is also the first exercise of `npx supabase db reset`.

`S-01b` (`building-units-import`) imports lokale into the building this change creates.
It is a separate change and does not start until this one lands.
