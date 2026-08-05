/**
 * The modules of the *application* — level 1 of the module structure settled in
 * `context/foundation/roadmap.md` (`S-09`). Its sibling `src/lib/building-modules.ts` lists the
 * modules of *one building*, and this file is deliberately its twin: same shape, same two rules,
 * so the two levels of navigation cannot drift into two different ideas of what a module is.
 *
 * The rules carried over verbatim, because they are decisions and not description:
 *
 * 1. **Only modules that exist appear here.** No "wkrótce" rows. PRD `## Non-Goals` parks every
 *    other module; navigation that lists them promises a product that is neither built nor
 *    planned. Un-parking one is a PRD change, not an entry in this array.
 * 2. **"Module" means navigational, not commercial.** PRD `## Vision` uses the word for packages
 *    a customer picks from an offer. Here it means a place in the interface that is always
 *    present — which is why _Pomoc_ stands in the same list as _Budynki_ rather than in a footer.
 *    Settled 2026-08-03 for `S-07`; the roadmap's `S-09` entry says the same.
 *
 * The submodules of a module are resolved from the current path by `appModuleSubmodules`, not
 * spelled out in the navigation's markup. That is the point of the file: adding a module, or
 * giving one submodules, is an edit here — never an edit to `src/components/SideNav.astro`.
 */

import { BUILDING_MODULES, buildingModuleHref, currentBuildingId } from "@/lib/building-modules";

export interface AppModule {
  /** Stable key. Used to mark the current module in navigation. */
  id: string;
  label: string;
  /** What the module is for, not what it contains. Shown where there is room for a line of it. */
  description: string;
  href: string;
}

export interface AppSubmodule {
  id: string;
  label: string;
  href: string;
}

export const APP_MODULES: AppModule[] = [
  {
    id: "buildings",
    label: "Budynki",
    description: "Wspólnoty, rejestry lokali i głosowania nad uchwałami.",
    href: "/buildings",
  },
  {
    id: "help",
    label: "Pomoc",
    description: "Kontakt do osoby, która prowadzi tę aplikację.",
    href: "/help",
  },
];

/**
 * Whether `pathname` is inside `module`.
 *
 * `startsWith`, matching how `src/middleware.ts` decides what is protected — so
 * `/buildings/<id>/units` marks _Budynki_ as current rather than marking nothing at all. The
 * boundary check keeps a future `/buildingsomething` from counting as a match.
 */
export function isAppModuleCurrent(module: AppModule, pathname: string): boolean {
  if (pathname === module.href) return true;
  return pathname.startsWith(`${module.href}/`);
}

/**
 * The submodules to show under `module` for the path the reader is on.
 *
 * Only the building module has any, and only while the reader is inside one building: outside
 * that context there is no subject for _Rejestr lokali_ or _Uchwały_ to belong to, and a rail
 * that listed them anyway would be offering links it cannot build.
 */
export function appModuleSubmodules(module: AppModule, pathname: string): AppSubmodule[] {
  if (module.id !== "buildings") return [];

  const buildingId = currentBuildingId(pathname);
  if (!buildingId) return [];

  return BUILDING_MODULES.map((buildingModule) => ({
    id: buildingModule.id,
    label: buildingModule.label,
    href: buildingModuleHref(buildingId, buildingModule),
  }));
}
