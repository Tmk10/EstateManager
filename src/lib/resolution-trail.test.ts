import { describe, expect, it } from "vitest";

import { assembleResolutionTrail } from "@/lib/resolution-trail";
import { TOTAL_BPS } from "@/lib/shares";

describe("the audit trail of a settled uchwała", () => {
  it("reports the weight a vote was worth when it was cast, not the owner's current share", () => {
    const trail = assembleResolutionTrail({
      owners: [{ id: "o1", full_name: "Anna Kowalska" }],
      units: [{ owner_id: "o1", unit_number: "1", share_bps: 4000 }],
      votes: [{ owner_id: "o1", choice: "for", share_bps: 2500, created_at: "2026-08-05T10:00:00Z" }],
    });

    expect(trail.cast).toHaveLength(1);
    expect(trail.cast[0].shareBps).toBe(2500);
    expect(trail.forBps).toBe(2500);
  });

  it("accounts for every udział in the building: za plus przeciw plus nieoddane is the whole", () => {
    const trail = assembleResolutionTrail({
      owners: [
        { id: "o1", full_name: "Anna Kowalska" },
        { id: "o2", full_name: "Bogdan Nowak" },
        { id: "o3", full_name: "Celina Wiśniewska" },
        { id: "o4", full_name: "Damian Zieliński" },
      ],
      units: [
        { owner_id: "o1", unit_number: "1", share_bps: 3000 },
        { owner_id: "o2", unit_number: "2", share_bps: 2500 },
        { owner_id: "o3", unit_number: "3", share_bps: 2500 },
        { owner_id: "o4", unit_number: "4", share_bps: 2000 },
      ],
      votes: [
        { owner_id: "o1", choice: "for", share_bps: 3000, created_at: "2026-08-05T10:00:00Z" },
        { owner_id: "o2", choice: "against", share_bps: 2500, created_at: "2026-08-05T11:00:00Z" },
      ],
    });

    expect(trail.forBps).toBe(3000);
    expect(trail.againstBps).toBe(2500);
    expect(trail.notCastBps).toBe(4500);
    expect(trail.forBps + trail.againstBps + trail.notCastBps).toBe(TOTAL_BPS);
  });

  it("names the owners whose silence the threshold counted as a no, with their registry share", () => {
    const trail = assembleResolutionTrail({
      owners: [
        { id: "o1", full_name: "Anna Kowalska" },
        { id: "o2", full_name: "Bogdan Nowak" },
      ],
      units: [
        { owner_id: "o1", unit_number: "1", share_bps: 6000 },
        { owner_id: "o2", unit_number: "10", share_bps: 2500 },
        { owner_id: "o2", unit_number: "2", share_bps: 1500 },
      ],
      votes: [{ owner_id: "o1", choice: "for", share_bps: 6000, created_at: "2026-08-05T10:00:00Z" }],
    });

    expect(trail.notCast).toEqual([
      { ownerId: "o2", fullName: "Bogdan Nowak", unitNumbers: ["2", "10"], shareBps: 4000 },
    ]);
  });

  it("puts the votes in the order they arrived, however they arrive from the database", () => {
    const trail = assembleResolutionTrail({
      owners: [
        { id: "o1", full_name: "Anna Kowalska" },
        { id: "o2", full_name: "Bogdan Nowak" },
        { id: "o3", full_name: "Celina Wiśniewska" },
      ],
      units: [
        { owner_id: "o1", unit_number: "1", share_bps: 4000 },
        { owner_id: "o2", unit_number: "2", share_bps: 3000 },
        { owner_id: "o3", unit_number: "3", share_bps: 3000 },
      ],
      votes: [
        { owner_id: "o3", choice: "for", share_bps: 3000, created_at: "2026-08-05T12:30:00Z" },
        { owner_id: "o1", choice: "for", share_bps: 4000, created_at: "2026-08-05T09:15:00Z" },
        { owner_id: "o2", choice: "against", share_bps: 3000, created_at: "2026-08-05T11:00:00Z" },
      ],
    });

    expect(trail.cast.map((row) => row.fullName)).toEqual(["Anna Kowalska", "Bogdan Nowak", "Celina Wiśniewska"]);
  });

  it("reconstructs an uchwała carried by a single basis point", () => {
    // The shape of the local fixture 7/2026: passed at 5001 bps, the narrowest crossing the
    // threshold allows. Nothing else in the suite would notice an off-by-one here.
    const trail = assembleResolutionTrail({
      owners: [
        { id: "o1", full_name: "Anna Kowalska" },
        { id: "o2", full_name: "Bogdan Nowak" },
      ],
      units: [
        { owner_id: "o1", unit_number: "1", share_bps: 5001 },
        { owner_id: "o2", unit_number: "2", share_bps: 4999 },
      ],
      votes: [{ owner_id: "o1", choice: "for", share_bps: 5001, created_at: "2026-08-05T10:00:00Z" }],
    });

    expect(trail.forBps).toBe(5001);
    expect(trail.forBps * 2).toBeGreaterThan(TOTAL_BPS);
    expect(trail.notCastBps).toBe(4999);
    expect(trail.forBps + trail.againstBps + trail.notCastBps).toBe(TOTAL_BPS);
  });

  it("keeps a vote whose owner is missing from the registry in the trail rather than dropping it", () => {
    // A broken invariant -- the composite foreign key makes it unreachable today. If it ever
    // happens, the udziały must still be counted and the row must still be visible, because a
    // dropped vote would silently unbalance a reconciliation whose whole job is to prove
    // nothing is missing.
    const trail = assembleResolutionTrail({
      owners: [{ id: "o1", full_name: "Anna Kowalska" }],
      units: [{ owner_id: "o1", unit_number: "1", share_bps: 10000 }],
      votes: [
        { owner_id: "o1", choice: "for", share_bps: 10000, created_at: "2026-08-05T10:00:00Z" },
        { owner_id: "ghost", choice: "against", share_bps: 700, created_at: "2026-08-05T11:00:00Z" },
      ],
    });

    expect(trail.cast).toHaveLength(2);
    expect(trail.cast[1].fullName).toBeNull();
    expect(trail.againstBps).toBe(700);
  });
});
