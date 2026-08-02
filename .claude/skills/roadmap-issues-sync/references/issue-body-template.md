# Issue body template and label registry

Reference for `/roadmap-issues-sync`. The skill renders every issue body from the
layout below and reconciles labels against the registry at the bottom.

Issue content is written in **English**, while `context/foundation/roadmap.md` is in
Polish. Translation happens here and nowhere else. Translate the *substance*, not the
wording: an Outcome that reads as one sentence in Polish stays one sentence in English.
Never invent a fact the roadmap does not state — if a section is empty in the roadmap,
the section is omitted from the issue, not filled in.

## Canonical body layout

Sections appear in this order, always. Omit a section entirely when the roadmap has no
content for it; never emit an empty heading.

````markdown
> Mirror of `context/foundation/roadmap.md` (v<N>). **The roadmap is the source of truth** — change scope there first, then sync this issue.

**Change ID:** `<change-id>` · **Stream:** <letter> — <stream theme, English>[ · **North star**]

[optional history note — see "History notes" below]

## Outcome

<Outcome, translated, prose>

## Dependencies

- **Blocked by:** <#N (ID) refs, or `—` plus a short reason>
- **Unlocks:** <#N (ID) refs, or `—`>
- **Parallel with:** <#N (ID) refs, `everything`, or `—`>

## PRD refs

- <one bullet per ref>

## Open questions

- [ ] <unresolved Unknown, translated> — Owner: <user|team>. Blocking: <no|**yes**>.
- [x] <resolved Unknown> **Settled <date>:** <what was decided>

## Risk

<Risk, translated, prose>

## Delivered

<only for items the roadmap marks done — see "Delivered section" below>

## Definition of Done

- [<x| >] Change folder created via `/10x-new <change-id>`
- [<x| >] `npx astro sync && npm run lint && npm run build` — green
- [<x| >] Roadmap updated: status → `done`, entry added under `## Done`

---

Roadmap ID: `<ID>` · [roadmap.md](https://github.com/<owner>/<repo>/blob/main/context/foundation/roadmap.md)
````

The trailing `Roadmap ID:` line is the **match key**. It must be present, exact, and
last. Everything above it may be rewritten freely on a later sync; that line may not.

## Dependency references

The roadmap names dependencies by roadmap ID (`S-01b`, `F-02`). Issues name them by
issue number with the ID in parentheses: `#10 (S-01b)`. Always render both — the number
so GitHub links and back-references work, the ID so the line survives being read next to
the roadmap.

When a dependency is closed, say so inline rather than dropping it:
`- **Blocked by:** #4 (S-02). #2 (F-02) closed 2026-08-01 — <one clause on what that removed>.`

## Open questions

Roadmap Unknowns carry a `Block:` marker (`Block: no.`, `Block: **tak**`). Map it to
`Blocking: no` / `Blocking: **yes**`. A blocking Unknown also forces the `status:blocked`
label, so the two must agree — an issue labelled blocked whose questions all say
`Blocking: no` is a rendering bug.

Unknowns prefixed in the roadmap with `ROZSTRZYGNIĘTE`, `ZAMKNIĘTE`, `USTALONE`,
`ZAWĘŻONE` or `PRZYJĘTE ZAŁOŻENIE` are settled: render them as `- [x]` with a
`**Settled <date>:**` clause. Keep them — a question with a recorded answer is worth more
than a deleted one, because it stops the same question being re-asked.

## Delivered section

Only for items the roadmap marks `done`. Three parts, in order:

1. **One line of provenance.** With a merged PR: `Shipped to production <date> in #<PR>.`
   Without one: `Shipped to production <date>. No pull request — this predates the
   branch-and-PR rule introduced in #9, so it landed as direct commits on \`main\`:`
   followed by a bullet per commit, `<short-sha> \`<subject>\``, oldest first.
2. **What it left behind** — a short bullet list of the durable consequences, drawn from
   the roadmap's `Zrealizowane` field when present. This is the part a reader of the
   closed issue actually needs: what now exists that constrains later slices.
3. **Record:** the change folder path (`context/changes/<change-id>/`, or the archive
   path once archived).

## History notes

When an issue is rewritten because the roadmap split, renamed or rescoped its item, put a
blockquote note directly under the Change ID line explaining what it used to be and why
it changed. The issue keeps its number — other issue bodies cite it.

Example, from the `S-01` split:

> **Rescoped 2026-08-01 (roadmap `S-01` split).** This issue originally tracked
> `building-registry-import` … Numbering `S-02`–`S-06` was deliberately left untouched —
> `S-03` and `S-04` are quoted in closed plans, in `CLAUDE.md` and in code comments, so
> renumbering would invalidate records that must not be edited retroactively.

## Label registry

`gh label create` any that is missing, with exactly these colours and descriptions.

| Label | Colour | Description | Applied when |
| --- | --- | --- | --- |
| `roadmap` | `5319e7` | Mirrored from context/foundation/roadmap.md | every issue this skill owns |
| `type:foundation` | `0e8a16` | Bounded enabler (F-*) | roadmap ID starts with `F-` |
| `type:slice` | `1d76db` | Vertical, user-visible slice (S-*) | roadmap ID starts with `S-` |
| `stream:<letter>` | `fbca04` | `<theme, English>` | from the `## Streams` table |
| `status:ready` | `c2e0c6` | No unmet prerequisites | see the status rule in SKILL.md |
| `status:blocked` | `e99695` | Waiting on a prerequisite roadmap item | see the status rule in SKILL.md |
| `status:done` | `0e8a16` | Shipped and closed | roadmap `Status: done` |
| `north-star` | `d4c5f9` | Proves or falsifies the product thesis | roadmap marks the item as north star |

The `roadmap` label is what makes an issue visible to this skill. An issue without it is
never read, never modified, never closed — that is the mechanism protecting hand-filed
bugs from a tool that only understands roadmap items.
