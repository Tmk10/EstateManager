/**
 * CSV parsing for the unit registry import (S-01b).
 *
 * Turns uploaded bytes into validated rows, or into a complete list of everything wrong
 * with the file. "Complete" is the requirement, not a nicety: an administrator working
 * from a 70-unit spreadsheet who is told about one typo at a time will make seven round
 * trips through a screen that refuses to remember their file.
 *
 * No dependencies, no Astro, no Supabase -- the module is executable on its own, which is
 * how its arithmetic gets verified in a repository with no test runner.
 */

/**
 * The four column names, in the order the downloadable template emits them.
 *
 * src/pages/api/buildings/units-template.csv.ts generates that template from this exact
 * constant, so the file an administrator downloads and the file this parser accepts
 * cannot drift apart. Renaming a column here renames it there, in the same commit.
 */
export const CSV_HEADERS = ["numer_lokalu", "metraz", "imie_nazwisko", "email"] as const;

/** Field separator. Semicolon, because that is what Polish Excel writes. */
export const CSV_SEPARATOR = ";";

const MAX_ROWS = 1000;
const MAX_UNIT_NUMBER_LENGTH = 50;
const MAX_FULL_NAME_LENGTH = 200;
// RFC 5321's maximum reverse-path length, and the widest an address is ever allowed to be.
const MAX_EMAIL_LENGTH = 320;
// 10000 m2 per unit, held as hundredths. Generous for a flat, tight enough that a stray
// digit ("15000" for "150,00") is caught rather than stored.
const MAX_AREA_HUNDREDTHS = 10000 * 100;

export interface ParsedRow {
  unitNumber: string;
  /** Floor area in hundredths of a square metre. Integer -- never a float. */
  areaHundredths: number;
  fullName: string;
  email: string | null;
}

export interface ParseError {
  /** 1-based line in the uploaded file. The header is line 1. */
  line: number;
  /** Polish. Shown to the administrator verbatim. */
  message: string;
}

export type ParseResult = { ok: true; rows: ParsedRow[] } | { ok: false; errors: ParseError[] };

interface RawRecord {
  /** Physical line the record starts on, 1-based. */
  line: number;
  fields: string[];
}

/**
 * Splits CSV text into records.
 *
 * Quoted fields may contain the separator, a quote (doubled, `""`), and newlines -- Excel
 * emits all three. Because a quoted field can span lines, a record's reported line is the
 * line it *starts* on, which is the one an administrator will look at.
 */
function splitRecords(text: string): RawRecord[] {
  const records: RawRecord[] = [];
  let fields: string[] = [];
  let field = "";
  let inQuotes = false;
  let line = 1;
  let recordStartLine = 1;
  let index = 0;

  const endRecord = () => {
    fields.push(field);
    records.push({ line: recordStartLine, fields });
    fields = [];
    field = "";
    line += 1;
    recordStartLine = line;
  };

  while (index < text.length) {
    const char = text.charAt(index);

    if (inQuotes) {
      if (char === '"') {
        if (text.charAt(index + 1) === '"') {
          field += '"';
          index += 2;
          continue;
        }
        inQuotes = false;
        index += 1;
        continue;
      }
      if (char === "\r" || char === "\n") {
        // Normalise the newline the field carries, and still count the line, so a record
        // after a multi-line cell is not reported one line short.
        if (char === "\r" && text.charAt(index + 1) === "\n") {
          index += 1;
        }
        field += "\n";
        line += 1;
        index += 1;
        continue;
      }
      field += char;
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      index += 1;
      continue;
    }
    if (char === CSV_SEPARATOR) {
      fields.push(field);
      field = "";
      index += 1;
      continue;
    }
    if (char === "\r" || char === "\n") {
      if (char === "\r" && text.charAt(index + 1) === "\n") {
        index += 1;
      }
      index += 1;
      endRecord();
      continue;
    }

    field += char;
    index += 1;
  }

  // A file not ending in a newline still has a last record.
  if (field !== "" || fields.length > 0) {
    fields.push(field);
    records.push({ line: recordStartLine, fields });
  }

  return records;
}

function isBlankRecord(record: RawRecord): boolean {
  return record.fields.every((value) => value.trim() === "");
}

