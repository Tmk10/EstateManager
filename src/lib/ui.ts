/**
 * The interface vocabulary of this application — every shape a screen is allowed to draw.
 *
 * This file exists for the reason `src/lib/building-modules.ts` and `src/lib/resolutions.ts`
 * exist: a rule that lives in one place is a rule, and a rule copied into thirteen `.astro`
 * files is a coincidence waiting to end. Before this module the same card was written by hand
 * as `rounded-2xl border border-white/10 bg-white/10 p-8 backdrop-blur-xl` on eleven pages,
 * and the eleven had already drifted — three radii, two paddings, two border opacities.
 *
 * What belongs here: the class strings for a surface, a control, a table, a badge, a callout.
 * What does not: anything a single screen needs once. A constant with one caller is a
 * redirection, not a system — write it inline and leave this file for what repeats.
 *
 * **Dependency-free, and deliberately so.** Only string constants, no imports, so
 * `src/lib/resolutions.ts` can take its badge colours from here without acquiring a
 * dependency — that module's own header promises it has none beyond `Intl`, and this keeps
 * the promise true. It also means the whole vocabulary is readable in one file without
 * running anything.
 *
 * Colours come from `src/styles/global.css` through Tailwind's token classes (`bg-card`,
 * `text-muted-foreground`). The literal palette names below — emerald, rose, sky, amber — are
 * the only exception, and they are the four the domain assigns meaning to. See BADGE_TONES.
 */

/* ---------------------------------------------------------------------------------------- */
/* Layout                                                                                     */
/* ---------------------------------------------------------------------------------------- */

/**
 * Content widths. Three, not eleven — a page picks the one that fits what it holds, and the
 * measure stays comparable as an administrator moves between screens.
 *
 *   narrow  — a single form column. Roughly 45 characters of Polish at the body size, which
 *             is the low end of the comfortable measure and right for a login or an address.
 *   default — prose and cards.
 *   wide    — tables. The registry has five columns and the links table six; anything
 *             narrower puts them behind a horizontal scrollbar on a laptop.
 */
export const WIDTHS = {
  narrow: "max-w-md",
  default: "max-w-3xl",
  wide: "max-w-5xl",
} as const;

export type Width = keyof typeof WIDTHS;

/* ---------------------------------------------------------------------------------------- */
/* Surfaces                                                                                   */
/* ---------------------------------------------------------------------------------------- */

/** The one card. A white plane, a hairline border, a shadow just deep enough to lift it. */
export const CARD = "rounded-lg border border-border bg-card shadow-sm";

/** The card with its standard padding, which is what nearly every caller wants. */
export const CARD_PADDED = `${CARD} p-6`;

/**
 * A block set *inside* a card — the balance panel, the "głosujesz jako" box. Muted rather
 * than white, so nesting reads as depth without a second border weight.
 */
export const PANEL = "rounded-lg border border-border bg-muted/60 p-4";

/** Nothing here yet, and a way to change that. Dashed, to read as a slot rather than a result. */
export const EMPTY_STATE = "rounded-lg border border-dashed border-border bg-muted/40 px-6 py-10 text-center";

/* ---------------------------------------------------------------------------------------- */
/* Typography                                                                                 */
/* ---------------------------------------------------------------------------------------- */

/**
 * The page's own name, once per page. Flat weight and colour: the gradient-clipped headings
 * this replaced were the loudest thing on every screen, which put the emphasis on the
 * furniture rather than on the uchwała.
 */
export const PAGE_TITLE = "text-2xl font-semibold tracking-tight text-foreground";

/** A section within a page. */
export const SECTION_TITLE = "text-base font-semibold text-foreground";

/** A block within a section — one step below SECTION_TITLE. */
export const SUBSECTION_TITLE = "text-sm font-semibold text-foreground";

/** Supporting prose: an address under a name, a hint under a field. */
export const MUTED_TEXT = "text-sm text-muted-foreground";

/** The same, smaller — footnotes and rules of arithmetic. */
export const FINE_PRINT = "text-xs text-muted-foreground";

/* ---------------------------------------------------------------------------------------- */
/* Controls                                                                                   */
/* ---------------------------------------------------------------------------------------- */

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-60";

/** The action this screen exists for. At most one per view — that is the whole point of it. */
export const BUTTON_PRIMARY = `${BUTTON_BASE} bg-primary text-primary-foreground hover:bg-primary/90`;

/** Everything else that acts: save a draft, download a template, go back a step. */
export const BUTTON_SECONDARY = `${BUTTON_BASE} border border-input bg-card text-foreground hover:bg-accent hover:text-accent-foreground`;

