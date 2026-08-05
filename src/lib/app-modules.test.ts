import { describe, it, expect } from "vitest";

import { APP_MODULES, appModuleSubmodules, isAppModuleCurrent } from "@/lib/app-modules";
import { currentBuildingId, currentBuildingModuleId } from "@/lib/building-modules";

// The module rail has exactly one input — the path the reader is on — and everything it draws
// is decided by the four functions below. They are worth pinning because their failures are the
// quiet kind: a rail that marks the wrong module, or that offers submodules of a building the
// reader is not in, looks like a working rail in every screenshot.

const buildingsModule = APP_MODULES.find((module) => module.id === "buildings");
if (!buildingsModule) throw new Error("APP_MODULES lost its buildings entry");

const helpModule = APP_MODULES.find((module) => module.id === "help");
if (!helpModule) throw new Error("APP_MODULES lost its help entry");

const BUILDING_ID = "9f1c2b7e-0000-4000-8000-000000000001";

describe("currentBuildingId", () => {
  it("reads the building out of every route that lives under one", () => {
    expect(currentBuildingId(`/buildings/${BUILDING_ID}`)).toBe(BUILDING_ID);
    expect(currentBuildingId(`/buildings/${BUILDING_ID}/units`)).toBe(BUILDING_ID);
    expect(currentBuildingId(`/buildings/${BUILDING_ID}/units/import`)).toBe(BUILDING_ID);
    expect(currentBuildingId(`/buildings/${BUILDING_ID}/resolutions/7`)).toBe(BUILDING_ID);
    expect(currentBuildingId(`/buildings/${BUILDING_ID}/`)).toBe(BUILDING_ID);
  });

  it("reports no building on the routes that are not inside one", () => {
    expect(currentBuildingId("/buildings")).toBeNull();
    expect(currentBuildingId("/buildings/new")).toBeNull();
    expect(currentBuildingId("/dashboard")).toBeNull();
    expect(currentBuildingId("/help")).toBeNull();
    expect(currentBuildingId("/")).toBeNull();
  });
});

describe("currentBuildingModuleId", () => {
  it("names the module a path is inside, including its deeper screens", () => {
    expect(currentBuildingModuleId(`/buildings/${BUILDING_ID}/units`)).toBe("units");
    expect(currentBuildingModuleId(`/buildings/${BUILDING_ID}/units/import`)).toBe("units");
    expect(currentBuildingModuleId(`/buildings/${BUILDING_ID}/resolutions/abc`)).toBe("resolutions");
  });

  it("names no module on the building's own overview or outside a building", () => {
    expect(currentBuildingModuleId(`/buildings/${BUILDING_ID}`)).toBeNull();
    expect(currentBuildingModuleId(`/buildings/${BUILDING_ID}/nothing-here`)).toBeNull();
    expect(currentBuildingModuleId("/buildings")).toBeNull();
  });
});

describe("isAppModuleCurrent", () => {
  it("marks a module current on its own route and on everything under it", () => {
    expect(isAppModuleCurrent(buildingsModule, "/buildings")).toBe(true);
    expect(isAppModuleCurrent(buildingsModule, `/buildings/${BUILDING_ID}/units`)).toBe(true);
    expect(isAppModuleCurrent(helpModule, "/help")).toBe(true);
  });

  it("does not let a longer name match — /buildingsomething is not /buildings", () => {
    expect(isAppModuleCurrent(buildingsModule, "/buildingsomething")).toBe(false);
    expect(isAppModuleCurrent(buildingsModule, "/help")).toBe(false);
    expect(isAppModuleCurrent(helpModule, "/dashboard")).toBe(false);
  });
});

describe("appModuleSubmodules", () => {
  it("offers the building's modules only while the reader is inside a building", () => {
    const inside = appModuleSubmodules(buildingsModule, `/buildings/${BUILDING_ID}/resolutions`);
    expect(inside.map((submodule) => submodule.id)).toEqual(["units", "resolutions"]);
    expect(inside.map((submodule) => submodule.href)).toEqual([
      `/buildings/${BUILDING_ID}/units`,
      `/buildings/${BUILDING_ID}/resolutions`,
    ]);

    expect(appModuleSubmodules(buildingsModule, "/buildings")).toEqual([]);
    expect(appModuleSubmodules(buildingsModule, "/buildings/new")).toEqual([]);
  });

  it("gives no submodules to a module that has none", () => {
    expect(appModuleSubmodules(helpModule, `/buildings/${BUILDING_ID}/units`)).toEqual([]);
  });
});
