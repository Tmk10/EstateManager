---
change_id: landing-page-identity
title: The landing page names the product (S-08)
status: implemented
created: 2026-08-05
updated: 2026-08-05
archived_at: null
---

## Notes

Roadmap item `S-08` from `context/foundation/roadmap.md`. Until now `/` was the untouched
starter screen — **10x Astro Starter**, an English subtitle about a "cosmic developer
experience", three feature cards about Supabase, Astro and ESLint. It is the product's only
public screen and it described somebody's template.

Implemented without a plan, on the product owner's instruction: the slice is two strings.

### The three Unknowns the roadmap left open

All three were answered here, and the roadmap flagged only the first as blocking.

1. **What is the user-visible product name?** — **EstateManager.** Instructed by the product
   owner as "application name". No Polish product name exists anywhere in the repository or the
   PRD, so the technical identifier — the Worker name, the project name — is also the visible
   name. If a Polish name is ever chosen, this heading and `Layout.astro`'s default title are
   the two places it lands.
2. **Does the page lead to sign-in, or only describe?** — **Both, without adding anything.**
   `Topbar` already carries the sign-in link and stays; the starter's separate _Sign In_ call to
   action was a second door to the same room and is gone.
3. **Does the cosmic styling stay?** — **It stays, deliberately, not by omission.** Thirteen
   files use `bg-cosmic`; the landing page keeping the orbs, the star field and the gradient
   heading is what makes `S-09` find one visual language rather than two. This change writes no
   new visual vocabulary at all — it deletes content and leaves the treatment untouched.

### Scope

The roadmap names the scope risk by name: _"'strona startowa' to miejsce, w którym łatwo dorobić
sekcje funkcji, cennik i stopkę"_. Held. Nothing was added to this page — every line of the diff
either deletes starter content or replaces a string.

## Plan

None. Implemented directly at the product owner's instruction.

## What was built

- `src/pages/index.astro` — the landing page, now inlined rather than delegating to a starter
  component. Cosmic background, `Topbar`, and a hero of exactly two things: **EstateManager** and
  _Twój portal do zarządzania nieruchomościami_. Passes `title="EstateManager"` to `Layout`.
- `src/components/Welcome.astro` — **deleted.** It was the starter's landing component, imported
  by nothing else, and the slice's outcome is literally "instead of the starter page". Inlining
  matches every other page in this repository (`dashboard.astro`, `help.astro` and the
  `buildings/` screens all hold their own markup).
- `src/layouts/Layout.astro` — the default `title` was `"10x Astro Starter"`, now
  `"EstateManager"`. Inert today, since every other page passes its own title; kept correct so
  the next page that forgets one does not put the starter's name in the browser tab.

## Verification

Run in the worktree, on node 22.14.0:

- `npx astro sync && npm run lint` → exit 0.
- `npm test` → 3 passed. **This proves the harness runs and nothing about this change** — the
  Vitest suite is the smoke test described in `CLAUDE.md`, and there is no test covering any
  page's markup. `npm run test:db` was not run and does not apply: no file under `supabase/`
  is touched.
- `npm run build` → Complete.
- **The page was loaded**, against a local Worker (`npm run dev`): `GET /` → `200`,
  `<title>EstateManager</title>`, the heading and the sentence present in the body, and no
  occurrence of `10x Astro Starter`, `Modern Stack` or `Authentication Ready` anywhere in the
  response. The negative half is the point — the slice is as much about what left the page as
  what arrived on it.

`/` is a public route and stays out of `PROTECTED_ROUTES`; nothing about the auth gate changed.

## Accepted consequences

- **The visible product name is now committed in two files.** A later decision to call the
  product something Polish is a copy change in `src/pages/index.astro` and
  `src/layouts/Layout.astro`, not a rename of any identifier — `CLAUDE.md`'s rule against
  piecemeal renaming of `estate-manager` is untouched by this change.
- **`S-08` is done, so `S-09` level 1 now has all three prerequisites** (`S-05`, `S-07`, `S-08`).
  Level 2 already shipped out of order; level 1 is the remaining half.
