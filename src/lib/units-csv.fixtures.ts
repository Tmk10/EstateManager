/**
 * Registry files, built as bytes, for the unit-import suites.
 *
 * Everything here is a fixture and nothing here asserts. The reason it exists as a module
 * rather than as `.csv` files in the repository: the parser's contract turns on three
 * things an editor edits silently -- the byte-order mark, the line terminator and the
 * encoding. A committed `.csv` would have whichever of those Prettier, git's autocrlf or
 * whoever opened it last happened to leave behind, and a fixture that changes meaning
 * without changing its diff is worse than no fixture. Here each of the three is named at
 * the call site.
 *
 * Named `.fixtures.ts` rather than `.test.ts` so the `include` glob in `vitest.config.ts`,
 * which collects only `*.test.ts`, does not pick it up as a suite with no assertions in it.
 *
 * Nothing in this file is derived from `src/lib/units-csv.ts` -- not the header line, not
 * the separator. A fixture generated from the constants the parser reads would agree with
 * the parser by construction and prove nothing about the file an administrator actually
 * uploads.
 */

/** How a file is written to disk. Excel's Polish defaults are CRLF and a BOM. */
export interface EncodeCsvOptions {
  newline?: "\n" | "\r\n" | "\r";
  bom?: boolean;
}

/**
 * Renders lines as the bytes of a CSV file.
 *
 * Every line is terminated, including the last -- a file saved by a spreadsheet ends with
 * a newline, so an array ending in two empty strings really is a file with two trailing
 * blank rows.
 */
export function encodeCsv(lines: string[], options: EncodeCsvOptions = {}): Uint8Array {
  const newline = options.newline ?? "\r\n";
  const withBom = options.bom ?? true;

  const body = new TextEncoder().encode(lines.map((line) => line + newline).join(""));
  if (!withBom) {
    return body;
  }

  const bytes = new Uint8Array(body.length + 3);
  bytes.set([0xef, 0xbb, 0xbf], 0);
  bytes.set(body, 3);
  return bytes;
}

/**
 * The header row, spelled out.
 *
 * Deliberately a literal rather than `CSV_HEADERS.join(CSV_SEPARATOR)`: this is the line a
 * zarządca's file carries, and it has to be able to disagree with the parser. The one place
 * the two are allowed to meet is the template contract test.
 */
export const HEADER_LINE = "numer_lokalu;metraz;imie_nazwisko;email";

/**
 * A kamienica's registry as a zarządca actually exports it, carrying nine traits at once:
 *
 *  1. a BOM (from `encodeCsv`'s default)
 *  2. CRLF terminators (likewise)
 *  3. semicolons, not commas, between fields
 *  4. metraże written with a decimal comma
 *  5. Polish diacritics in the names
 *  6. a quoted field containing the separator
 *  7. a doubled `""` inside that same quoted field
 *  8. one address held by one person across two lokale, spelled identically both times
 *  9. two trailing blank rows, left behind by the spreadsheet
 *
 * All nine in one file on purpose. A real export arriving is one event, and a suite that
 * split it into nine files would be asserting nine times that the parser handles one thing
 * at a time -- which is not the claim. Lokal U1 is a lokal użytkowy on the ground floor,
 * which is where the company name and the concatenated "firma; osoba kontaktowa" column
 * come from.
 */
export const MANAGER_EXPORT_LINES = [
  HEADER_LINE,
  "1;52,40;Anna Kowalska;anna.kowalska@example.pl",
  "2;38,15;Bogdan Nowak;b.nowak@example.pl",
  "3;64,80;Celina Wiśniewska;c.wisniewska@example.pl",
  "4;41,05;Damian Zieliński;d.zielinski@example.pl",
  "5;73,60;Anna Kowalska;anna.kowalska@example.pl",
  "6;29,90;Elżbieta Wójcik;e.wojcik@example.pl",
  'U1;88,25;"Biuro Rachunkowe ""Kwadrat""; Marek Dąbrowski";biuro@kwadrat.example.pl',
  "",
  "",
];

/**
 * A small, clean registry -- the subject of the round-trip invariance group.
 *
 * It has to mean the same thing however it is written down, so no field is quoted and no
 * field contains a newline: a quoted newline is the one construct whose meaning genuinely
 * depends on the terminator the file was saved with. The metraże are chosen so the shares
 * do not divide evenly, because a registry that divides evenly would round-trip identically
 * even through an allocator that got the leftover wrong.
 */
export const SIMPLE_REGISTRY_LINES = [
  HEADER_LINE,
  "1;52,40;Anna Kowalska;anna.kowalska@example.pl",
  "2;38,15;Bogdan Nowak;b.nowak@example.pl",
  "3;64,80;Celina Wiśniewska;c.wisniewska@example.pl",
];

/**
 * Three defects, on lines 3, 5 and 7, and nothing else wrong with the file.
 *
 * The point is completeness: one pass has to report all three. Each sits behind a different
 * gate in the row loop -- the blank row and the wrong field count each end their iteration
 * early, the bad address is caught by per-field validation -- so a `continue` quietly turned
 * into a `break` loses the defects after it and this fixture is what notices.
 *
 * Nothing here may trip a path that returns before the loop runs: no unclosed quote, no
 * undecodable byte, no header defect, no empty or header-only file. A "completeness" fixture
 * that bails out early asserts nothing about completeness.
 */
