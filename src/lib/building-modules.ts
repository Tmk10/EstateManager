/**
 * The modules of a single building — level 2 of the module structure settled in
 * `context/foundation/roadmap.md` (`S-09`). Level 1 lives on `/dashboard` and lists modules of
 * the *application* (budynki, pomoc); this file lists modules of *one building*, and a building
 * is the context those open in, not a module itself.
 *
 * The roadmap's readiness criterion for this slice is about this array specifically:
 *
 *   > dołożenie któregokolwiek z nich później jest wpisem w rejestr modułów, a nie przebudową
 *   > ekranu
 *
 * So a future module — kontakt z mieszkańcami, przeglądy, finanse — is an entry here plus its
 * route, and nothing else. If adding one ever requires editing the building page's markup, this
 * file has stopped doing its job.
 *
 * Two rules that are decisions, not description:
 *
 * 1. **Only modules that exist appear here.** No "wkrótce", no greyed-out rows. PRD `## Non-Goals`
 *    parks every other module, and navigation that shows them promises a product that is neither
 *    built nor planned. Un-parking one is a PRD change, not an entry in this array.
 * 2. **"Module" means navigational, not commercial.** PRD `## Vision` uses the word for packages a
 *    customer picks from an offer; here it means a place in the interface that is always present.
 *    Settled 2026-08-03 for `S-07`, carried unchanged.
 *
 * The labels below are the words already on the screens. The roadmap calls these two the *moduł
 * bazowy* (lokale i właściciele) and the *moduł głosowania* (uchwały) — recorded here so the
 * mapping between the roadmap and the interface is not lost, not because anything renders it.
 */

export interface BuildingModule {
  /** Stable key. Used to mark the active module in navigation and to look up per-module state. */
  id: string;
  label: string;
  /** One line under the label on the module index. What the module is for, not what it contains. */
  description: string;
  /** Path segment under `/buildings/<id>/`. */
  path: string;
}

export const BUILDING_MODULES: BuildingModule[] = [
  {
    id: "units",
    label: "Rejestr lokali",
    description: "Lokale i właściciele — podstawa, z której liczą się udziały.",
    path: "units",
  },
  {
    id: "resolutions",
    label: "Uchwały",
    description: "Uchwały wspólnoty i głosowanie ważone udziałami.",
    path: "resolutions",
  },
];

export function buildingModuleHref(buildingId: string, module: BuildingModule): string {
  return `/buildings/${buildingId}/${module.path}`;
}
