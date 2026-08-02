import type { APIRoute } from "astro";
import { CSV_HEADERS, CSV_SEPARATOR } from "@/lib/units-csv";

/**
 * The empty CSV template an administrator downloads from the import page.
 *
 * Generated from the parser's own CSV_HEADERS rather than served as a static file in
 * public/. A static copy would silently disagree the first time a column is renamed, and
 * nothing would fail until someone's upload was rejected for matching the template we
 * gave them. Generated, the two cannot drift: renaming a header renames both.
 *
 * Headers only, no example row. An example invites editing over it and leaving a stray
 * row behind -- a mistake that arrives looking like a data error. What an example would
 * have taught (decimal comma in metraz, email allowed to be blank) is written beside the
 * download link instead, where it gets read rather than opened in Excel.
 *
 * The route sits under /api/buildings, so middleware's PROTECTED_ROUTES already covers it
 * via startsWith. The template exposes nothing sensitive, but there is no reason for it to
 * be the one unauthenticated path in the feature.
 */

/**
 * Byte order mark. Load-bearing: without it Excel reads the file as the current code page
 * and mis-renders every Polish character in "imie_nazwisko". Written as an escape rather
 * than a literal so it is visible to a reader rather than being an invisible byte.
 */
const BOM = "\uFEFF";

export const GET: APIRoute = () => {
  const body = `${BOM}${CSV_HEADERS.join(CSV_SEPARATOR)}\r\n`;

  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      // Without this the browser renders the CSV instead of saving it.
      "content-disposition": 'attachment; filename="szablon-lokale.csv"',
      "cache-control": "no-store",
    },
  });
};
