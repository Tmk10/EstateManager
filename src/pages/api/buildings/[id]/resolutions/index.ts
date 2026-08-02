import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { parseResolutionForm } from "@/lib/resolutions";

export const POST: APIRoute = async (context) => {
  const { id } = context.params;

  if (!id) {
    return context.redirect("/buildings");
  }

  // Form data and a redirect carrying ?error=, never a JSON body -- the shape every form
  // endpoint in this app uses (src/pages/api/buildings/index.ts:14-16).
  const fail = (message: string) =>
    context.redirect(`/buildings/${id}/resolutions/new?error=${encodeURIComponent(message)}`);

  const form = await context.request.formData();
  const parsed = parseResolutionForm(form);

  if (!parsed.ok) {
    return fail(parsed.message);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return fail("Baza danych nie jest skonfigurowana.");
  }

  // No owners check here, unlike api/buildings/[id]/units.ts:43-51, which re-parses and
  // recomputes rather than trust anything the browser posted. The asymmetry is deliberate,
  // not an omission: what units.ts protects is a registry whose arithmetic must hold, so
  // trusting the client would let a wrong number reach the database. Here the only thing a
  // direct POST past new.astro's gate can produce is a DRAFT in a building with no owners --
  // which is inert. Nothing is sent, no link exists, and nobody can vote; the guarantee that
  // matters, "open implies a complete set of links", is enforced where the status actually
  // flips, by open.ts (step 2, "Żaden właściciel w tym budynku nie ma adresu e-mail"). A
  // second check here would be a second copy of that rule, positioned where it cannot be the
  // one that decides.
  //
  // `status` is deliberately absent: it defaults to 'draft' in the schema, and a resolution
  // that could be created already open would skip the step that writes the voting links --
  // which is what makes the paragraph above hold.
  const { data, error } = await supabase
    .from("resolutions")
    .insert({ building_id: id, number: parsed.values.number, title: parsed.values.title, body: parsed.values.body })
    .select("id")
    .single();

  if (error) {
    // 23505 = unique_violation on resolutions_building_id_number_lower_key -- the community
    // numbers its own resolutions and two of them must not share a number.
    if (error.code === "23505") {
      return fail("Uchwała o tym numerze już istnieje w tym budynku.");
    }
    // 23503 = foreign_key_violation, 22P02 = the id in the URL is not a uuid at all. Both
    // mean the address is wrong rather than the form. Everything else keeps its own message
    // rather than being flattened into one.
    if (error.code === "23503" || error.code === "22P02") {
      return fail("Nie znaleziono budynku.");
    }
    return fail(`Nie udało się zapisać uchwały: ${error.message}`);
  }

  return context.redirect(`/buildings/${id}/resolutions/${data.id}`);
};
