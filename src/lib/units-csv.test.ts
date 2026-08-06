import { describe, expect, it } from "vitest";

import { computeShareBps } from "@/lib/shares";
import { parseUnitsCsv, type ParseError, type ParsedRow, type ParseResult } from "@/lib/units-csv";
import {
  COMPLETENESS_DEFECTS_LINES,
  DUPLICATE_UNIT_NUMBER_LINES,
  EMPTY_FILE_BYTES,
  encodeCsv,
  HEADER_ONLY_LINES,
  MANAGER_EXPORT_LINES,
  MISSING_HEADER_COLUMN_LINES,
  ONE_EMAIL_TWO_NAMES_LINES,
  SIMPLE_REGISTRY_LINES,
  UNCLOSED_QUOTE_LINES,
  WINDOWS_1250_EXPORT,
} from "@/lib/units-csv.fixtures";

/**
 * The rejestr parse, pinned against what has to be true of a file an administrator uploads.
 *
 * The claim under test is the one Risk #8 makes: a file carrying the messiness of a real
 * zarządca's export either imports cleanly, or is refused with a message naming the wiersz to
 * go and open. Both halves matter, and the second is conditional -- four classes of defect
 * genuinely have no line to name, and this suite says which and why rather than pretending
 * otherwise.
 *
 * Why that matters more here than elsewhere: v1 has no re-import and no screen that edits a
 * rejestr once it exists (EM002). A refused import is not a recoverable mistake the
 * administrator works around later -- it is the whole feature refusing to start.
 *
 * No expected value in this file was read out of `src/lib/units-csv.ts`. The fixtures are
 * written as bytes in `units-csv.fixtures.ts` and spell out their own header line rather than
 * joining `CSV_HEADERS`, so a rename of a column breaks this suite instead of travelling
 * silently through it. Message assertions take the fragment that carries the domain content --
 * the repeated numer, the adres, the word an administrator would search for -- never a whole
 * Polish sentence: a reworded message that still names the wiersz and the winowajca is a
 * rewording, not a regression.
 */

/** Narrows a result to its rows, failing the test with the refusals if it is one. */
function rowsOf(result: ParseResult): ParsedRow[] {
  if (!result.ok) {
    throw new Error(`Expected the rejestr to import, got refusals: ${result.errors.map((e) => e.message).join(" | ")}`);
  }
  return result.rows;
}

/** Narrows a result to its refusals, failing the test if the file imported instead. */
function errorsOf(result: ParseResult): ParseError[] {
  if (result.ok) {
    throw new Error(`Expected a refusal, got ${result.rows.length} lokale.`);
  }
  return result.errors;
}

/** The refusal that names a given line, failing the test with the lines that were named. */
function refusalOnLine(errors: ParseError[], line: number): ParseError {
  const found = errors.find((error) => error.line === line);
  if (found === undefined) {
    throw new Error(`No refusal names line ${line}; the lines named were ${errors.map((e) => e.line).join(", ")}.`);
  }
  return found;
}

