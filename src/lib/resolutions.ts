/**
 * Helpers shared by the screens and endpoints that handle a resolution (uchwała).
 *
 * Three things live here, all because they have more than one caller and drift silently if
 * they are copied:
 *
 *   - the validation of the three fields a resolution is written from, shared by the create
 *     and the edit endpoint. An edit that accepted a blank title where create refused one
 *     would let a draft reach `Uruchom głosowanie` in a state create could never have
 *     produced.
 *   - the date format for `opened_at`, shared by the building page and the resolution page.
 *   - how a status is named and coloured, shared by the resolutions list and the resolution
 *     page. Before S-05 each of them carried its own `status === "draft" ? … : …`, which was
 *     correct only while `open` was the only other value; with four statuses a copy left
 *     behind would tell an administrator that a settled uchwała is still collecting votes.
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

/** The four values `resolutions_status_known` allows. English in the database, Polish on screen. */
export type ResolutionStatus = "draft" | "open" | "passed" | "rejected";

export interface ResolutionStatusBadge {
  label: string;
  /** Tailwind classes for the badge, without the shared shape classes the caller supplies. */
  className: string;
}

/**
 * Colour carries meaning here, so the four are deliberately distinct:
 *
 *   - `draft` stays neutral — nothing has happened yet.
 *   - `open` is sky, not green. It was green before S-05, when it was the only non-draft
 *     status and green just meant "live". Green now has to mean *podjęta*, and two greens a
 *     shade apart would be the difference between an uchwała that passed and one still
 *     collecting votes.
 *   - `passed` takes the green.
 *   - `rejected` is rose. Not styled as an error: an uchwała that fell is an ordinary,
 *     expected outcome — per the PRD it is what happens to roughly 85% of them.
 */
const STATUS_BADGES: Record<ResolutionStatus, ResolutionStatusBadge> = {
  draft: { label: "Wersja robocza", className: "border border-white/20 bg-white/10 text-blue-100/70" },
  open: { label: "Głosowanie otwarte", className: "border border-sky-400/40 bg-sky-500/10 text-sky-100" },
  passed: { label: "Podjęta", className: "border border-green-400/40 bg-green-500/10 text-green-200" },
  rejected: { label: "Upadła", className: "border border-rose-400/40 bg-rose-500/10 text-rose-100" },
};

/**
 * Names and colours a resolution status.
 *
 * Takes `string` rather than `ResolutionStatus` because that is what a database read actually
 * hands over — the generated types say `string`, and a value widened by a later migration
 * would arrive here before anyone updated this file.
 *
 * The fallback says the status is unrecognised instead of guessing. Falling back to "open"
 * would be the dangerous default: it would report an unknown state as one still accepting
 * votes, which is exactly the sentence an administrator would act on.
 */
/**
 * `Object.hasOwn` rather than `in`: `in` also answers true for inherited keys, so a status of
 * "toString" would index onto a function and be reported as a known state.
 */
function isKnownResolutionStatus(status: string): status is ResolutionStatus {
  return Object.hasOwn(STATUS_BADGES, status);
}

export function describeResolutionStatus(status: string): ResolutionStatusBadge {
  if (isKnownResolutionStatus(status)) {
    return STATUS_BADGES[status];
  }

  return {
    label: "Nieznany status",
    className: "border border-amber-400/40 bg-amber-500/10 text-amber-100",
  };
}

/** Whether voting has finished — the two statuses that carry a `decided_at`. */
export function isResolutionDecided(status: string): boolean {
  return status === "passed" || status === "rejected";
}
