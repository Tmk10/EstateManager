import { describe, expect, it } from "vitest";

import { computeShareBps, TOTAL_BPS, type ShareResult } from "@/lib/shares";

/**
 * The udział allocation, pinned against what the PRD says a udział is.
 *
 * Every expected value in this file comes from `context/foundation/prd.md` or from the call
 * path that consumes the result -- never from `src/lib/shares.ts`. A suite whose oracle is
 * lifted out of the module under test proves only that the module computes what the module
 * computes, which is the gap `src/lib/smoke.test.ts` was opened to name.
 *
 * Two lines of the PRD carry almost all of it:
 *
 *   `## Acceptance Criteria` -- "Suma udziałów wszystkich lokali w budynku daje 100%"
 *   FR-006 -- "System wylicza udział każdego lokalu z jego metrażu i waży nim oddany głos"
 *
 * What is deliberately NOT asserted: which lokal receives a leftover basis point. The PRD
 * says udziały come from metraż and total 100%; it does not say the leftover goes to the
 * largest remainders, nor that ties break by file order. Naming a recipient would pin the
 * method rather than the requirement, and a legitimate change of method would then fail a
 * test no requirement backs. The property asserted in its place is the one the confirm
 * endpoint actually rests on: the same registry always yields the same udziały.
 */

interface Registry {
  /** What the budynek is, not what the numbers are. */
  name: string;
  /** Floor areas in hundredths of a square metre, in file order. */
  areaHundredths: number[];
}

const REGISTRIES: Registry[] = [
  {
    // Three lokale of 50 m2. The exact udział is 33,33% and a third of a basis point over,
    // so a leftover exists at all -- the smallest registry division alone cannot settle.
    name: "three equal lokale",
    areaHundredths: [5000, 5000, 5000],
  },
  {
    // 100,01 m2 against 99,98 m2: one lokal holds a hair over half the budynek. Whether that
    // hair carries an uchwała is not this suite's question -- the threshold exists once, in
    // SQL, and the test plan's Phase 2 (pgTAP) is where it gets pinned. Here it is only a
    // registry in which rounding decides the last basis point.
    name: "a knife-edge budynek",
    areaHundredths: [10001, 9998],
  },
  {
    // The degenerate wspólnota: one lokal, and it is the whole budynek.
    name: "one lokal, the whole budynek",
    areaHundredths: [7250],
  },
  {
    // Seventy lokale between 28 and 95 m2 -- the size shares.ts reasons about in its own
    // comments, and the one where the leftover is spread thinnest across the registry.
    name: "a 70-lokal kamienica",
    areaHundredths: [
      3120, 4550, 2980, 6710, 5240, 3860, 4410, 7130, 2870, 5590, 4980, 3340, 6120, 5470, 2910, 8250, 3760, 4630, 5180,
      3050, 7420, 2840, 5910, 4270, 6380, 3510, 4890, 5730, 3190, 6640, 4120, 5360, 2960, 7810, 3680, 4740, 6250, 3420,
      5080, 4560, 2880, 6930, 5510, 3970, 4380, 5820, 3240, 6470, 4110, 5240, 3590, 4860, 7260, 2920, 5140, 6580, 3830,
      4490, 5670, 3360, 6040, 4230, 5450, 3710, 4970, 2850, 6360, 5290, 3480, 9540,
    ],
  },
  {
    // Two kawalerki and one duży lokal: 25 + 25 + 100 m2. Every lokal discards the same two
    // thirds of a basis point, which is the most the arithmetic can leave over -- with n
    // lokale the leftover is always under n, and here it reaches n-1.
    name: "areas engineered for the largest leftover the arithmetic can leave",
    areaHundredths: [2500, 2500, 10000],
  },
];

/** Narrows a result to the udziały, failing the test with the refusal text if it is one. */
function udzialyOf(result: ShareResult): number[] {
  if (!Array.isArray(result)) {
    throw new Error(`Expected udziały, got a refusal: ${result.error}`);
  }
  return result;
}

/** Narrows a result to the refusal, failing the test if udziały came back instead. */
function refusalOf(result: ShareResult): string {
  if (Array.isArray(result)) {
    throw new Error(`Expected a refusal, got ${result.length} udziały.`);
  }
  return result.error;
}

