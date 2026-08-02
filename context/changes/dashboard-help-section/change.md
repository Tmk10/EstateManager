---
change_id: dashboard-help-section
title: Help module at its own /help route, in v1 one sentence with the developer's e-mail
status: implemented
created: 2026-08-02
updated: 2026-08-02
archived_at: null
---

## Notes

Roadmap item `S-07` from `context/foundation/roadmap.md`. Implemented directly, without a
`plan.md`: the change is one page, one array entry and one link, and the roadmap entry had
already closed every unknown it carried (content, visibility, and the decision that this is
its own route rather than a block on `/dashboard`).

This is the first roadmap item with **no PRD reference** — it is a product decision taken on
2026-08-02, not a requirement derived from `context/foundation/prd.md`.

## What was built

- `src/pages/help.astro` — the module. Exactly one sentence, verbatim from the roadmap:
  „W przypadku problemów skontaktuj się z deweloperem: tomek.maq@gmail.com", with the address
  as a `mailto:` link so reporting a problem is one click and not a transcription from the
  screen. Layout follows `src/pages/buildings/index.astro` (same card, same cosmic
  background, same „Wróć do panelu" footer link) so the module does not read as a foreign
  screen.
- `src/middleware.ts` — `/help` added to `PROTECTED_ROUTES`. **This entry is the change.**
  That array is the only auth gate in the app, and the roadmap is explicit that the decision
  „widoczne wyłącznie dla zalogowanego" *is* this one line; everything else here is text.
- `src/pages/dashboard.astro` — a „Pomoc" link beside the existing „Budynki" button. A route
  with no way to reach it is not delivered. Deliberately just a link: shared navigation and a
  module registry belong to `S-09`, and the roadmap names „rozdmuchać do infrastruktury
  modułowej" as this slice's main scope risk.

## Verification

No test runner exists in this project (`CLAUDE.md`), so this was verified by running it.

- `npm run lint` → exit 0; `npm run build` → Complete. (`npx astro sync` first, per `CLAUDE.md`.)
- The roadmap flags one thing that must be **tested, not read from code**: that `/help` is
  actually protected, because a protected and an unprotected page with an e-mail address on
  them look identical. Against `npm run dev`:
  - anonymous `GET /help` → `302` to `/auth/signin`
  - control, anonymous `GET /dashboard` (known protected) → `302` to `/auth/signin`
  - control, anonymous `GET /` (known public) → `200`

    The controls matter: without them a `302` proves nothing about whether the new entry is
    what produced it.
  - signed in as `test@test.com`, `GET /help` → `200`, and the page renders, with tags
    stripped, exactly: `W przypadku problemów skontaktuj się z deweloperem: tomek.maq@gmail.com`
  - signed-in `/dashboard` contains `href="/help"`

## Accepted consequences

- **The address is now in a public git history.** The repository is public on GitHub, so the
  e-mail enters history with the first commit and stays there even if later removed from the
  code. Putting the page behind login limits scraping *from the page*, not *from the history*.
  Recorded in the roadmap's Risk field before the first commit, because the decision is only
  taken once. The address is the project owner's own and matches the commit identity in this
  repository.
- **An owner voting from a per-unit link cannot reach this page**, by decision — `/vote/<token>`
  (`S-02`) is anonymous and the module is not exposed there. An owner stuck while voting falls
  back to telephoning the manager, the same route PRD `## Non-Goals` gives for objections. If
  that turns out to be a real problem after the first real vote, the answer is a separate
  minimal contact on the voting page, not opening this module to anonymous visitors.
- **`PROTECTED_ROUTES` matches with `startsWith`,** so `/help` also covers any future
  `/help/<subpage>` — consistent with how `/buildings` behaves today.
