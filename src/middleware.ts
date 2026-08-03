import { defineMiddleware } from "astro:middleware";
import { createClient } from "@/lib/supabase";

// Matched with startsWith, so "/api/email" covers /api/email/test and anything
// added under it later. Likewise "/buildings" covers /buildings/new today and
// /buildings/<id> when S-01b adds it.
//
// This array is the ONLY auth gate in the app: a new page is public until its path
// appears here.
//
// /vote is deliberately absent, and it is the first route for which that is true. An owner
// has no account in v1 — PRD `## Access Control`: only administrators authenticate, owners
// vote through a per-owner link with no session — so adding it here would redirect every
// voting link to the sign-in screen and break the one flow the product exists for. What
// protects that route is not this array but public.resolve_voting_link: the token is the
// credential, the function is SECURITY DEFINER over a fixed narrow row, and anon is denied
// on every table it reads. Do not "fix" the omission.
//
// /api/vote is absent for the same reason, and S-03 added it knowing that. Because matching
// is startsWith, listing it here would bounce every cast vote to /auth/signin -- the owner
// has no account to sign in with, so the flow would not merely be gated, it would be
// impossible. Its protection is the same shape: the token is the credential and
// public.cast_vote is the only door, SECURITY DEFINER over one narrow row, answering an
// unknown token exactly as it answers a real one.
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
