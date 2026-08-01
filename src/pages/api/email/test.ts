import type { APIRoute } from "astro";
import { sendTestEmail } from "@/lib/email";

/**
 * Fires one test message through the EMAIL binding. Protected by
 * PROTECTED_ROUTES in src/middleware.ts — the app's only auth gate — so an
 * unauthenticated caller is redirected to /auth/signin before reaching here.
 *
 * Takes form data like the auth endpoints, but answers with JSON like
 * /api/health: this is a diagnostic fired by curl, not a browser form flow.
 *
 * It stays in the repository after F-02 as a live smoke test, so the channel
 * can be re-verified after any deploy — which matters on a beta API.
 */

// Deliberately loose: the binding is the real validator. This only rejects
// input that is obviously not an address, so an empty form does not spend a
// send against the daily quota.
const PLAUSIBLE_ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(body: Record<string, string>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

export const POST: APIRoute = async ({ request }) => {
  const formData = await request.formData();
  const to = formData.get("to");
  const recipient = typeof to === "string" ? to.trim() : "";

  if (!PLAUSIBLE_ADDRESS.test(recipient)) {
    return json({ status: "error", error: "missing-recipient" }, 400);
  }

  // The message body is fixed; only the recipient varies. That keeps this from
  // becoming an ad-hoc mailer while still allowing re-verification against a
  // different inbox without a code change.
  const result = await sendTestEmail(recipient);

  if (!result.ok) {
    return json({ status: "error", code: result.code, message: result.message }, 502);
  }

  return json({ status: "sent", messageId: result.messageId }, 200);
};
