import { expect, test } from "@playwright/test";

import { waitForHydration } from "./fixtures/hydration";

/**
 * The sign-out path the product actually performs, guarded end to end.
 *
 * `src/pages/api/auth/signout.ts` used to discard the result of `signOut()`, so a failed
 * call still answered `302 → /` and left the administrator signed in. The fix reads the
 * error, clears the session cookies itself and sends the user somewhere that renders the
 * message. What this spec protects is the other half of that change: the working path must
 * still work. It cannot reproduce the bug -- that failure is server→Supabase and
 * `page.route()` only intercepts browser→server -- and the plan records it as such.
 *
 * The assertion is a persistent effect on purpose. Failure and success returned the same
 * status and the same `Location`, so anything asserting the response would have passed on
 * both; only `/dashboard` refusing to render proves the session is gone.
 *
 * This spec signs in itself and runs in its own project. `signOut()` defaults to
 * `scope: "global"`, which revokes every session of that account -- under
 * `fullyParallel: true` and one shared `storageState` it would sign the rest of the suite
 * out mid-assertion.
 */

const EMAIL = process.env.E2E_EMAIL ?? "test@test.com";
const PASSWORD = process.env.E2E_PASSWORD ?? "Test123!";

test("an administrator signs out and the session no longer opens the dashboard", async ({ page }) => {
  await page.goto("/auth/signin");

  // The form is a React island, so a `fill()` that lands before hydration is thrown away
  // when the controlled input first renders -- the field ends up empty and the submit is
  // refused client-side.
  await waitForHydration(page);

  await page.getByRole("textbox", { name: "Adres e-mail" }).fill(EMAIL);
  await page.getByRole("textbox", { name: "Hasło" }).fill(PASSWORD);

  // `button`, not `link` -- the header carries a "Zaloguj się" link on this same page.
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await page.waitForURL("**/dashboard");

  await page.getByRole("button", { name: "Wyloguj" }).click();
  await page.waitForURL((url) => url.pathname === "/");

  // Landing on `/` is what the old code did whether or not the session survived, so the
  // test only starts here: ask for a protected route and let the middleware answer.
  await page.goto("/dashboard");
  await page.waitForURL("**/auth/signin");
  await expect(page.getByRole("heading", { name: "Zaloguj się" })).toBeVisible();
});