describe("the udział allocation for a building's registry", () => {
  it.each(REGISTRIES)("$name: the udziały add up to the whole budynek", ({ areaHundredths }) => {
    // PRD `## Acceptance Criteria`: "Suma udziałów wszystkich lokali w budynku daje 100%".
    // Exactly 100%, not to within rounding -- the threshold is measured against this total,
    // so a total that drifts moves the bar under an uchwała already being voted on.
    const udzialy = udzialyOf(computeShareBps(areaHundredths));

    expect(udzialy).toHaveLength(areaHundredths.length);
    expect(udzialy.reduce((sum, share) => sum + share, 0)).toBe(TOTAL_BPS);
  });

  it.each(REGISTRIES)("$name: every lokal's udział matches the metraż it was earned from", ({ areaHundredths }) => {
    // FR-006: "System wylicza udział każdego lokalu z jego metrażu". Combined with the sum
    // above, that fixes each udział to within one basis point -- the exact proportional value
    // is metraż * 10000 / total, and an allocator that both respects proportion and lands the
    // total on exactly 10000 can only round each lokal down to it or up by one.
    //
    // The floor expression below also appears at `shares.ts:66`, and it is not an oracle
    // copied from there. That module's method is base-plus-largest-remainder; what is asserted
    // here is only membership in the two integers adjacent to the exact proportional value --
    // a bound every correct allocator satisfies, whichever method it uses. It is also the
    // assertion that catches a wrong denominator, which the sum above cannot: shrink the
    // denominator and the leftover loop drags the total back to 10000 regardless.
    const totalArea = areaHundredths.reduce((sum, area) => sum + area, 0);
    const udzialy = udzialyOf(computeShareBps(areaHundredths));

    areaHundredths.forEach((area, index) => {
      const proportional = Math.floor((area * TOTAL_BPS) / totalArea);

      expect(udzialy[index]).toBeGreaterThanOrEqual(proportional);
      expect(udzialy[index]).toBeLessThanOrEqual(proportional + 1);
    });
  });

  it.each(REGISTRIES)("$name: the same registry always yields the same udziały", ({ areaHundredths }) => {
    // `src/pages/api/buildings/[id]/units.ts:49-59` re-parses the uploaded file and recomputes
    // the udziały rather than trusting the ones the browser posts back with the form. That is
    // a safety property only if recomputation reproduces the preview to the basis point. The
    // two calls take separate arrays because the confirm step's array is a second parse of the
    // same file, not the preview's object handed along.
    const preview = udzialyOf(computeShareBps([...areaHundredths]));
    const confirm = udzialyOf(computeShareBps([...areaHundredths]));

    expect(confirm).toEqual(preview);
  });

  it("refuses a lokal whose metraż would earn it no udział at all, naming its position in the file", () => {
    // A 0,01 m2 broom cupboard beside a 10 000 m2 tower block. FR-006 gives every lokal a
    // udział that weighs its vote, so a lokal at zero basis points is not one that votes
    // quietly -- it is one that cannot vote at all, and the registry has to be corrected
    // before the import rather than after, because v1 offers no re-import. The
    // `units_share_positive` check constraint refuses the same row at the database; this
    // refusal is what turns that violation into a sentence naming the row to go and fix.
    const refusal = refusalOf(computeShareBps([1, 1000000]));

    expect(refusal).toContain("pozycji 1");
  });

  it.each([
    { name: "a registry with no lokale in it", areaHundredths: [] },
    { name: "a lokal with no metraż", areaHundredths: [5000, 0] },
    { name: "a negative metraż", areaHundredths: [5000, -2500] },
    { name: "a metraż that is not a whole number of hundredths", areaHundredths: [5000, 52.4] },
  ])("$name is refused, not thrown on", ({ areaHundredths }) => {
    // The import route calls this with nothing to catch with, and a throw would surface to the
    // administrator as a 500 instead of as the Polish sentence naming what to fix. Totality is
    // also what makes "a refused import writes nothing" structural rather than incidental:
    // `units.ts:55-57` returns before the RPC on any result that is not an array.
    expect(() => computeShareBps(areaHundredths)).not.toThrow();
    expect(refusalOf(computeShareBps(areaHundredths))).not.toHaveLength(0);
  });
});