/**
 * Validates the header row and maps each expected column to its position.
 *
 * Names are matched case-insensitively after trimming and may appear in any order, but
 * the set has to be exactly the four expected ones: an unrecognised column is far more
 * likely to be a misspelling of a required one than a column we should silently ignore.
 */
function readHeader(record: RawRecord): { columns: Record<string, number> } | { errors: ParseError[] } {
  const errors: ParseError[] = [];
  const seen = new Map<string, number>();
  const unknown: string[] = [];

  record.fields.forEach((raw, position) => {
    const name = raw.trim().toLowerCase();
    if (name === "") {
      return;
    }
    if (!(CSV_HEADERS as readonly string[]).includes(name)) {
      unknown.push(raw.trim());
      return;
    }
    if (seen.has(name)) {
      errors.push({ line: record.line, message: `Kolumna "${name}" występuje w nagłówku dwa razy.` });
      return;
    }
    seen.set(name, position);
  });

  const missing = CSV_HEADERS.filter((name) => !seen.has(name));
  if (missing.length > 0) {
    errors.push({
      line: record.line,
      message:
        `W nagłówku brakuje kolumn: ${missing.join(", ")}. ` +
        `Wymagane kolumny to: ${CSV_HEADERS.join(", ")}. Pobierz szablon i wypełnij go danymi.`,
    });
  }
  if (unknown.length > 0) {
    errors.push({
      line: record.line,
      message: `Nagłówek zawiera nieznane kolumny: ${unknown.join(", ")}. Dozwolone są tylko: ${CSV_HEADERS.join(", ")}.`,
    });
  }

  if (errors.length > 0) {
    return { errors };
  }

  const columns: Record<string, number> = {};
  for (const [name, position] of seen) {
    columns[name] = position;
  }
  return { columns };
}

/**
 * Parses a decimal written the Polish way (comma) or the programmer way (dot) into an
 * integer number of hundredths.
 *
 * Deliberately not `parseFloat`: the value ends up in `numeric(8,2)` and in a share
 * calculation that must be reproducible, and a float round-trip is exactly the kind of
 * thing that makes 33,33 arrive as 33.329999999999998.
 */