describe("a rejestr as a zarządca actually exports it", () => {
  it("imports whole, keeping every lokal the file describes and nothing it does not", () => {
    // One test for the whole file, on purpose. A real export arriving is one event: nine
    // separate tests, one per trait, would be asserting nine times that the parser copes with
    // one difficulty at a time, which is not what an administrator's morning looks like.
    //
    // Two of the traits are carried by the bytes rather than by a value, and they are not
    // equally protected. CRLF is: mishandle it and every record runs into the next one, which
    // is what this test notices first. The BOM is not, and the difference is worth stating
    // rather than glossing -- `TextDecoder` drops a leading U+FEFF unless `ignoreBOM` is set,
    // so the explicit strip at `units-csv.ts:252-253` removes a BOM that would have gone
    // anyway, and no assertion can tell the two behaviours apart. What the fixture's BOM does
    // prove is that a file written the way the szablon writes it survives the whole path.
    // That the strip itself is load-bearing is a claim this suite deliberately does not make.
    const rows = rowsOf(parseUnitsCsv(encodeCsv(MANAGER_EXPORT_LINES)));

    // The two trailing blank rows the spreadsheet left behind are not lokale, and U1 -- the
    // lokal użytkowy on the ground floor -- is.
    expect(rows.map((row) => row.unitNumber)).toEqual(["1", "2", "3", "4", "5", "6", "U1"]);

    // A metraż written the Polish way. 52,40 m² is 5240 hundredths, and it has to arrive as an
    // integer: it is the input to the udział allocation and, past that, to `numeric(8,2)`.
    expect(rows[0].areaHundredths).toBe(5240);
    expect(rows[6].areaHundredths).toBe(8825);

    // Diacritics survive the decode.
    expect(rows[2].fullName).toBe("Celina Wiśniewska");

    // The quoted column: it carries the separator inside the value, and the doubled "" the
    // spreadsheet wrote for a literal quotation mark collapses back to one.
    expect(rows[6].fullName).toBe('Biuro Rachunkowe "Kwadrat"; Marek Dąbrowski');

    // One address across two lokale, spelled identically both times, is a person who owns two
    // flats -- not a defect. PRD:236-244: the import collapses rows sharing an adres into one
    // właściciel, and both of these rows have to reach it carrying that adres.
    expect(rows[0].email).toBe("anna.kowalska@example.pl");
    expect(rows[4].email).toBe("anna.kowalska@example.pl");
  });
});

const REFUSALS_NAMING_A_WIERSZ = [
  {
    // Two lokale numbered 7. The refusal has to name both wiersze, because the administrator
    // cannot tell from one of them which is the copy and which is the original.
    name: "two lokale claiming the same numer",
    bytes: encodeCsv(DUPLICATE_UNIT_NUMBER_LINES),
    line: 3,
    fragments: ['"7"', "wierszu 2"],
  },
  {
    // "Jan Kowalski" and "JAN KOWALSKI" at one adres. Also names both wiersze, and the adres,
    // because that is what the administrator searches their spreadsheet for.
    name: "one adres held under two spellings of its właściciel",
    bytes: encodeCsv(ONE_EMAIL_TWO_NAMES_LINES),
    line: 3,
    fragments: ["jan.kowalski@example.pl", "Jan Kowalski", "wierszu 2"],
  },
  {
    // The line the quote OPENED on, not the line the parser ran out of file on. Everything
    // after a stray quotation mark is swallowed into one field, so the second number would
    // point at the end of the file and tell the administrator nothing.
    name: "a cudzysłów that never closes",
    bytes: encodeCsv(UNCLOSED_QUOTE_LINES),
    line: 3,
    fragments: ["cudzysłów"],
  },
];

describe("refusing a rejestr, and naming the wiersz to open", () => {
  it.each(REFUSALS_NAMING_A_WIERSZ)("$name is refused against its own wiersz", ({ bytes, line, fragments }) => {
    const refusal = refusalOnLine(errorsOf(parseUnitsCsv(bytes)), line);

    for (const fragment of fragments) {
      expect(refusal.message).toContain(fragment);
    }
  });
});

const REFUSALS_AT_LINE_ONE = [
  {
    name: "a file Excel saved as CSV rozdzielany średnikami instead of CSV UTF-8",
    why: "the bytes never decoded, so the file has no lines left to count",
    bytes: WINDOWS_1250_EXPORT,
    fragments: ["UTF-8", "Excel"],
  },
  {
    name: "a file holding nothing but a BOM",
    why: "there is no wiersz 2 to point at",
    bytes: EMPTY_FILE_BYTES,
    fragments: ["pusty"],
  },
  {
    name: "a szablon uploaded with nothing typed into it",
    why: "the nagłówek is the only wiersz the file has",
    bytes: encodeCsv(HEADER_ONLY_LINES),
    fragments: ["tylko nagłówek"],
  },
  {
    name: "a rejestr whose nagłówek lost the email column",
    why: "the nagłówek is genuinely wiersz 1 — this one is a real line number",
    bytes: encodeCsv(MISSING_HEADER_COLUMN_LINES),
    fragments: ["brakuje kolumn", "email"],
  },
];

