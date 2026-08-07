import { expect, test } from "@playwright/test";

import { createBuilding, deleteBuildingNamed, uniqueBuildingName } from "./fixtures/db";
import { waitForHydration } from "./fixtures/hydration";

/**
 * Risk #8, `context/foundation/test-plan.md` §2 -- the half that is not the parser's.
 *
 * A registry file either imports cleanly or is refused with a message naming the offending
 * line, AND a refused import leaves the budynek importable again rather than half-populated
 * and permanently locked. That second clause is why this test exists and why it is not a
 * unit test: re-import is refused by product decision and v1 has no registry editing, so a
 * partial write turns a recoverable mistake into a dead budynek. Nothing below the browser
 * can see the difference -- it is the import page's own two states.
 *
 * §2 names two anti-patterns for this risk, and both shape the test:
 *   - "round-tripping the project's own template as the only input, which tests the
 *     generator against itself" -- so the input here is hand-authored to carry a real
 *     zarządca's messiness: a byte-order mark, `;` separators, CRLF line endings, a decimal
 *     comma, Polish diacritics, trailing blank rows, and one owner holding two lokale.
 *   - "treating a rejection as pass without checking what state it left behind" -- so the
 *     refusal is followed by three assertions about what survived it, not just by the
 *     message.
 *
 * Modelled on `seed.spec.ts`.
 */

const BOM = "﻿";
const CRLF = "\r\n";

interface RegistryRow {
  unit: string;
  area: string;
  owner: string;
  email: string;
}

/**
 * Builds the file an administrator actually exports from their zarządca's system, rather
 * than the file this project's own template generator emits.
 */
function registryCsv(rows: RegistryRow[]): Buffer {
  const lines = [
    "numer_lokalu;metraz;imie_nazwisko;email",
    ...rows.map((row) => [row.unit, row.area, row.owner, row.email].join(";")),
    // Trailing blank rows: spreadsheets leave them behind and the parser has to ignore them.
    "",
    "",
  ];
  return Buffer.from(BOM + lines.join(CRLF), "utf8");
}

function csvUpload(rows: RegistryRow[]) {
  return { name: "rejestr.csv", mimeType: "text/csv", buffer: registryCsv(rows) };
}

let createdBuilding: string | null = null;

test.afterEach(async () => {
  if (createdBuilding) {
    await deleteBuildingNamed(createdBuilding);
    createdBuilding = null;
  }
});

test("a refused registry import names the offending line and leaves the budynek importable", async ({ page }) => {
  const name = uniqueBuildingName("import");
  createdBuilding = name;
  const buildingId = await createBuilding(name);

  const owner = "Grażyna Wróbel-Świątek";
  const ownerEmail = "grazyna@example.com";

  // Two lokale share a number -- the one defect in an otherwise well-formed file, on the
  // third data row, which is physical line 4 once the header is counted.
  const withDuplicateUnit = csvUpload([
    { unit: "1", area: "52,40", owner, email: ownerEmail },
    { unit: "2", area: "38,15", owner: "Łukasz Żółć", email: "lukasz@example.com" },
    { unit: "1", area: "61,45", owner: "Zofia Jędrzejczak", email: "zofia@example.com" },
  ]);

  await page.goto(`/buildings/${buildingId}/units/import`);

  // The upload form is a `client:load` React island, and the file input is its own kind of
  // hydration trap: `setInputFiles` dispatches `change`, so a file attached before React
  // listens leaves the node holding a file and the component holding nothing. The form's
  // own guard then refuses the submit with "Wybierz plik CSV z listą lokali", which reads
  // exactly like a test that forgot to choose a file.
  await waitForHydration(page);

  await page.getByLabel("Plik CSV z listą lokali").setInputFiles(withDuplicateUnit);
  await page.getByRole("button", { name: "Wczytaj plik" }).click();

  // The message has to name the line, not just say "the file is wrong" -- an administrator
  // with a 60-row export cannot act on the second kind.
  const refusal = page.getByRole("alert");
  await expect(refusal).toContainText("Wiersz 4:");
  await expect(refusal).toContainText('Numer lokalu "1" powtarza się');

  // What the refusal left behind, part one: no lokale were written.
  await page.goto(`/buildings/${buildingId}/units`);
  await expect(page.getByText("Ten budynek nie ma jeszcze rejestru lokali.")).toBeVisible();

  // Part two: the budynek is still importable. The import page has exactly two states, and
  // this asserts it is in the one that still accepts a file.
  await page.goto(`/buildings/${buildingId}/units/import`);
  await expect(page.getByRole("button", { name: "Wczytaj plik" })).toBeVisible();

  // Part three, and the one that makes the other two mean something: the corrected file
  // goes all the way in. Same messiness, one number fixed.
  const corrected = csvUpload([
    { unit: "1", area: "52,40", owner, email: ownerEmail },
    { unit: "2", area: "38,15", owner: "Łukasz Żółć", email: "lukasz@example.com" },
    { unit: "3", area: "61,45", owner, email: ownerEmail },
  ]);

  // The refusal came back as a fresh server render, so the island is server-rendered again
  // and the race is back with it.
  await waitForHydration(page);

  await page.getByLabel("Plik CSV z listą lokali").setInputFiles(corrected);
  await page.getByRole("button", { name: "Wczytaj plik" }).click();

  // The preview recomputes udziały from the metraże; they have to total the whole building
  // before anything is written.
  await expect(page.getByRole("cell", { name: "Razem (3)" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "100,00%" })).toBeVisible();

  await page.getByRole("button", { name: "Zapisz rejestr lokali" }).click();
  await page.waitForURL(`**/buildings/${buildingId}/units`);

  // The owner held two of the three lokale, and both come back carrying their name -- so the
  // import dropped neither row and blanked neither owner. It does NOT prove the two lokale
  // point at one owner row: the list renders no owner identity, and consolidation is held by
  // `owners_building_id_email_key` and EM015, which the unit layer pins.
  await expect(page.getByRole("cell", { name: owner })).toHaveCount(2);
  await expect(page.getByRole("cell", { name: "100,00%" })).toBeVisible();

  // And only now is the budynek locked -- which is what the earlier "still importable"
  // assertion was distinguishing itself from.
  await page.goto(`/buildings/${buildingId}/units/import`);
  await expect(page.getByText("Ten budynek ma już zaimportowany rejestr lokali.")).toBeVisible();
});
