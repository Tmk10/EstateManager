import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { parseResolutionForm } from "@/lib/resolutions";

/**
 * Postgres error codes raised by public.assert_resolution_frozen, mapped to Polish.
 *
 * Both are backstops: the update below is scoped by `status = 'draft'`, so an open
 * resolution matches zero rows and the trigger is never reached. They are mapped anyway,
 * because a backstop that is not mapped reads as a crash to whoever hits it.
 */
const ERROR_MESSAGES: Record<string, string | undefined> = {
  EM006: "Uchwała jest już w głosowaniu i jej treści nie można zmienić.",
  EM007: "Nie można cofnąć uchwały do wersji roboczej.",
};

export const POST: APIRoute = async (context) => {
  const { id, resolutionId } = context.params;

  if (!id || !resolutionId) {
    return context.redirect("/buildings");
  }

  const fail = (message: string) =>
    context.redirect(`/buildings/${id}/resolutions/${resolutionId}?error=${encodeURIComponent(message)}`);

  const form = await context.request.formData();
  const parsed = parseResolutionForm(form);

  if (!parsed.ok) {
    return fail(parsed.message);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return fail("Baza danych nie jest skonfigurowana.");
  }

  // Scoped by all three: `building_id` so a resolution id from another building is not
  // found rather than cross-building writable, and `status = 'draft'` so an open resolution
  // updates nothing at all. "Glos jest ostateczny" rests on this and on the trigger behind
  // it, never on the page declining to render an edit form.
  const { data, error } = await supabase
    .from("resolutions")
    .update({ number: parsed.values.number, title: parsed.values.title, body: parsed.values.body })
    .eq("id", resolutionId)
    .eq("building_id", id)
    .eq("status", "draft")
    .select("id");

  if (error) {
    const mapped = ERROR_MESSAGES[error.code];
    if (mapped) {
      return fail(mapped);
    }
    if (error.code === "23505") {
      return fail("Uchwała o tym numerze już istnieje w tym budynku.");
    }
    if (error.code === "22P02") {
      return fail("Nie znaleziono uchwały.");
    }
    return fail(`Nie udało się zapisać uchwały: ${error.message}`);
  }

  // Zero rows is ambiguous by construction -- either the resolution does not exist, or it
  // is no longer a draft. The second is the one an administrator can actually cause, so it
  // is the one the message names.
  if (data.length === 0) {
    return fail("Uchwała jest już w głosowaniu i jej treści nie można zmienić.");
  }

  return context.redirect(`/buildings/${id}/resolutions/${resolutionId}`);
};
