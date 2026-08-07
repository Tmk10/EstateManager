import { expect, type Page } from "@playwright/test";

/**
 * Waits until every island on the page has hydrated.
 *
 * Every form in this product is a `client:load` React island. Astro server-renders it, so
 * the markup -- and every locator that finds it -- is there from the first paint, several
 * hundred milliseconds before React attaches. An interaction that lands inside that gap
 * reaches real DOM and is then thrown away when the controlled component first renders.
 *
 * Nothing about the failure looks like a race afterwards. The field is simply empty, the
 * form's own guard refuses the submit, and the spec dies on an assertion several steps
 * later -- `waitForURL` never arriving, or an alert reading "Wybierz plik CSV" as though
 * the test had forgotten to choose one.
 *
 * Two tempting fixes are both wrong. `waitForTimeout()` is banned here and would be a
 * guess at someone else's machine's speed. Filling and re-filling until the value sticks
 * looks like it waits for hydration by its effect, but it does not: the value survives
 * momentarily either way, so the assertion passes against plain DOM and React clears the
 * field immediately afterwards. That version left the first field of a three-field form
 * empty while the other two kept their values.
 *
 * So wait for the framework's own signal instead. Astro renders `<astro-island ssr>` and
 * removes that attribute at the end of hydration, immediately before dispatching
 * `astro:hydrate` (`astro/dist/runtime/server/astro-island.js`). No islands still carrying
 * `ssr` means every one of them is live.
 *
 * This is the one place in the suite that uses a CSS selector, against the rule in
 * CLAUDE.md that locators go through roles and labels. The rule is about finding the
 * elements under test, and this finds no such element: it asks the framework whether it
 * has finished. There is no accessible name for that, because it is not something a user
 * can perceive.
 */
export async function waitForHydration(page: Page): Promise<void> {
  await expect(page.locator("astro-island[ssr]")).toHaveCount(0);
}
