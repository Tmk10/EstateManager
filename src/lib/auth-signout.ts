// Decides what a sign-out attempt leaves behind, without performing any effect: which
// cookies the route must delete, where the administrator is sent, and what the server
// logs. Imports nothing, so it runs under bare Vitest -- same discipline as `shares.ts`.

export interface SignOutInput {
  /** `false` when `createClient()` returned null because Supabase is unconfigured. */
  configured: boolean;
  /** What `supabase.auth.signOut()` reported, or null when it succeeded. */
  error: { message: string } | null;
  /** Every cookie name on the request, in the order the header carried them. */
  cookieNames: string[];
}

export type SignOutDecision =
  | { ok: true; redirectTo: "/"; cookiesToDelete: string[]; logMessage: null }
  | {
      ok: false;
      reason: "signout-failed" | "unconfigured";
      redirectTo: string;
      cookiesToDelete: string[];
      logMessage: string;
    };

// The session cookie as `@supabase/ssr` writes it: `sb-<ref>-auth-token`, plus the
// `.0` / `.1` chunks it splits into once the session outgrows one cookie. Deleting only
// the base name would leave a chunked session alive.
const SESSION_COOKIE = /^sb-.+-auth-token(\.\d+)?$/;

// Both failures end the same way for the administrator: the server-side session may
// still be there, but this browser's is not.
const SIGNOUT_FAILED = "Nie udało się zamknąć sesji na serwerze. Sesja w tej przeglądarce została zamknięta.";
const UNCONFIGURED = "Wylogowanie jest chwilowo niedostępne. Sesja w tej przeglądarce została zamknięta.";

function failedSignIn(message: string): string {
  return `/auth/signin?error=${encodeURIComponent(message)}`;
}

export function decideSignOut(input: SignOutInput): SignOutDecision {
  const sessionCookies = input.cookieNames.filter((name) => SESSION_COOKIE.test(name));

  if (!input.configured) {
    return {
      ok: false,
      reason: "unconfigured",
      redirectTo: failedSignIn(UNCONFIGURED),
      cookiesToDelete: sessionCookies,
      logMessage: "Sign-out attempted while Supabase is not configured",
    };
  }

  if (input.error !== null) {
    return {
      ok: false,
      reason: "signout-failed",
      redirectTo: failedSignIn(SIGNOUT_FAILED),
      cookiesToDelete: sessionCookies,
      // Carries the provider's message and nothing from the request -- never a cookie
      // value, never a token.
      logMessage: `Sign-out failed: ${input.error.message}`,
    };
  }

  // The SDK cleared the session itself; there is nothing left to delete.
  return { ok: true, redirectTo: "/", cookiesToDelete: [], logMessage: null };
}