/** Full-width variants, for forms where the button is the last row of a column. */
export const BUTTON_PRIMARY_BLOCK = `${BUTTON_PRIMARY} w-full`;
export const BUTTON_SECONDARY_BLOCK = `${BUTTON_SECONDARY} w-full`;

/**
 * Text inputs and textareas. `focus-visible` only — a mouse click into a field should not
 * draw a ring, but a tab into it must.
 */
export const INPUT =
  "w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 transition-colors focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

/** The same field, in the state where it has been rejected. */
export const INPUT_INVALID =
  "w-full rounded-md border border-destructive bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40";

export const LABEL = "mb-1.5 block text-sm font-medium text-foreground";

export const FIELD_ERROR = "mt-1.5 flex items-center gap-1.5 text-xs text-destructive";

/** A link inside running text. */
export const LINK = "text-primary underline underline-offset-4 hover:text-primary/80";

/** A navigational link that is not part of a sentence — breadcrumbs, "wróć do…". */
export const NAV_LINK = "text-muted-foreground transition-colors hover:text-foreground";

/* ---------------------------------------------------------------------------------------- */
/* Tables                                                                                     */
/* ---------------------------------------------------------------------------------------- */

/**
 * The wrapper is not optional: it owns the border, the rounding and — critically — the
 * horizontal scroll. A table that overflows its card pushes the whole page sideways, and on
 * a phone that makes every other screen scroll too.
 */
export const TABLE_WRAP = "overflow-x-auto rounded-lg border border-border";
export const TABLE = "w-full text-left text-sm";
export const TABLE_HEAD =
  "border-b border-border bg-muted/70 text-xs font-medium tracking-wide text-muted-foreground uppercase";
export const TABLE_BODY = "divide-y divide-border";
export const TABLE_ROW = "transition-colors hover:bg-muted/40";
export const TABLE_FOOT = "border-t-2 border-border bg-muted/70 font-medium text-foreground";
export const TH = "px-4 py-3 font-medium";
export const TH_NUMERIC = "px-4 py-3 text-right font-medium";
export const TD = "px-4 py-3";
/** Right-aligned and lining, so a column of udziały can be compared by eye down its decimal point. */
export const TD_NUMERIC = "px-4 py-3 text-right tabular-nums";

/* ---------------------------------------------------------------------------------------- */
/* State: badges and callouts                                                                 */
/* ---------------------------------------------------------------------------------------- */

/**
 * The five tones, and the meaning each one carries. This mapping is the reason colour is
 * spent so sparingly everywhere else: if the chrome were coloured, none of these would read.
 *
 *   neutral — nothing has happened yet (wersja robocza, niewysłane).
 *   info    — live, in progress (głosowanie otwarte). Sky, not green: green means *podjęta*,
 *             and `src/lib/resolutions.ts` explains at length why two greens a shade apart
 *             would be the worst possible pair here.
 *   success — it went through (podjęta, wysłano, link wystawiony).
 *   danger  — it did not (upadła). **Not an error.** An uchwała that falls is the ordinary
 *             outcome for roughly 85% of them, per the PRD; it is rose because it is a
 *             negative result, and it is a pill rather than an alert because nobody has to
 *             do anything about it.
 *   warning — someone should look (brak adresu e-mail, nieznany status).
 *
 * An actual failure — a read that did not work, a send that errored — uses ALERT_TONES.error
 * instead, which is a block with `role="alert"`, not a pill. That shape difference is what
 * separates "this fell" from "this broke"; the two are both red and could never be told
 * apart by hue alone.
 */
export const BADGE = "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap";

export const BADGE_TONES = {
  neutral: "border-border bg-muted text-muted-foreground",
  info: "border-sky-200 bg-sky-50 text-sky-800",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  danger: "border-rose-200 bg-rose-50 text-rose-800",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
} as const;

export type BadgeTone = keyof typeof BADGE_TONES;

/** A block that says something about the whole view, rather than about one row of it. */
export const ALERT = "rounded-lg border px-4 py-3 text-sm";

export const ALERT_TONES = {
  info: "border-sky-200 bg-sky-50 text-sky-900",
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  /** An outcome that went against the uchwała. Same reading as BADGE_TONES.danger. */
  danger: "border-rose-200 bg-rose-50 text-rose-900",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  /** Something is broken and the reader has to act. Pair with `role="alert"`. */
  error: "border-red-300 bg-red-50 text-red-900",
} as const;

export type AlertTone = keyof typeof ALERT_TONES;

/** The error callout, spelled out because it is the single most repeated block in the app. */
export const ALERT_ERROR = `${ALERT} ${ALERT_TONES.error}`;
