import { expect, test as setup } from "@playwright/test";

import { STORAGE_STATE } from "../playwright.config";
import { waitForHydration } from "./fixtures/hydration";

/**
 * Signs in once per run and hands the session to every other project through
 * `storageState`. Doing this once is not only about speed: a suite where each test signs
 * in first would report an auth failure as a failure of whatever that test was actually
 * about, and the two are worth telling apart.
 *
 * The account comes from `supabase/seed.sql` and exists in the local database only.
 * CI overrides both values through the environment so nothing here has to change when
 * the seed does.
 */
const EMAIL = process.env.E2E_EMAIL ?? "test@test.com";
const PASSWORD = process.env.E2E_PASSWORD ?? "Test123!";

setup("administrator signs in and the session is stored", async ({ page }) => {
  await page.goto("/auth/signin");

  // The sign-in form is a `client:load` React island. Filling it before React attaches
  // leaves both fields empty and the submit refused client-side -- and because this runs
  // as the `setup` project, that failure lands on every dependent test at once.
  await waitForHydration(page);

  await page.getByRole("textbox", { name: "Adres e-mail" }).fill(EMAIL);
  await page.getByRole("textbox", { name: "Hasło" }).fill(PASSWORD);

  // `button`, not `link` -- the header carries a "Zaloguj się" link on this same page.
  await page.getByRole("button", { name: "Zaloguj się" }).click();

  // The endpoint answers with a redirect carrying `?error=` on failure rather than a
  // non-2xx status, so a wrong password looks exactly like a right one until you read
  // where the browser ended up. Both assertions are load-bearing.
  await page.waitForURL("**/dashboard");
  await expect(page.getByText(`Zalogowano jako ${EMAIL}`)).toBeVisible();

  await page.context().storageState({ path: STORAGE_STATE });
});
