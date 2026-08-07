import type { APIRoute } from "astro";
import { parseCookieHeader } from "@supabase/ssr";
import { createClient } from "@/lib/supabase";
import { decideSignOut } from "@/lib/auth-signout";

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);

  // `signOut()` reports a failed call as a value rather than a throw, and returns before
  // it clears the session -- so a discarded `{ error }` leaves the administrator signed in
  // on a page that says otherwise.
  const { error } = supabase ? await supabase.auth.signOut() : { error: null };

  const decision = decideSignOut({
    configured: supabase !== null,
    error,
    cookieNames: parseCookieHeader(context.request.headers.get("Cookie") ?? "").map(({ name }) => name),
  });

  for (const name of decision.cookiesToDelete) {
    context.cookies.delete(name, { path: "/" });
  }

  if (decision.logMessage !== null) {
    // eslint-disable-next-line no-console -- the only error channel this Worker has
    console.error(decision.logMessage);
  }

  return context.redirect(decision.redirectTo);
};
