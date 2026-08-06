import { describe, expect, it } from "vitest";

import { parseUnitsCsv } from "@/lib/units-csv";
// The only import from `src/pages/` in the whole suite, and it is the point of this file: what
// is under test is a contract between two modules, and neither side of it means anything
// alone. The handler ignores its context argument and touches no Astro API, so it can simply
// be called; `environment: "node"` in `vitest.config.ts` provides `Response`. There is no
// exported constant to import instead -- the szablon's bytes exist only inside the response.
import { GET } from "@/pages/api/buildings/units-template.csv";

/**
 * The szablon an administrator downloads, read back by the parser that will receive it.
 *
 * Deliberately NOT the happy path of the parse suite. Round-tripping the project's own szablon
 * as the proof that imports work is the anti-pattern Risk #8 names: it is a file the system
 * wrote for itself, so it agrees with the parser by construction and says nothing about what a
 * zarządca sends. What it can prove -- and this is all it is asked to prove -- is that the two
 * sides still agree on the three things they could silently drift apart on: the column names,
 * the separator and the BOM.
 */
describe("the szablon an administrator downloads", () => {
  it("comes back to the parser as a file with no lokale in it, not as a file it cannot read", async () => {
    // "Only a nagłówek" is the whole assertion. Any header error -- an unknown column, a
    // missing one -- would mean the szablon and the parser had drifted on names, on the
    // separator, or on the BOM; a decode error would mean the encoding had. The header-only
    // refusal is the one message that can only come back when all three still match and the
    // file simply has nothing typed into it, which is exactly what a freshly downloaded
    // szablon is.
    const response = await GET({} as never);
    const result = parseUnitsCsv(new Uint8Array(await response.arrayBuffer()));

    if (result.ok) {
      throw new Error(`Expected the empty szablon to be refused, got ${result.rows.length} lokale.`);
    }

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain("tylko nagłówek");
  });
});