describe("refusals that report wiersz 1 by construction", () => {
  // Each case says in its own name why 1 is the honest answer, so a later reader does not
  // "improve" these into real line numbers. Three of the four have no line to name at all; the
  // fourth names line 1 because the defect really is on line 1.
  it.each(REFUSALS_AT_LINE_ONE)("$name is refused at wiersz 1, because $why", ({ bytes, fragments }) => {
    const errors = errorsOf(parseUnitsCsv(bytes));

    expect(errors[0].line).toBe(1);
    for (const fragment of fragments) {
      expect(errors[0].message).toContain(fragment);
    }
  });
});

describe("one pass over the file", () => {
  it("reports all three defects at once, each against its own wiersz", () => {
    // `units-csv.ts:4-8` states the requirement this test exists for: an administrator working
    // from a 70-lokal spreadsheet who is told about one typo at a time makes seven round trips
    // through a screen that does not remember their file. So the oracle is not "an error was
    // returned" but "every defect was", and the set has to be exact -- a fourth line named
    // would be a false accusation, and a missing one sends the administrator back a second
    // time.
    //
    // The three defects sit behind three different gates in the row loop: the blank wiersz and
    // the wrong field count each end their iteration early, the bad adres is caught by
    // per-field validation. That is what makes a `continue` quietly turned into a `break`
    // visible here. It is also where those three defect classes get their "names a real
    // wiersz" assertion -- the fixture carries all three, so asserting them separately as well
    // would be the same regression counted twice.
    const errors = errorsOf(parseUnitsCsv(encodeCsv(COMPLETENESS_DEFECTS_LINES)));

    expect(errors.map((error) => error.line)).toEqual([3, 5, 7]);
    expect(refusalOnLine(errors, 3).message).toContain("pusty");
    expect(refusalOnLine(errors, 5).message).toContain("średnika");
    expect(refusalOnLine(errors, 7).message).toContain("e.wojcik(at)example.pl");
  });

  it("refuses a broken file rather than throwing on it, however it is broken", () => {
    // Totality is what makes "a refused import writes nothing" structural rather than
    // incidental: `src/pages/api/buildings/[id]/units.ts:55-57` returns before the RPC on any
    // result that is not `ok`, and it has nothing to catch a throw with. A throw would reach
    // the administrator as a 500 instead of as the sentence naming what to fix.
    const brokenFiles = [
      { name: "undecodable bytes", bytes: WINDOWS_1250_EXPORT },
      { name: "an empty file", bytes: EMPTY_FILE_BYTES },
      { name: "a nagłówek and nothing else", bytes: encodeCsv(HEADER_ONLY_LINES) },
      { name: "a nagłówek missing a column", bytes: encodeCsv(MISSING_HEADER_COLUMN_LINES) },
      { name: "an unclosed cudzysłów", bytes: encodeCsv(UNCLOSED_QUOTE_LINES) },
      { name: "a duplicated numer lokalu", bytes: encodeCsv(DUPLICATE_UNIT_NUMBER_LINES) },
      { name: "one adres, two właścicieli", bytes: encodeCsv(ONE_EMAIL_TWO_NAMES_LINES) },
      { name: "three unrelated defects", bytes: encodeCsv(COMPLETENESS_DEFECTS_LINES) },
    ];

    for (const { name, bytes } of brokenFiles) {
      expect(() => parseUnitsCsv(bytes), name).not.toThrow();
      expect(errorsOf(parseUnitsCsv(bytes)).length, name).toBeGreaterThan(0);
    }
  });
});

/** The udziały a set of rows earns, failing the test if the rejestr was refused an allocation. */
function sharesOf(rows: ParsedRow[]): number[] {
  const shares = computeShareBps(rows.map((row) => row.areaHundredths));
  if (!Array.isArray(shares)) {
    throw new Error(`Expected udziały, got a refusal: ${shares.error}`);
  }
  return shares;
}

