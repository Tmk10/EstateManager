import type { APIRoute } from "astro";
import { SUPABASE_URL, SUPABASE_KEY } from "astro:env/server";
import { isEmailConfigured } from "@/lib/email";

/**
 * Liveness + dependency probe. Deliberately unauthenticated and absent from
 * PROTECTED_ROUTES in src/middleware.ts — it has to answer before auth works.
 *
 * Both Supabase vars are `optional: true` in astro.config.mjs so that local dev
 * and preview builds degrade to the config-status banner instead of failing the
 * build. That same leniency would let a production deploy go green while the app
 * is non-functional, so this route is where the condition is made loud.
 */

const PROBE_TIMEOUT_MS = 3000;

function json(body: Record<string, string>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      // Never let a health verdict be served from cache.
      "cache-control": "no-store",
    },
  });
}

export const GET: APIRoute = async () => {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return json({ status: "misconfigured", supabase: "missing-credentials" }, 503);
  }

  // A presence check alone would still pass with a rotated key, which is the
  // actual failure this route exists to catch — so reach out to Supabase.
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
      headers: { apikey: SUPABASE_KEY },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });

    if (!response.ok) {
      return json({ status: "degraded", supabase: "unreachable" }, 503);
    }
  } catch {
    // Timeout, DNS failure, TLS failure — all indistinguishable to a caller,
    // and none of them should surface the URL or the key.
    return json({ status: "degraded", supabase: "unreachable" }, 503);
  }

  // Informational only: deploy.yml curls this route with --fail, and a beta
  // mail channel should not be able to block shipping the rest of the app.
  // A missing EMAIL binding is therefore reported inside a 200 rather than
  // flipping the status code — a deliberate step down from the Supabase
  // treatment above. Revisit when S-04 makes the channel load-bearing.
  return json({ status: "ok", email: isEmailConfigured() ? "ok" : "missing" }, 200);
};
