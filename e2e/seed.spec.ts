import { expect, test } from "@playwright/test";

import { deleteBuildingNamed, uniqueBuildingName } from "./fixtures/db";
import { waitForHydration } from "./fixtures/hydration";

/**
 * The pattern every other spec in this directory is modelled on. Four things are
 * deliberate here and are meant to be copied:
 *
 *   1. `getByRole` with the accessible name, never a CSS selector or a DOM path.
 *   2. Waiting on state -- a URL, a visible element -- and never on a duration.
 *   3. A unique name per test, so two runs and two workers never see each other's rows.
 *   4. Cleanup in `afterEach`, which runs even when the test failed.
 *
 * Risk #8, `context/foundation/test-plan.md` §2: an administrator cannot get a budynek and
 * its rejestr into the system at all. Phase 1 pinned the registry parser as a unit; the
 * path from the form to a rendered list crosses auth, routing, the API, the database and
 * SSR, and none of those crossings is asserted anywhere else.
 */

let createdBuilding: string | null = null;

test.afterEach(async () => {
  if (createdBuilding) {
    await deleteBuildingNamed(createdBuilding);
    createdBuilding = null;
  }
});

test("an administrator adds a budynek and it is still on the list after a reload", async ({ page }) => {
  const name = uniqueBuildingName("seed");
  createdBuilding = name;

  await page.goto("/buildings/new");

  // The form is a `client:load` React island. A fill that lands before hydration is
  // discarded when the controlled input first renders, leaving the field empty and the
  // submit refused -- which surfaces much later, as the redirect below never arriving.
  await waitForHydration(page);

  await page.getByRole("textbox", { name: "Nazwa budynku" }).fill(name);
  await page.getByRole("textbox", { name: "Miejscowość" }).fill("Warszawa");
  await page.getByRole("textbox", { name: "Ulica i numer" }).fill("Kwiatowa 3");

  // `button`, not `link` -- /buildings carries a "Dodaj budynek" link under the same name.
  await page.getByRole("button", { name: "Dodaj budynek" }).click();

  // The endpoint answers a failed create with a redirect back to the form carrying
  // `?error=`, so landing on the list is itself part of the assertion.
  await page.waitForURL("**/buildings");

  const entry = page.getByRole("link", { name });
  await expect(entry).toBeVisible();

  // The point of the reload: the first render could be serving what this request just
  // posted. Only the second one proves a row was written and is read back.
  await page.reload();
  await expect(page.getByRole("link", { name })).toBeVisible();
});
