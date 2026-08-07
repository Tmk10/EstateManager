# Swallowed sign-out error — Plan Brief

> Full plan: `context/changes/swallowed-error-signout/plan.md`

## What & Why

`src/pages/api/auth/signout.ts` discards the `{ error }` that `supabase.auth.signOut()` returns and
redirects unconditionally. When the call fails, the administrator sees the home page and remains
fully signed in — the session cookie is never cleared. The one control whose entire purpose is to
end a session reports success when it did nothing.

## Starting Point

Ten lines with two silent paths: the discarded error, and the `if (supabase)` that skips everything
when Supabase is unconfigured. Reproduced against a live stack: with `POST /auth/v1/logout` forced
to 500, the endpoint answers `302 → /` with **no** `Set-Cookie`, and `/dashboard` still renders.
The SDK explains it — `_signOut` returns before `_removeSession()` on any error other than
401/403/404, so the storage adapter that writes the cookie is never called.

## Desired End State

A failed sign-out lands on `/auth/signin` with a Polish message, with this browser's session
cookies deleted and one line in the server log. A successful sign-out is unchanged.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Which swallowed error to fix | `signout.ts` only | Cleanest match to the task; `health.ts` drags the deploy gate along, `middleware.ts` is a different symptom | Prior |
| Fix shape | Redirect with `?error=` + delete cookies locally | Message alone leaves the user signed in; `/` does not render `?error=` | Prior |
| Testable seam | Pure function in `src/lib/auth-signout.ts` | Astro routes every `.ts` under `src/pages/`, so a test beside the route would publish `/api/auth/signout.test` | Plan |
| Unconfigured branch | In scope | Same file, same silence, one extra assertion | Plan |
| Server-side log | `console.error`, as in `email.ts:93` | Today there is no other channel; the failure would otherwise be visible to one user only | Plan |
| E2E | Happy path only, isolated project | `page.route()` cannot intercept server→Supabase, so the bug is unreachable from a browser | Plan |
| Test order inside Phase 1 | test → transcribe today's behaviour → fix | Otherwise the red is a missing module rather than the bug | Plan |

## Scope

**In scope:** `src/pages/api/auth/signout.ts`, a new `src/lib/auth-signout.ts` + its test, an E2E
spec, and the Playwright project that isolates it.

**Out of scope:** `src/middleware.ts` and `src/pages/api/health.ts` (the other two instances of the
same class), error monitoring, and server-side revocation of the refresh token.

## Architecture / Approach

The decision (where to redirect, which cookies to delete, what to log) is a pure function; the route
keeps the effects. That split exists because Vitest here runs without an Astro pipeline, and because
a test file cannot live under `src/pages/` without becoming a route.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Propagate the failure | Reproducing unit test, the decision function, the rewired route | The red must come from the bug, not from a missing import — hence the transcription step |
| 2. Browser guard | E2E spec for successful sign-out + its own Playwright project | `signOut()` is global-scope: without isolation it revokes the session shared by every parallel test |

**Prerequisites:** local Supabase stack for the manual verification and for E2E; a way to force
`POST /auth/v1/logout` to 500 (a narrow local proxy was used for the reproduction).
**Estimated effort:** one session.

## Open Risks & Assumptions

- Clearing cookies closes the session **in this browser only**. A session established elsewhere
  survives, because the call that would revoke it is the one that failed. The message says so
  rather than implying more.
- Adding a Playwright project changes shared config; if the ordering proves flaky, the fallback is
  to drop the E2E spec rather than to weaken isolation.

## Success Criteria (Summary)

- A failed sign-out is visible to the administrator instead of silent, and does not leave a live
  session in the browser that asked to end it.
- A test that fails before the fix and passes after, asserting the persistent effect rather than
  the response.
- Successful sign-out is unchanged, and a browser test now says so.
