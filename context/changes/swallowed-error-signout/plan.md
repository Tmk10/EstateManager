# Swallowed sign-out error — Implementation Plan

## Overview

`src/pages/api/auth/signout.ts` calls `supabase.auth.signOut()` and throws away its result. When
the call fails, the administrator is redirected to `/` and stays fully signed in — the session
cookie is never touched. This plan makes the failure visible: the error is read, propagated to a
screen that renders it, logged server-side, and the local session cookies are cleared so the
button does at least what it can still do.

## Current State Analysis

```ts
// src/pages/api/auth/signout.ts — all of it
const supabase = createClient(context.request.headers, context.cookies);
if (supabase) {
  await supabase.auth.signOut();
}
return context.redirect("/");
```

Two silent paths in ten lines. The `await` discards `{ error }`; the `if` discards the
unconfigured case, which `src/lib/supabase.ts:7` produces whenever `SUPABASE_URL` / `SUPABASE_KEY`
are unset — the very shape CLAUDE.md warns about ("every auth path silently no-ops").

The failure was reproduced against a live stack with a narrow proxy returning 500 on
`POST /auth/v1/logout` only:

| | `/dashboard` before | `/api/auth/signout` | `Set-Cookie` | `/dashboard` after |
| --- | --- | --- | --- | --- |
| failure (`/logout` → 500) | 200 | `302 → /` | **none** | **200 — still signed in** |
| control (`/logout` → 204) | 200 | `302 → /` | `sb-127-auth-token=; Max-Age=0` | `302 → /auth/signin` |

**The two runs are indistinguishable from outside** — same status, same `Location`. Anything that
asserts the response passes on both. The only difference is a persistent effect.

Why the session survives, from the SDK source:

- `GoTrueClient._signOut` (`node_modules/@supabase/auth-js/dist/main/GoTrueClient.js:3182`)
  tolerates only 404/401/403 and "session missing"; any other error returns early.
- That early return sits **before** `_removeSession()` (same file, line 3203), which is the only
  code that clears the storage key — the cookie adapter in `src/lib/supabase.ts:18`. Not called
  means no `Set-Cookie`.
- So 5xx, 429 and network failures leave the session intact. Expired tokens do not: 401 is
  tolerated and clears correctly.

Retrying with `signOut({ scope: "local" })` does not help — `admin.signOut(accessToken, scope)`
runs before the `scope !== "others"` branch, so a local-scope sign-out still makes the same
network call and fails the same way. Clearing the cookies from our side is the only remedy.

## Desired End State

Clicking "Wyloguj" when the Supabase call fails lands the administrator on `/auth/signin` with a
Polish message explaining what happened, with the session cookies for this browser deleted, and
with one line in the server log. A successful sign-out is unchanged: `302 → /`, cookies cleared by
the SDK as before.

### Key Discoveries

- `src/pages/api/auth/signin.ts:11,16` is the propagation shape to copy; `src/pages/auth/signin.astro:6,25`
  renders `?error=` through `SignInForm serverError`. `src/pages/index.astro` does **not** read
  `?error=`, so redirecting to `/` would be a second swallow.
- `@supabase/ssr` chunks the session cookie as `<key>.0`, `<key>.1`
  (`node_modules/@supabase/ssr/dist/main/utils/chunker.js:63`). Deleting only the base name would
  leave a chunked session alive.
- **Astro routes every `.ts` file under `src/pages/`**, so a test beside the route would publish
  `/api/auth/signout.test` as a live endpoint. The logic has to move to `src/lib/` to be testable —
  where `shares.ts` and `units-csv.ts` already sit, dependency-free, for the same reason.
- `src/lib/email.ts:93` is the house pattern for a failure that must be reported rather than
  thrown: `console.error` behind an `eslint-disable`, plus the error returned as a value.
- `playwright.config.ts` runs `fullyParallel: true` with one shared `storageState`, and
  `signOut()` defaults to `scope: "global"` — which revokes every session of that user. A sign-out
  spec sharing that state would kill sibling tests mid-run.

## What We're NOT Doing

- **Not touching `src/middleware.ts`** (candidate K-C: `getUser()`'s error discarded by
  destructuring) and **not touching `src/pages/api/health.ts`** (candidate K-B: missing `EMAIL`
  binding reported as `200`). Both are real instances of the same class; K-B is a recorded
  decision with a `deploy.yml` gate attached to it, and neither is in scope here.
