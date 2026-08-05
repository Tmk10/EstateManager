/**
 * The audit trail of a settled uchwała (S-06).
 *
 * Turns the resolution page's raw reads into the rows it renders: who voted, how, at what
 * weight and when; who did not; and the reconciliation that proves the three add up to the
 * whole building.
 *
 * Pure and dependency-free on purpose -- no Supabase import, no Astro import -- for the same
 * reason `shares.ts` and `units-csv.ts` are: the arithmetic that reconstructs a settled vote
 * belongs somewhere a test can reach without a database.
 */

export interface TrailOwner {
  id: string;
  full_name: string;
}

export interface TrailUnit {
  owner_id: string | null;
  unit_number: string;
  share_bps: number;
}

export interface TrailVote {
  owner_id: string;
  choice: string;
  share_bps: number;
  created_at: string;
}

export interface CastTrailRow {
  ownerId: string;
  /**
   * `null` when the vote's owner is absent from the registry read -- a broken invariant the
   * composite foreign key makes unreachable today. The row is surfaced rather than dropped:
   * its udziały still count toward the reconciliation, so an anomaly shows up as a nameless
   * row instead of as a total that quietly fails to close.
   */
  fullName: string | null;
  unitNumbers: string[];
  /**
   * The weight the vote carried when it was cast -- `votes.share_bps`, never a fresh sum of
   * the owner's units. The table's own comment makes the snapshot authoritative over any
   * recomputation, and in v1 the registry cannot move, so an implementation that re-summed
   * would agree with this one on every real fixture and be wrong the day a registry-edit
   * path lands.
   */
  shareBps: number;
  choice: string;
  castAt: string;
}

export interface SilentTrailRow {
  ownerId: string;
  fullName: string;
  unitNumbers: string[];
  /**
   * The registry share, summed across the owner's lokale. There is no snapshot to prefer
   * here: an owner who never voted left no row to carry one, and their udziały are what the
   * threshold counted as a no.
   */
  shareBps: number;
}

export interface ResolutionTrail {
  /** Every vote cast, oldest first. */
  cast: CastTrailRow[];
  /** The owners with no vote, by name. */
  notCast: SilentTrailRow[];
  forBps: number;
  againstBps: number;
  notCastBps: number;
}

/** Numeric-aware Polish collation, the treatment unit numbers get everywhere else on the page. */
function byUnitNumber(a: string, b: string): number {
  return a.localeCompare(b, "pl", { numeric: true });
}

export function assembleResolutionTrail(input: {
  owners: TrailOwner[];
  units: TrailUnit[];
  votes: TrailVote[];
}): ResolutionTrail {
  const unitNumbersByOwner = new Map<string, string[]>();
  const registryBpsByOwner = new Map<string, number>();
  for (const unit of input.units) {
    if (unit.owner_id === null) continue;
    const numbers = unitNumbersByOwner.get(unit.owner_id) ?? [];
    numbers.push(unit.unit_number);
    unitNumbersByOwner.set(unit.owner_id, numbers);
    registryBpsByOwner.set(unit.owner_id, (registryBpsByOwner.get(unit.owner_id) ?? 0) + unit.share_bps);
  }
  for (const numbers of unitNumbersByOwner.values()) {
    numbers.sort(byUnitNumber);
  }

  const ownersById = new Map(input.owners.map((owner) => [owner.id, owner]));
  const votedOwnerIds = new Set(input.votes.map((vote) => vote.owner_id));

  const cast = input.votes
    .map((vote) => ({
      ownerId: vote.owner_id,
      fullName: ownersById.get(vote.owner_id)?.full_name ?? null,
      unitNumbers: unitNumbersByOwner.get(vote.owner_id) ?? [],
      shareBps: vote.share_bps,
      choice: vote.choice,
      castAt: vote.created_at,
    }))
    // Chronological, because the trail is a record of how the result was reached and the
    // order the rows arrive in is PostgREST's, not the electorate's. Comparing created_at
    // against created_at is one clock against itself -- the comparison the decided_at rule
    // forbids is against opened_at, which is the Worker's clock and appears nowhere here.
    //
    // Plain string comparison, not localeCompare: a timestamptz arrives from PostgREST as
    // ISO 8601 normalised to UTC, and on that format byte order is chronological order.
    // Collating it under a locale would imply a judgement call that is not being made.
    .sort((a, b) => (a.castAt < b.castAt ? -1 : a.castAt > b.castAt ? 1 : 0));

  const notCast = input.owners
    .filter((owner) => !votedOwnerIds.has(owner.id))
    // An owner holding no lokale is not part of the electorate. They carry no udziały,
    // so they can neither vote to any weight nor withhold one, and naming them under
    // "whose silence counted as a no" asserts something untrue about the result.
    //
    // The schema refuses such a row since EM015 (20260805192000), but `create constraint
    // trigger` validates nothing that already exists -- a database predating that
    // migration keeps the ones it has, and one is exactly how this surfaced. The
    // constraint stops new ones; this line survives the old ones.
    .filter((owner) => (registryBpsByOwner.get(owner.id) ?? 0) > 0)
    .map((owner) => ({
      ownerId: owner.id,
      fullName: owner.full_name,
      unitNumbers: unitNumbersByOwner.get(owner.id) ?? [],
      shareBps: registryBpsByOwner.get(owner.id) ?? 0,
    }));

  return {
    cast,
    notCast,
    forBps: cast.reduce((sum, row) => (row.choice === "for" ? sum + row.shareBps : sum), 0),
    againstBps: cast.reduce((sum, row) => (row.choice === "against" ? sum + row.shareBps : sum), 0),
    // Summed from the rows this function actually assembled, never copied from
    // resolution_tally. If it echoed the tally it would agree with it by construction and
    // could never catch a missing or double-counted owner -- which is the whole point of
    // showing the two side by side.
    notCastBps: notCast.reduce((sum, row) => sum + row.shareBps, 0),
  };
}
