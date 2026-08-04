import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { sendVotingLinkEmail } from "@/lib/email";
import { buildVotingLinkMessage } from "@/lib/voting-link-email";

/**
 * Mails every owner who has not yet been reached their individual voting link (S-04).
 *
 * The administrator WAITS for this. A 70-owner building is tens of seconds of a pending
 * request, and that was chosen over `ctx.waitUntil`, whose 30-second budget a full run may
 * exceed and whose failures are invisible until someone reloads. The cost is not paid down
 * by making the run shorter but by making its interruption harmless: status is written
 * after EACH send, so a closed tab, a timeout or a dead connection costs at most one
 * owner's status, and pressing the button again picks up exactly where it stopped.
 *
 * Sends are sequential, not concurrent. Concurrency would shorten the wall clock and risk
 * E_RATE_LIMIT_EXCEEDED, converting a slow success into a partial failure the
 * administrator has to repair.
 *
 * The token is a bearer credential. It appears in exactly two places on this path -- the
 * voting_links row and the message body -- and must never reach the redirect query string,
 * an error message, a log line or the run summary. Note one specific trap, met while
 * building this: PostgREST's error `details` field dumps the entire failing row, token
 * included, while `message` does not. Interpolate `message`, never `details`.
 */
export const POST: APIRoute = async (context) => {
  const { id, resolutionId } = context.params;

  if (!id || !resolutionId) {
    return context.redirect("/buildings");
  }

  const resolutionPath = `/buildings/${id}/resolutions/${resolutionId}`;
  const fail = (message: string) => context.redirect(`${resolutionPath}?error=${encodeURIComponent(message)}`);

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return fail("Baza danych nie jest skonfigurowana.");
  }

  // 1. The resolution, scoped by building so an id from another building is "not found"
  //    rather than a cross-building read. The building name and the resolution's content
  //    are all needed for the message itself.
  const { data: resolution, error: resolutionError } = await supabase
    .from("resolutions")
    .select("id, number, title, body, status, buildings(name)")
    .eq("id", resolutionId)
    .eq("building_id", id)
    .maybeSingle();

  if (resolutionError) {
    return resolutionError.code === "22P02"
      ? fail("Nie znaleziono uchwały.")
      : fail(`Nie udało się odczytać uchwały: ${resolutionError.message}`);
  }
  if (!resolution) {
    return fail("Nie znaleziono uchwały.");
  }

  // 2. A draft's links resolve to nothing on /vote/<token> -- resolve_voting_link filters
  //    on `status <> 'draft'` -- so mailing them would send every owner to a page that
  //    tells them nothing. The button only renders on an open resolution; this covers the
  //    direct POST.
  if (resolution.status === "draft") {
    return fail("Najpierw uruchom głosowanie — dopiero wtedy linki są ważne.");
  }

  // Non-null by schema: voting_links and resolutions both carry a NOT NULL building_id, so
  // the embedded row always resolves. Typed that way too -- a `?? ""` here is dead code
  // that lint rejects, and the honest reading is that a resolution without a building is
  // unrepresentable rather than merely unlikely.
  const buildingName = resolution.buildings.name;

  // 3. The unsent links, with their tokens, and the attempt counts to increment.
  //
  //    Two reads because they answer different questions and one of them cannot be a plain
  //    select: `token` is not readable by `authenticated` (migration 20260802214500), so it
  //    comes from the security-definer function, which returns only this resolution's
  //    unsent rows. attempt_count IS readable -- the accompanying migration granted it --
  //    and supabase-js posts values rather than SQL expressions, so `attempt_count + 1`
  //    has to be computed here from a known previous value rather than in the update.
  const [linksResult, attemptsResult] = await Promise.all([
    supabase.rpc("unsent_voting_links", { p_resolution_id: resolutionId }),
    supabase.from("voting_links").select("id, attempt_count").eq("resolution_id", resolutionId).is("sent_at", null),
  ]);

  const readError = linksResult.error ?? attemptsResult.error;
  if (readError) {
    // message only -- see the header note about `details` carrying the token.
    return fail(`Nie udało się odczytać linków do głosowania: ${readError.message}`);
  }

  const links = linksResult.data;

  // 4. Nothing to do is a SUCCESS, not an error. Nothing is ever re-sent.
  if (links.length === 0) {
    const message = "Wszyscy właściciele z adresem e-mail mają już wysłany link.";
    return context.redirect(`${resolutionPath}?notice=${encodeURIComponent(message)}`);
  }

  const attemptCounts = new Map(attemptsResult.data.map((row) => [row.id, row.attempt_count]));

  let sent = 0;
  let failed = 0;
  // A send that succeeded but whose status write did not. Counted separately because it is
  // the one state that can produce a DUPLICATE message on the next press -- the owner has
  // their link, the database does not know it. The plan is silent on this; leaving it
  // silent would hide the single failure this slice is built to avoid.
  let unrecorded = 0;

  // 5. Sequential, awaiting each send, writing status before the next one starts.
  //    Batching the writes would halve the round trips and destroy the resume: a run dying
  //    at owner 60 would have sent 60 messages and recorded none.
  for (const link of links) {
    const message = buildVotingLinkMessage({
      buildingName,
      resolutionNumber: resolution.number,
      resolutionTitle: resolution.title,
      resolutionBody: resolution.body,
      ownerFullName: link.owner_full_name,
      // Absolute, from the request's own origin -- never a hardcoded hostname -- so the
      // same code produces working links on localhost, on *.workers.dev and on whatever
      // domain comes later.
      voteUrl: `${context.url.origin}/vote/${link.token}`,
    });

    const result = await sendVotingLinkEmail(link.owner_email, message);

    // The Worker's clock, matching how open.ts writes opened_at: supabase-js posts values,
    // not SQL expressions.
    const now = new Date().toISOString();
    const previousAttempts = attemptCounts.get(link.link_id) ?? 0;

    const { error: writeError } = await supabase
      .from("voting_links")
      .update({
        attempt_count: previousAttempts + 1,
        last_attempt_at: now,
        // The check constraint voting_links_send_state_check refuses a row carrying both,
        // which is why success clears the error rather than leaving a stale one beside a
        // sent_at.
        ...(result.ok ? { sent_at: now, last_error_code: null } : { last_error_code: result.code }),
      })
      .eq("id", link.link_id);

    if (result.ok) {
      if (writeError) {
        unrecorded += 1;
      } else {
        sent += 1;
      }
    } else {
      // 6. A failure never aborts the run -- the next owner is attempted regardless, and
      //    there is no retry. The resume path IS the retry.
      failed += 1;
    }
  }

  // 7. Counts only. No token, no e-mail address, no owner name.
  const summary = new URLSearchParams({ sent: String(sent), failed: String(failed) });
  if (unrecorded > 0) {
    summary.set("unrecorded", String(unrecorded));
  }

  return context.redirect(`${resolutionPath}?${summary.toString()}`);
};
