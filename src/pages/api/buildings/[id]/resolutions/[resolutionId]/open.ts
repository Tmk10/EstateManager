import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { createVotingToken } from "@/lib/voting-token";

/**
 * Opens the vote: creates the missing voting links, then flips the status -- in that order.
 *
 * Two application queries by design rather than one RPC (decided during planning). The
 * failure mode that choice carries is an open resolution with an incomplete set of links,
 * which would silently disenfranchise owners, and it is removed by ORDERING rather than by
 * a transaction: links first, status last. A crash in between leaves tokens attached to a
 * still-draft resolution -- invisible to everyone, because resolve_voting_link filters on
 * `status <> 'draft'` -- and is repaired by pressing the button again.
 *
 * Two concurrent presses are still two writers. Step 4 narrows that window; only a
 * transaction would close it, and that is the RPC this slice deliberately does not use.
 *
 * No token generated here may reach an error message or a log line: it is a bearer secret,
 * and possession of it is the voter's identity until PRD Open Question no. 1 closes. That
 * rule governs this file, not the platform -- Workers Logs records the request URL of every
 * /vote/<token> hit regardless. See the header of src/lib/voting-token.ts.
 */
export const POST: APIRoute = async (context) => {
  const { id, resolutionId } = context.params;

  if (!id || !resolutionId) {
    return context.redirect("/buildings");
  }

  const fail = (message: string) =>
    context.redirect(`/buildings/${id}/resolutions/${resolutionId}?error=${encodeURIComponent(message)}`);

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return fail("Baza danych nie jest skonfigurowana.");
  }

  // 1. The resolution, scoped by building so an id from another building is "not found"
  //    rather than a cross-building write.
  //
  //    Existence only -- status is deliberately not projected here. Step 5's update is
  //    scoped `.eq("status", "draft")`, which is the single place the transition is
  //    enforced; reading the status here as well would duplicate that guard in a second
  //    place, where it could drift out of agreement with the one that actually gates the
  //    write. A press on an already-open resolution therefore no-ops at step 5 rather than
  //    being refused earlier -- reachable only by a direct POST or a double submit, since
  //    the button renders in the draft branch alone.
  const { data: resolution, error: resolutionError } = await supabase
    .from("resolutions")
    .select("id")
    .eq("id", resolutionId)
    .eq("building_id", id)
    .maybeSingle();

  if (resolutionError) {
    return resolutionError.code === "22P02"
      ? fail("Nie znaleziono uchwały.")
      : fail(`Nie udało się otworzyć głosowania: ${resolutionError.message}`);
  }
  if (!resolution) {
    return fail("Nie znaleziono uchwały.");
  }

  // 2. The owners who can be sent a link. An owner without an e-mail address gets no link;
  //    what they lose is the link, not their weight in the S-05 tally, which is measured
  //    against all shares in the building.
  //
  //    Read twice, on purpose: once for the rows and once for an exact count. PostgREST caps
  //    a plain select at its "Max rows" setting and says so nowhere in the response, so a
  //    truncated read would make step 4 compare a number against itself and pass. The count
  //    is the only side of that comparison the cap cannot silently shorten.
  const [{ data: owners, error: ownersError }, { count: ownerCount, error: ownerCountError }] = await Promise.all([
    supabase.from("owners").select("id").eq("building_id", id).not("email", "is", null),
    supabase.from("owners").select("id", { count: "exact", head: true }).eq("building_id", id).not("email", "is", null),
  ]);

  const ownersReadError = ownersError ?? ownerCountError;
  if (ownersReadError) {
    return fail(`Nie udało się odczytać właścicieli: ${ownersReadError.message}`);
  }
  if (owners.length === 0) {
    return fail("Żaden właściciel w tym budynku nie ma adresu e-mail — nie ma komu wystawić linku.");
  }

  // 3. One row per owner, conflict-tolerant at the STATEMENT level. This is load-bearing,
  //    not tidiness: a plain multi-row insert aborts entirely on the first unique violation,
  //    so a double-clicked button would leave the losing request having written nothing
  //    while still going on to flip the status -- an open resolution with a partial link
  //    set, which is the exact failure this ordering exists to prevent. Catching 23505
  //    afterwards does not help; by then the whole statement has rolled back.
  const { error: linksError } = await supabase.from("voting_links").upsert(
    owners.map((owner) => ({
      resolution_id: resolutionId,
      owner_id: owner.id,
      building_id: id,
      token: createVotingToken(),
    })),
    { onConflict: "resolution_id,owner_id", ignoreDuplicates: true },
  );

  if (linksError) {
    // Deliberately not interpolating anything but the database's own message: the rows that
    // failed carry tokens.
    return fail(`Nie udało się wystawić linków do głosowania: ${linksError.message}`);
  }

  // 4. Count what actually landed, and compare it with the exact owner count rather than
  //    with the length of the list step 2 iterated. This turns "open implies a complete set
  //    of links" from an argument in the plan into something the code checks before it flips
  //    the status -- which it only does if the two numbers come from different reads.
  const { count, error: countError } = await supabase
    .from("voting_links")
    .select("id", { count: "exact", head: true })
    .eq("resolution_id", resolutionId);

  if (countError) {
    return fail(`Nie udało się sprawdzić linków do głosowania: ${countError.message}`);
  }
  if ((count ?? 0) !== (ownerCount ?? 0)) {
    return fail("Nie udało się wystawić linków dla wszystkich właścicieli. Spróbuj ponownie.");
  }

  // 5. Flip the status, scoped by `status = 'draft'` so a second press is a no-op rather
  //    than a re-opening -- and so opened_at keeps the moment the vote actually opened.
  //    The timestamp comes from the Worker rather than from now(): supabase-js posts values,
  //    not SQL expressions, and a few milliseconds of clock skew do not matter to a vote
  //    with no end date (FR-007).
  const { error: openError } = await supabase
    .from("resolutions")
    .update({ status: "open", opened_at: new Date().toISOString() })
    .eq("id", resolutionId)
    .eq("building_id", id)
    .eq("status", "draft");

  if (openError) {
    // EM007 is the freeze trigger refusing a transition. Unreachable through this endpoint
    // (draft -> open is the only transition it attempts), mapped because a backstop that is
    // not mapped reads as a crash.
    return openError.code === "EM007"
      ? fail("Nie można otworzyć głosowania dla tej uchwały.")
      : fail(`Nie udało się otworzyć głosowania: ${openError.message}`);
  }

  return context.redirect(`/buildings/${id}/resolutions/${resolutionId}`);
};
