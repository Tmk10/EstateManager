import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { parseUnitsCsv } from "@/lib/units-csv";
import { areaHundredthsToDecimalString, computeShareBps } from "@/lib/shares";

/**
 * Postgres error codes raised by public.import_building_units and the registry triggers,
 * mapped to Polish.
 *
 * EM003 and EM004 are unreachable if the arithmetic in src/lib/shares.ts and the import
 * function are both right, which is exactly why they say so rather than pretending to be
 * something the administrator did wrong.
 *
 * EM005 is the database backstop for a rule src/lib/units-csv.ts already enforces with line
 * numbers, so reaching it here means the parser and the function disagree -- but it names a
 * real problem with the file, so it reads as one.
 *
 * EM015 is unreachable from this route by construction: import_building_units derives owners
 * from the CSV's unit rows, so an owner it creates always holds at least one lokal. It is
 * mapped anyway, on the same grounds as EM003 and EM004 -- an "impossible" code that reaches
 * an administrator as raw English is worse than one that admits it is our bug.
 */
const ERROR_MESSAGES: Record<string, string | undefined> = {
  EM001: "Nie znaleziono budynku.",
  EM002: "Ten budynek ma już zaimportowany rejestr lokali.",
  EM003: "Suma udziałów nie wynosi 100%. Zgłoś to jako błąd.",
  EM004: "Zapisana powierzchnia budynku nie zgadza się z sumą metraży. Zgłoś to jako błąd.",
  EM005: "Ten sam adres e-mail występuje w pliku przy różnych osobach. Jeden adres może należeć tylko do jednej osoby.",
  EM015: "Właściciel bez żadnego lokalu nie może trafić do rejestru. Zgłoś to jako błąd.",
};

export const POST: APIRoute = async (context) => {
  const { id } = context.params;

  if (!id) {
    return context.redirect("/buildings");
  }

  const fail = (message: string) =>
    context.redirect(`/buildings/${id}/units/import?error=${encodeURIComponent(message)}`);

  const form = await context.request.formData();
  const csv = form.get("csv");

  if (typeof csv !== "string" || csv.trim() === "") {
    return fail("Brak danych do zapisania. Wczytaj plik jeszcze raz.");
  }

  // The whole point of this endpoint: re-parse and recompute from the CSV text rather
  // than trust anything the browser posted back. A client that edited the shares in the
  // preview could otherwise assign its own unit any voting weight it liked. This is only
  // safe because the parse and the share computation are deterministic -- the same bytes
  // must yield the same shares, which is what the file-order tie-break in shares.ts buys.
  const parsed = parseUnitsCsv(new TextEncoder().encode(csv));
  if (!parsed.ok) {
    return fail(`Plik zawiera błędy i nie został zapisany: ${parsed.errors[0].message}`);
  }

  const shareBps = computeShareBps(parsed.rows.map((row) => row.areaHundredths));
  if (!Array.isArray(shareBps)) {
    return fail(shareBps.error);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return fail("Baza danych nie jest skonfigurowana.");
  }

  const rows = parsed.rows.map((row, index) => ({
    unit_number: row.unitNumber,
    // A decimal string, never a JSON number: numbers in JSON are parsed as doubles, and
    // this value is on its way into numeric(8,2).
    area_m2: areaHundredthsToDecimalString(row.areaHundredths),
    share_bps: shareBps[index],
    full_name: row.fullName,
    email: row.email,
  }));

  const { error } = await supabase.rpc("import_building_units", {
    p_building_id: id,
    p_rows: rows,
  });

  if (error) {
    const message = ERROR_MESSAGES[error.code];
    return fail(message ?? `Nie udało się zapisać rejestru lokali: ${error.message}`);
  }

  // The registry module, not the building's module index — the administrator lands on the thing
  // they just created. `/buildings/<id>` stopped being the registry when it became that index.
  return context.redirect(`/buildings/${id}/units`);
};