- Not adding error monitoring — that is a separate change.
- Not attempting to invalidate the refresh token server-side when the call fails. **Recorded
  boundary:** clearing cookies closes the session in this browser only; a session established
  elsewhere survives, and there is no way around that when the very call that would revoke it is
  the one failing. The user-facing message says so rather than implying more.
- Not changing `src/pages/api/auth/signin.ts`, even though its `"Supabase is not configured"`
  message is English on a Polish screen.

## Implementation Approach

The decision — where to send the user, which cookies to delete, what to log — becomes a pure
function in `src/lib/auth-signout.ts`, taking the sign-out result and the request's cookie names,
returning a discriminated union. The route keeps the effects: it calls Supabase, applies the
deletions, logs, and redirects. This is the seam that makes the behaviour testable under Vitest,
which has no Astro pipeline (`vitest.config.ts`).

Phase 1 runs test-first in three steps, and the order is what makes the red honest:

1. Write `src/lib/auth-signout.test.ts` asserting the **desired** behaviour.
2. Create `src/lib/auth-signout.ts` as a faithful transcription of today's behaviour — error
   ignored, always `/`, nothing deleted — and rewire the route to it with no user-visible change.
   The test now fails **because the bug is present**, not because a module is missing.
3. Fix the function and the route until green.

## Phase 1: Propagate the sign-out failure

### Overview

The bug is reproduced by a unit test, then fixed. One phase, three ordered steps.

### Changes Required

#### 1. The reproducing test

**File**: `src/lib/auth-signout.test.ts` (new — written first)

**Intent**: Pin the behaviour that the response cannot show. Every assertion is about a persistent
effect (which cookies get deleted, where the user is sent), never about a status code — the
reproduction proved failure and success return identical responses.

**Contract**: Four cases —
(a) `signOut()` succeeded → `ok: true`, redirect `/`, no cookie deletions (the SDK cleared them);
(b) `signOut()` returned an error → `ok: false`, redirect to `/auth/signin?error=…`, and the
deletion list contains the base session cookie **and its `.0` / `.1` chunks**;
(c) Supabase unconfigured → `ok: false` with its own message and the same cookie sweep;
(d) unrelated cookies (`theme`, `sb-something-else`) are never in the deletion list.

#### 2. The decision function

**File**: `src/lib/auth-signout.ts` (new)

**Intent**: Decide the outcome of a sign-out attempt without performing any effect, so it can be
executed under bare Vitest. Imports nothing — same discipline as `src/lib/shares.ts`.

**Contract**:

```ts
export type SignOutDecision =
  | { ok: true; redirectTo: "/"; cookiesToDelete: string[]; logMessage: null }
  | {
      ok: false;
      reason: "signout-failed" | "unconfigured";
      redirectTo: string;
      cookiesToDelete: string[];
      logMessage: string;
    };

export function decideSignOut(input: {
  configured: boolean;
  error: { message: string } | null;
  cookieNames: string[];
}): SignOutDecision;
```

Session cookies are matched with `/^sb-.+-auth-token(\.\d+)?$/` — the base name plus any chunk
index. `redirectTo` for both failure branches is `/auth/signin?error=` + `encodeURIComponent(…)`,
copying `src/pages/api/auth/signin.ts:16`.

Messages, Polish and gender-neutral (CLAUDE.md: all user-facing copy is Polish):

- `signout-failed`: `Nie udało się zamknąć sesji na serwerze. Sesja w tej przeglądarce została zamknięta.`
- `unconfigured`: `Wylogowanie jest chwilowo niedostępne. Sesja w tej przeglądarce została zamknięta.`

`logMessage` stays English, like every other log line in the repo, and carries the Supabase
message. It must never carry a token or a cookie value.

#### 3. The route

**File**: `src/pages/api/auth/signout.ts`

**Intent**: Read the result instead of discarding it, then apply the decision. The route holds the
effects and nothing else.

**Contract**: Collect the request's cookie names with `parseCookieHeader` from `@supabase/ssr`
(already the source of truth for cookie parsing in `src/lib/supabase.ts:13`); call
`decideSignOut`; delete each returned name with `context.cookies.delete(name, { path: "/" })`;
`console.error(decision.logMessage)` when non-null, behind the same `eslint-disable` comment shape
as `src/lib/email.ts:93`; redirect to `decision.redirectTo`. The unconfigured branch no longer
falls through to `/`.

### Success Criteria

#### Automated Verification

