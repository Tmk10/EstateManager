---
change_id: finished-votes-archive
title: Audit trail of a settled uchwała (S-06)
status: implemented
created: 2026-08-05
updated: 2026-08-05
archived_at: null
---

## Walkthrough (2026-08-05)

Run against a local Worker (`npm run dev`), signed in as `test@test.com`, building
`0ab1e8b5-27ce-4d7c-91b0-24e6f2f1ef6d`. All four states loaded and read back from the rendered
HTML rather than from the database.

| Uchwała | Status | What the trail shows | Rozliczenie | 43-char token in HTML |
| --- | --- | --- | --- | --- |
| `7/2026` | `passed` | Tomek Kościelniak 25,01% Za; Anna Nowak 25,00% Za. Nie oddali: Maria Wisniewska 24,99%, Piotr Kowalski 25,00% | za **50,01%** + przeciw 0,00% + nieoddane 49,99% = **100,00%** | 0 |
| `6/2026` | `rejected` | przeciw **74,99%** | closes at 100,00% | 0 |
| `2/2026` | `open` | no trail section at all | — | 0 |
| draft | `draft` | unchanged, edit form intact | — | 0 |

`7/2026` is the boundary fixture and it reads exactly as intended: 50,01% is one basis point over
half, and the figures agree with the *Bilans udziałów* panel above them.

## What the implementation learned

- **The trail found a defect nothing else would have.** An owner holding no lokale rendered as
  `— (0,00%)`, seated in the electorate of a settled uchwała. The rendering was right; the row
  should never have existed. `import_building_units` cannot create one — it derives owners from the
  CSV's unit rows — but that was a property of the one write path, not of the schema, and
  `owners_insert_authenticated` is `with check (true)`. It led to `EM015` and to the plan's
  no-migration rule being overridden by the product owner (recorded in `plan.md`).
- **The offending row cannot be deleted, and that is correct.** She holds voting links on `6/2026`
  and `7/2026`, and `EM013` refuses deleting a link on any non-draft resolution. The electorate of a
  settled uchwała is immutable by design, so the fix had to be forward-looking. She also cannot be
  given a lokal: the registry totals exactly 10000 bps and `EM003` asserts it at commit.
- **A deferred constraint can only be tested by forcing it.** `set constraints all immediate` is the
  one commit-like checkpoint available inside a transaction that must roll back, and unlike
  `savepoint` it survives pgTAP's `EXECUTE` — which fails with `0A000 EXECUTE of transaction commands
  is not implemented`. Every assertion in `owner_holds_units.test.sql` is on that statement rather
  than on the write, which is also the honest shape: deferral means the write is never what fails.
- **The pgTAP suite asserts the legitimate registry first, deliberately.** A constraint that refused
  a real import would be worse than the hole it closes, so that is the assertion placed where it
  cannot be skipped. Separately verified by running the real `import_building_units` RPC against the
  constrained schema.
- **Two SQL comments had to be corrected and neither earned its own migration.** They rode along in
  the `EM015` file. `resolve_voting_link`'s was the important one: "the question S-06 is scoped to
  answer, and until it does the answer is no" reads, once S-06 has shipped, like an expiry date on a
  PRD guardrail that has none.
- **One thing was left alone on purpose.** The zero-udział owner still appears in S-04's *Linki do
  głosowania* table, because she genuinely has a link and it genuinely was sent. Filtering her there
  would hide a message that went out.

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
