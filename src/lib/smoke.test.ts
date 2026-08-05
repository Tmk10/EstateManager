import { describe, expect, it } from "vitest";

import { TOTAL_BPS } from "@/lib/shares";

// This file proves the harness, not the domain. It is deliberately NOT the
// udział-allocation test that `context/foundation/test-plan.md` §3 Phase 1
// exists to buy: that one must assert `computeShareBps` against an independent
// FR-006 / FR-007 oracle, including the rounding and tie-break cases that decide
// a near-threshold uchwała. Writing it here from the implementation's own
// expectations is the anti-pattern §2 names for Risk #2.
//
// What the three assertions below actually establish, in order: Vitest runs and
// TypeScript compiles; the `@/*` alias resolves through `getViteConfig()` rather
// than needing a second copy of tsconfig's paths; and a failing expectation
// really does fail, so a green run means something.
describe("test harness", () => {
  it("runs TypeScript under Vitest", () => {
    expect(1 + 1).toBe(2);
  });

  it("resolves the @/* alias through the Astro config", () => {
    expect(TOTAL_BPS).toBe(10000);
  });

  it("fails an expectation that should fail", () => {
    expect(() => {
      expect(1).toBe(2);
    }).toThrow();
  });
});
