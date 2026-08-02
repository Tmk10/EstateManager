import { defineMiddleware } from "astro:middleware";
import { createClient } from "@/lib/supabase";

// Matched with startsWith, so "/api/email" covers /api/email/test and anything
// added under it later. Likewise "/buildings" covers /buildings/new today and
// /buildings/<id> when S-01b adds it.
//
// This array is the ONLY auth gate in the app: a new page is public until its path
// appears here.
const PROTECTED_ROUTES = ["/dashboard", "/api/email", "/buildings", "/api/buildings", "/help"];

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createClient(context.request.headers, context.cookies);

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    context.locals.user = user ?? null;
  } else {
    context.locals.user = null;
  }

  if (PROTECTED_ROUTES.some((route) => context.url.pathname.startsWith(route))) {
    if (!context.locals.user) {
      return context.redirect("/auth/signin");
    }
  }

  return next();
});
