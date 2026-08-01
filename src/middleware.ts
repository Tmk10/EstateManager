import { defineMiddleware } from "astro:middleware";
import { createClient } from "@/lib/supabase";

// Matched with startsWith, so "/api/email" covers /api/email/test and anything
// added under it later.
const PROTECTED_ROUTES = ["/dashboard", "/api/email"];

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
