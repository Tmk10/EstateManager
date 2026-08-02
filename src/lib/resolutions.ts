/**
 * Helpers shared by the screens and endpoints that handle a resolution (uchwała).
 *
 * Two things live here, both because they have more than one caller and drift silently if
 * they are copied:
 *
 *   - the validation of the three fields a resolution is written from, shared by the create
 *     and the edit endpoint. An edit that accepted a blank title where create refused one
 *     would let a draft reach `Uruchom głosowanie` in a state create could never have
 *     produced.
 *   - the date format for `opened_at`, shared by the building page and the resolution page.
 *
 * Dependency-free apart from the Intl global, like the other src/lib modules.
 */

export interface ResolutionValues {
  number: string;
  title: string;
  body: string;
}

export type ResolutionFormResult = { ok: true; values: ResolutionValues } | { ok: false; message: string };

/**
 * Per-field bounds. `number` is the community's own numbering ('1/2026', 'Uchwala nr 3'),
 * `title` matches the 200 characters buildings use, and `body` is the resolution text --
 * long enough for a real uchwala with its justification, short enough that the column is
 * not a free-text dumping ground.
 */
const FIELDS = [
  { key: "number", label: "Numer uchwały", maxLength: 50 },
  { key: "title", label: "Tytuł", maxLength: 200 },
  { key: "body", label: "Treść uchwały", maxLength: 20000 },
] as const;

/**
 * Trims and checks the three fields of a resolution form.
 *
 * The shape of the result mirrors src/lib/units-csv.ts: a discriminated union rather than a
 * thrown error, so the endpoint decides what to do with the failure (here: redirect back
 * with `?error=`, the shape every form endpoint in this app uses).
 *
 * Trimming here is what keeps the database's `resolutions_*_not_blank` checks unreachable
 * through the UI: '   ' passes `not null` and is not a title.
 */
export function parseResolutionForm(form: FormData): ResolutionFormResult {
  const values: Record<string, string> = {};

  for (const { key, label, maxLength } of FIELDS) {
    const raw = form.get(key);
    const value = typeof raw === "string" ? raw.trim() : "";

    if (!value) {
      return { ok: false, message: `${label}: pole jest wymagane.` };
    }
    if (value.length > maxLength) {
      return { ok: false, message: `${label}: maksymalnie ${String(maxLength)} znaków.` };
    }
    values[key] = value;
  }

  return { ok: true, values: { number: values.number, title: values.title, body: values.body } };
}

/**
 * Formats a timestamptz read back from the database the Polish way, e.g. "2 sierpnia 2026,
 * 14:57".
 *
 * No time zone is named, so the value renders in the runtime's zone -- UTC on the Worker.
 * That is a knowing simplification for a PoC with no end date on any vote (FR-007): the
 * moment a deadline exists, this is the function that has to learn about Europe/Warsaw.
 */
export function formatResolutionDate(timestamp: string): string {
  return new Intl.DateTimeFormat("pl-PL", { dateStyle: "long", timeStyle: "short" }).format(new Date(timestamp));
}