export const COMPLETENESS_DEFECTS_LINES = [
  HEADER_LINE,
  "1;52,40;Anna Kowalska;anna.kowalska@example.pl",
  // line 3 -- a row whose contents were deleted, the row itself left behind
  "",
  "2;38,15;Bogdan Nowak;b.nowak@example.pl",
  // line 5 -- the semicolon before the address is missing, so the row is one field short
  "3;64,80;Celina Wiśniewska c.wisniewska@example.pl",
  "4;41,05;Damian Zieliński;d.zielinski@example.pl",
  // line 7 -- an address with the @ written out, the shape a scanned or hand-typed list has
  "5;29,90;Elżbieta Wójcik;e.wojcik(at)example.pl",
];

/** The lines of a file whose two lokale claim the same number. The second one is line 3. */
export const DUPLICATE_UNIT_NUMBER_LINES = [
  HEADER_LINE,
  "7;52,40;Anna Kowalska;anna.kowalska@example.pl",
  "7;38,15;Bogdan Nowak;b.nowak@example.pl",
];

/**
 * One address, two spellings of the owner. Line 3 is the second spelling.
 *
 * Case is the whole difference, which is what makes this refusal contentious rather than
 * obvious -- the import function collapses by lowercased address and keeps the first name it
 * sees, so accepting this would store one spelling and drop the other after the preview had
 * already shown both.
 */
export const ONE_EMAIL_TWO_NAMES_LINES = [
  HEADER_LINE,
  "1;52,40;Jan Kowalski;jan.kowalski@example.pl",
  "2;38,15;JAN KOWALSKI;jan.kowalski@example.pl",
];

/**
 * A stray quotation mark on line 3, opened and never closed.
 *
 * Line 4 exists so the file demonstrates what the defect costs: everything after the quote
 * is swallowed into a single field, which is why the refusal names the line the quote opened
 * on rather than the line the parser was on when it ran out of file.
 */
export const UNCLOSED_QUOTE_LINES = [
  HEADER_LINE,
  "1;52,40;Anna Kowalska;anna.kowalska@example.pl",
  '2;38,15;"Nowak; Bogdan;b.nowak@example.pl',
  "3;64,80;Celina Wiśniewska;c.wisniewska@example.pl",
];

/** A template downloaded, saved and uploaded without anything typed into it. */
export const HEADER_ONLY_LINES = [HEADER_LINE];

/** A file whose header lost the address column -- one row, so the header is the only defect. */
export const MISSING_HEADER_COLUMN_LINES = ["numer_lokalu;metraz;imie_nazwisko", "1;52,40;Anna Kowalska"];

/**
 * An empty file: a BOM and nothing after it, which is what a spreadsheet saves from a sheet
 * with nothing on it.
 */
export const EMPTY_FILE_BYTES = encodeCsv([]);

/**
 * The Polish letters Windows-1250 encodes as single bytes, with the byte each one takes.
 *
 * `TextEncoder` cannot produce these -- it emits UTF-8 and nothing else -- so a fixture that
 * claims to be a Windows-1250 export has to spell the bytes out.
 */
const WINDOWS_1250_POLISH = new Map<string, number>([
  ["ą", 0xb9],
  ["Ą", 0xa5],
  ["ć", 0xe6],
  ["Ć", 0xc6],
  ["ę", 0xea],
  ["Ę", 0xca],
  ["ł", 0xb3],
  ["Ł", 0xa3],
  ["ń", 0xf1],
  ["Ń", 0xd1],
  ["ó", 0xf3],
  ["Ó", 0xd3],
  ["ś", 0x9c],
  ["Ś", 0x8c],
  ["ź", 0x9f],
  ["Ź", 0x8f],
  ["ż", 0xbf],
  ["Ż", 0xaf],
]);

/** Encodes ASCII plus Polish letters the way Polish Excel does when nobody chose UTF-8. */
function encodeWindows1250(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (code < 0x80) {
      bytes[index] = code;
      continue;
    }
    const mapped = WINDOWS_1250_POLISH.get(text.charAt(index));
    if (mapped === undefined) {
      throw new Error(`No Windows-1250 byte known for "${text.charAt(index)}" — add it to the table above.`);
    }
    bytes[index] = mapped;
  }
  return bytes;
}

/**
 * A registry saved as "CSV (rozdzielany średnikami)" rather than "CSV UTF-8", which is the
 * default a Polish Excel offers first and the single most likely way an unreadable file
 * arrives.
 *
 * The bytes that break the decode are ł (0xB3), ó (0xF3) and ą (0xB9) -- real letters out of
 * a real surname, each landing where UTF-8 expects a lead byte. A file made undecodable by an
 * arbitrary invalid byte would fail the same way and would be a claim about nothing.
 */
export const WINDOWS_1250_EXPORT = encodeWindows1250(
  [HEADER_LINE, "1;52,40;Małgorzata Wójcik-Zając;m.wojcik@example.pl"].map((line) => line + "\r\n").join(""),
);
