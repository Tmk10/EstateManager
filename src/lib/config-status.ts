import { SUPABASE_URL, SUPABASE_KEY } from "astro:env/server";
import { isEmailConfigured } from "@/lib/email";

export interface ConfigStatus {
  name: string;
  configured: boolean;
  message: string;
  docsUrl?: string;
  docsLabel?: string;
}

/**
 * Computed per call rather than at module scope. `astro:env/server` values are
 * populated by the time this module is evaluated, but a Cloudflare binding read
 * through `cloudflare:workers` is not guaranteed to be — and Layout.astro
 * imports this module, so a top-level binding read is what would make the
 * banner throw on the first render instead of reporting the problem.
 */
export function getConfigStatuses(): ConfigStatus[] {
  return [
    {
      name: "Supabase",
      configured: Boolean(SUPABASE_URL && SUPABASE_KEY),
      message: "Supabase nie jest skonfigurowany — funkcje uwierzytelniania są wyłączone.",
      docsUrl: "https://github.com/przeprogramowani/10x-astro-starter#supabase-configuration",
      docsLabel: "Zobacz instrukcję konfiguracji",
    },
    {
      name: "Email",
      configured: isEmailConfigured(),
      message: "Kanał pocztowy nie jest skonfigurowany — wysyłka wiadomości do właścicieli jest wyłączona.",
    },
  ];
}

export function getMissingConfigs(): ConfigStatus[] {
  return getConfigStatuses().filter((s) => !s.configured);
}