- The new test fails against the transcribed behaviour before the fix, on the cookie and
  redirect assertions: `npm test`
- All unit tests pass after the fix: `npm test`
- Linting passes: `npm run lint`
- Type check is clean: `npx astro check`
- Production build succeeds: `npm run build`

#### Manual Verification

- With the local stack up and `POST /auth/v1/logout` forced to 500, clicking "Wyloguj" lands on
  `/auth/signin` with the Polish message visible, and `/dashboard` then redirects to the sign-in
  screen instead of rendering.
- With the stack healthy, "Wyloguj" still lands on `/` and the session is gone.

**Implementation Note**: after automated verification passes, pause for manual confirmation before
Phase 2.

---

## Phase 2: Guard the successful path in a browser

### Overview

A Playwright spec covering the sign-out the product actually performs. It cannot reproduce the bug
— the failure is server→Supabase and `page.route()` only intercepts browser→server — so its job is
strictly to keep the fix from breaking the working path.

### Changes Required

#### 1. The spec

**File**: `e2e/signout.spec.ts` (new)

**Intent**: Prove that a signed-in administrator who clicks "Wyloguj" ends up signed out — the
persistent effect again, not the redirect.

**Contract**: Sign in through the UI inside the spec (`getByRole` locators, as in
`e2e/auth.setup.ts`), click the "Wyloguj" button from `src/components/Topbar.astro:31`, wait for
`/`, then navigate to `/dashboard` and assert the sign-in screen. No `waitForTimeout`. Nothing to
clean up: the spec creates no rows, so `e2e/fixtures/db.ts` is not involved.

#### 2. Isolation for a globally-destructive test

**File**: `playwright.config.ts`

**Intent**: Keep this spec from revoking the session every other test shares. `signOut()` defaults
to `scope: "global"`, which invalidates all of that user's sessions; with `fullyParallel: true`
and one `storageState`, a sibling test could lose its session mid-assertion.

**Contract**: A third project, `signout`, matching `signout.spec.ts`, with `dependencies: ["chromium"]`
so it runs after the rest, and **no** `storageState` — it signs in itself. `testIgnore` on the
`chromium` project keeps the spec from running twice.

### Success Criteria

#### Automated Verification

- E2E suite passes end to end, new spec included: `npm run test:e2e`
- The full repo gate is green: `npm run lint && npm test && npm run build`

#### Manual Verification

- The E2E run shows the `signout` project starting only after `chromium` finishes, and no other
  spec fails with an auth error.

---

## Testing Strategy

### Unit tests

`src/lib/auth-signout.test.ts` — the four cases above. This is the test that reproduces the bug;
it must be seen failing before the fix lands.

### Integration / browser tests

`e2e/signout.spec.ts` — the successful path only, for the reason stated above.

### Not covered

`npm run test:db` does not apply: nothing under `supabase/` changes. No test covers the failing
path in a browser, and none can without a fault-injecting proxy in front of Supabase; the manual
verification step in Phase 1 is what exercises it.

## References

- Propagation shape to copy: `src/pages/api/auth/signin.ts:11,16`
- Rendering of `?error=`: `src/pages/auth/signin.astro:6,25`
- Error-as-value pattern: `src/lib/email.ts:93,140`
- Why the session survives: `node_modules/@supabase/auth-js/dist/main/GoTrueClient.js:3182,3203`
- Cookie chunk naming: `node_modules/@supabase/ssr/dist/main/utils/chunker.js:63`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Propagate the sign-out failure

#### Automated

- [x] 1.1 The new test fails against the transcribed behaviour before the fix: `npm test` — 623a784
- [x] 1.2 All unit tests pass after the fix: `npm test` — 623a784
- [x] 1.3 Linting passes: `npm run lint` — 623a784
- [x] 1.4 Type check is clean: `npx astro check` — 623a784
- [x] 1.5 Production build succeeds: `npm run build` — 623a784

#### Manual

- [x] 1.6 Forced 500 on `/auth/v1/logout`: message visible on `/auth/signin`, `/dashboard` redirects — 623a784
- [x] 1.7 Healthy stack: "Wyloguj" lands on `/` and the session is gone — 623a784

### Phase 2: Guard the successful path in a browser

#### Automated

- [x] 2.1 E2E suite passes with the new spec: `npm run test:e2e`
- [x] 2.2 Full repo gate green: `npm run lint && npm test && npm run build`

#### Manual

- [x] 2.3 `signout` project runs after `chromium`, no sibling auth failures
