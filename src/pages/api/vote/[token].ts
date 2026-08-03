import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

/**
 * Records one vote. This is the only write path in the application that a caller with no
 * session can reach, and public.cast_vote is the only door it knocks on.
 *
 * Public by omission from PROTECTED_ROUTES, deliberately -- see the note beside that array
 * in src/middleware.ts. An owner has no account, so an auth gate here would refuse every
 * vote.
 *
 * TWO ERROR REGIMES MEET IN THIS FILE, and collapsing them is how the token space becomes
 * worth probing:
 *
 *   - Before a token has resolved, nothing may be named. An unknown token, a truncated
 *     token, a draft resolution and a forged `choice` (EM011) all redirect to
 *     /vote/<token> with NO ?error= -- which is the same neutral page the reader would have
 *     got by opening that link directly. cast_vote answers all four identically by design;
 *     this endpoint's job is not to undo that.
 *   - After it has resolved, a failure may be named. In practice only one can be: the read
 *     path worked and the write did not. The ?error= message is rendered by the vote page
 *     ONLY in the states it reaches with a resolved token, so even a named message stays
 *     invisible to a caller holding a token that resolves to nothing.
 *
 * No token reaches an error message or a log line from here: it is a bearer secret, and
 * possession of it is the voter's identity until PRD Open Question no. 1 closes. That rule
 * governs this repository's source, not the platform -- Workers Logs records the request URL
 * of every /vote/<token> hit and of every POST to this route regardless. See the header of
 * src/lib/voting-token.ts.
 */
export const POST: APIRoute = async (context) => {
  const { token } = context.params;

  // Unreachable through a matched route -- /api/vote/[token] does not match without one --
  // and handled anyway because the alternative is building a redirect around `undefined`.
  if (!token) {
    return context.redirect("/");
  }

  const votePath = `/vote/${encodeURIComponent(token)}`;

  /** Back to the page saying nothing. The whole of the pre-resolution error model. */
  const neutral = () => context.redirect(votePath);
  const fail = (message: string) => context.redirect(`${votePath}?error=${encodeURIComponent(message)}`);

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return fail("Nie udało się zapisać głosu. Spróbuj ponownie za chwilę.");
  }

  // Form data, not JSON -- the shape every form endpoint in this app uses, and the shape a
  // page that must work without JavaScript can post.
  const form = await context.request.formData();
  const choice = form.get("choice");

  // The value goes to cast_vote as it arrived, English vocabulary and all. No second opinion
  // on what a valid choice is: the check constraint votes_choice_known and the EM011 raise
  // are the single decider, and a copy of that list here could only ever drift out of
  // agreement with it. A missing or non-string field posts an empty string, which EM011
  // refuses -- before any lookup, so the refusal distinguishes nothing about the token.
  const { error } = await supabase.rpc("cast_vote", {
    p_token: token,
    p_choice: typeof choice === "string" ? choice : "",
  });

  if (error) {
    return error.code === "EM011" ? neutral() : fail("Nie udało się zapisać głosu. Spróbuj ponownie za chwilę.");
  }

  // The returned row is deliberately not read, and the redirect is the same one the zero-row
  // case gets. Two reasons: the page re-resolves through resolve_voting_link, which is the
  // single decider of what this reader may see, so anything carried across in a query
  // parameter would be a second, forgeable opinion about their own vote; and a success that
  // redirected anywhere other than where a zero-row answer redirects would tell a caller
  // whether their token exists. cast_vote's `vote_recorded` distinguishes "this call stored
  // it" from "it was already there" -- the receipt reads the same either way, on purpose,
  // because the stored timestamp already answers the only question that difference raises.
  return neutral();
};
