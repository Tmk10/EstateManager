import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

// Long enough for a real community name ("Wspólnota Mieszkaniowa im. Jana Pawła II
// przy ul. ..."), short enough that the column is not a free-text dumping ground.
const MAX_LENGTH = 200;

const FIELDS = [
  { key: "name", label: "Nazwa budynku" },
  { key: "city", label: "Miejscowość" },
  { key: "street", label: "Ulica i numer" },
] as const;

function fail(context: Parameters<APIRoute>[0], message: string) {
  return context.redirect(`/buildings/new?error=${encodeURIComponent(message)}`);
}

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();

  const values: Record<string, string> = {};
  for (const { key, label } of FIELDS) {
    const raw = form.get(key);
    const value = typeof raw === "string" ? raw.trim() : "";

    if (!value) {
      return fail(context, `${label}: pole jest wymagane.`);
    }
    if (value.length > MAX_LENGTH) {
      return fail(context, `${label}: maksymalnie ${String(MAX_LENGTH)} znaków.`);
    }
    values[key] = value;
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return fail(context, "Baza danych nie jest skonfigurowana.");
  }

  const { error } = await supabase.from("buildings").insert({
    name: values.name,
    city: values.city,
    street: values.street,
  });

  if (error) {
    // 23505 = unique_violation on buildings_name_city_street_key. Everything else is
    // unexpected, so it keeps its own message rather than being flattened into this one.
    if (error.code === "23505") {
      return fail(context, "Budynek o tej nazwie i adresie już istnieje.");
    }
    return fail(context, `Nie udało się zapisać budynku: ${error.message}`);
  }

  return context.redirect("/buildings");
};
