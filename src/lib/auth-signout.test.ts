import { describe, expect, it } from "vitest";

import { decideSignOut } from "@/lib/auth-signout";

// The request carries the session as a chunked cookie plus unrelated ones.
const COOKIE_NAMES = ["theme", "sb-127-auth-token", "sb-127-auth-token.0", "sb-127-auth-token.1", "sb-something-else"];

function errorMessageOf(redirectTo: string): string | null {
  return new URL(redirectTo, "https://estate-manager.test").searchParams.get("error");
}

describe("deciding what a sign-out attempt leaves behind", () => {
  it("leaves the session cookies to the SDK when the call succeeded", () => {
    const decision = decideSignOut({ configured: true, error: null, cookieNames: COOKIE_NAMES });

    expect(decision.ok).toBe(true);
    expect(decision.redirectTo).toBe("/");
    expect(decision.cookiesToDelete).toEqual([]);
    expect(decision.logMessage).toBeNull();
  });

  it("clears the session cookie and every chunk of it when the call failed", () => {
    const decision = decideSignOut({
      configured: true,
      error: { message: "Internal Server Error" },
      cookieNames: COOKIE_NAMES,
    });

    if (decision.ok) {
      throw new Error("expected a failed sign-out to be reported as failed");
    }

    expect(decision.reason).toBe("signout-failed");
    expect(decision.cookiesToDelete).toEqual(["sb-127-auth-token", "sb-127-auth-token.0", "sb-127-auth-token.1"]);
    expect(errorMessageOf(decision.redirectTo)).toBe(
      "Nie udało się zamknąć sesji na serwerze. Sesja w tej przeglądarce została zamknięta.",
    );
    expect(decision.logMessage).toContain("Internal Server Error");
  });

  it("sends the administrator to the screen that renders the message, not to the home page", () => {
    const decision = decideSignOut({
      configured: true,
      error: { message: "Internal Server Error" },
      cookieNames: COOKIE_NAMES,
    });

    // `/` does not read `?error=`; only the sign-in screen does.
    expect(decision.redirectTo.startsWith("/auth/signin?error=")).toBe(true);
  });

  it("says so and still clears the browser when Supabase is not configured", () => {
    const decision = decideSignOut({ configured: false, error: null, cookieNames: COOKIE_NAMES });

    if (decision.ok) {
      throw new Error("expected an unconfigured sign-out to be reported as failed");
    }

    expect(decision.reason).toBe("unconfigured");
    expect(decision.cookiesToDelete).toEqual(["sb-127-auth-token", "sb-127-auth-token.0", "sb-127-auth-token.1"]);
    expect(errorMessageOf(decision.redirectTo)).toBe(
      "Wylogowanie jest chwilowo niedostępne. Sesja w tej przeglądarce została zamknięta.",
    );
  });

  it("never deletes a cookie that is not the session", () => {
    const decision = decideSignOut({
      configured: true,
      error: { message: "Internal Server Error" },
      cookieNames: COOKIE_NAMES,
    });

    expect(decision.cookiesToDelete).not.toContain("theme");
    expect(decision.cookiesToDelete).not.toContain("sb-something-else");
  });
});