/**
 * How a form submission rewrites the newlines in a field's value.
 *
 * Per the URL-encoded serialiser: every CR not followed by LF, and every LF not preceded by
 * CR, becomes CRLF. So the text the confirm endpoint receives is never byte-identical to the
 * text the preview put into the hidden input unless the file already used CRLF throughout.
 */
function normaliseNewlinesAsFormSubmission(text: string): string {
  return text.replace(/\r\n|\r|\n/g, "\r\n");
}

const PRESENTATIONS = [
  { name: "LF, bez BOM-u", newline: "\n", bom: false },
  { name: "LF, z BOM-em", newline: "\n", bom: true },
  { name: "CRLF, bez BOM-u", newline: "\r\n", bom: false },
  { name: "CRLF, z BOM-em — jak zapisuje polski Excel", newline: "\r\n", bom: true },
  { name: "CR, bez BOM-u", newline: "\r", bom: false },
  { name: "CR, z BOM-em", newline: "\r", bom: true },
] as const;

describe("one rejestr, however the file happens to be written down", () => {
  // What this group protects is not the parser for its own sake -- it is the promise
  // `src/pages/api/buildings/[id]/units.ts:49-59` makes: the confirm endpoint recomputes the
  // udziały from the CSV instead of trusting the ones the browser posts back, so a client
  // cannot hand its own lokal whatever voting weight it likes. That promise is only worth
  // anything if the second parse agrees with the first -- and the two parses do not see the
  // same bytes.
  it("yields the same lokale and the same udziały in all six presentations", () => {
    const readings = PRESENTATIONS.map(({ name, newline, bom }) => {
      const rows = rowsOf(parseUnitsCsv(encodeCsv(SIMPLE_REGISTRY_LINES, { newline, bom })));
      return { name, rows, shares: sharesOf(rows) };
    });

    const [first, ...rest] = readings;

    // Guard against the whole comparison being vacuous: three lokale must actually have been
    // read, and they must actually have been allocated udziały.
    expect(first.rows).toHaveLength(3);
    expect(first.shares).toHaveLength(3);

    for (const reading of rest) {
      expect(reading.rows, reading.name).toEqual(first.rows);
      expect(reading.shares, reading.name).toEqual(first.shares);
    }
  });

  it("survives the trip through the preview and back, though the bytes do not", () => {
    // The path, as it actually runs:
    //
    //   1. the administrator uploads a file -- here one saved with a BOM and lone LFs
    //   2. `import.astro:115` parses those bytes for the preview
    //   3. `import.astro:141` decodes them with `TextDecoder("utf-8")`, which drops the BOM,
    //      and puts the text into a hidden input (`import.astro:228`)
    //   4. submitting that form normalises every lone LF and lone CR to CRLF
    //   5. `units.ts:54` re-encodes with `TextEncoder` and parses again
    //
    // So the bytes the confirm endpoint parses differ from the uploaded ones in both of the
    // ways bytes can differ here: the BOM is gone and every terminator has changed. That is
    // expected and it is not a defect -- what has to hold is that neither difference reaches
    // the lokale or the udziały.
    const uploaded = encodeCsv(SIMPLE_REGISTRY_LINES, { newline: "\n", bom: true });
    const preview = rowsOf(parseUnitsCsv(uploaded));

    const inTheHiddenInput = new TextDecoder("utf-8").decode(uploaded);
    const posted = new TextEncoder().encode(normaliseNewlinesAsFormSubmission(inTheHiddenInput));
    const confirm = rowsOf(parseUnitsCsv(posted));

    // Not an assertion about the bytes being equal -- the opposite. If a later change made the
    // round trip byte-preserving after all, this test would still be true but would no longer
    // be testing anything, and this line is what would notice.
    expect(posted).not.toEqual(uploaded);

    expect(confirm).toEqual(preview);
    expect(sharesOf(confirm)).toEqual(sharesOf(preview));
  });
});