function parseAreaHundredths(raw: string): number | null {
  if (!/^\d{1,5}([.,]\d{1,2})?$/.test(raw)) {
    return null;
  }
  const normalised = raw.replace(",", ".");
  const dot = normalised.indexOf(".");
  const whole = dot === -1 ? normalised : normalised.slice(0, dot);
  const fraction = dot === -1 ? "" : normalised.slice(dot + 1);
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

function isValidEmail(value: string): boolean {
  if (/\s/.test(value)) {
    return false;
  }
  const parts = value.split("@");
  return parts.length === 2 && parts[0].length > 0 && parts[1].length > 0;
}

/**
 * Parses uploaded CSV bytes into validated rows, or into every reason the file was
 * rejected.
 *
 * @param bytes The uploaded file, exactly as received.
 */
export function parseUnitsCsv(bytes: Uint8Array): ParseResult {
  // The template this parser is paired with is written UTF-8 *with* a BOM, because
  // without one Excel mis-renders the Polish column names -- so the very first thing that
  // arrives back is a BOM we have to drop.
  const body =
    bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? bytes.subarray(3) : bytes;

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    // Line numbers are meaningless once the bytes did not decode, so this is the only
    // error the file gets. Polish Excel defaults to Windows-1250, which is the single
    // most likely way to arrive here.
    return {
      ok: false,
      errors: [
        {
          line: 1,
          message:
            "Nie udało się odczytać pliku — nie jest zapisany w kodowaniu UTF-8. " +
            'W Excelu wybierz "Zapisz jako" i format "CSV UTF-8 (rozdzielany przecinkami)".',
        },
      ],
    };
  }

  const records = splitRecords(text);

  // Trailing blank lines are ignored; a blank line in the middle is reported, because it
  // is usually a row someone deleted the contents of rather than the row itself.
  while (records.length > 0 && isBlankRecord(records[records.length - 1])) {
    records.pop();
  }

  if (records.length === 0) {
    return { ok: false, errors: [{ line: 1, message: "Plik jest pusty." }] };
  }

  const header = readHeader(records[0]);
  if ("errors" in header) {
    return { ok: false, errors: header.errors };
  }
  const { columns } = header;
  const width = records[0].fields.length;

  const dataRecords = records.slice(1);
  if (dataRecords.length === 0) {
    return {
      ok: false,
      errors: [
        {
          line: 1,
          message: "Plik zawiera tylko nagłówek — dopisz wiersze z lokalami i wczytaj go ponownie.",
        },
      ],
    };
  }
  if (dataRecords.length > MAX_ROWS) {
    return {
      ok: false,
      errors: [
        {
          line: 1,
          message: `Plik zawiera ${dataRecords.length} wierszy — maksymalnie ${MAX_ROWS}.`,
        },
      ],
    };
  }

  const errors: ParseError[] = [];
  const rows: ParsedRow[] = [];
  const unitNumberLines = new Map<string, number>();

  for (const record of dataRecords) {
    const { line } = record;

    if (isBlankRecord(record)) {
      errors.push({ line, message: "Wiersz jest pusty — usuń pustą linię z pliku." });
      continue;
    }

    if (record.fields.length !== width) {
      errors.push({
        line,
        message: `Wiersz ma ${record.fields.length} pól zamiast ${width}. Sprawdź, czy nie brakuje średnika.`,
      });
      continue;
    }

    const unitNumber = record.fields[columns.numer_lokalu].trim();
    const areaRaw = record.fields[columns.metraz].trim();
    const fullName = record.fields[columns.imie_nazwisko].trim();
    const emailRaw = record.fields[columns.email].trim();

    // Every check below runs regardless of what failed before it: the point of the whole
    // module is that one pass over the file finds everything wrong with it.
    if (unitNumber === "") {
      errors.push({ line, message: "Numer lokalu: pole jest wymagane." });
    } else if (unitNumber.length > MAX_UNIT_NUMBER_LENGTH) {
      errors.push({ line, message: `Numer lokalu: maksymalnie ${MAX_UNIT_NUMBER_LENGTH} znaków.` });
    } else {
      const firstLine = unitNumberLines.get(unitNumber);
      if (firstLine === undefined) {
        unitNumberLines.set(unitNumber, line);
      } else {
        errors.push({
          line,
          message: `Numer lokalu "${unitNumber}" powtarza się — ten sam numer jest już w wierszu ${firstLine}.`,
        });
      }
    }

    let areaHundredths: number | null = null;
    if (areaRaw === "") {
      errors.push({ line, message: "Metraż: pole jest wymagane." });
    } else {
      areaHundredths = parseAreaHundredths(areaRaw);
      if (areaHundredths === null) {
        errors.push({
          line,
          message: `Metraż "${areaRaw}": podaj liczbę z maksymalnie dwoma miejscami po przecinku, np. 52,40.`,
        });
      } else if (areaHundredths <= 0) {
        errors.push({ line, message: "Metraż: musi być większy od zera." });
        areaHundredths = null;
      } else if (areaHundredths > MAX_AREA_HUNDREDTHS) {
        errors.push({ line, message: `Metraż: maksymalnie ${MAX_AREA_HUNDREDTHS / 100} m².` });
        areaHundredths = null;
      }
    }

    if (fullName === "") {
      errors.push({ line, message: "Imię i nazwisko: pole jest wymagane." });
    } else if (fullName.length > MAX_FULL_NAME_LENGTH) {
      errors.push({ line, message: `Imię i nazwisko: maksymalnie ${MAX_FULL_NAME_LENGTH} znaków.` });
    }

    // An owner with no address still holds a share and still counts towards the S-05
    // threshold; what they lose is the voting link. So a blank e-mail is valid data.
    let email: string | null = null;
    if (emailRaw !== "") {
      if (emailRaw.length > MAX_EMAIL_LENGTH) {
        errors.push({ line, message: `E-mail: maksymalnie ${MAX_EMAIL_LENGTH} znaków.` });
      } else if (!isValidEmail(emailRaw)) {
        errors.push({ line, message: `E-mail "${emailRaw}": to nie jest poprawny adres e-mail.` });
      } else {
        email = emailRaw;
      }
    }

    if (unitNumber !== "" && areaHundredths !== null && fullName !== "") {
      rows.push({ unitNumber, areaHundredths, fullName, email });
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, rows };
}
