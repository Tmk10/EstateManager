import { env } from "cloudflare:workers";

/**
 * The only module that imports `cloudflare:workers`. Everything else reaching
 * for the mail channel — config-status, the health probe, S-04's fanout — goes
 * through here, which keeps a build-time module-resolution risk in one file.
 *
 * Astro 6 with @astrojs/cloudflare 13 removed `Astro.locals.runtime.env`;
 * bindings arrive through this import instead. Unlike src/lib/supabase.ts there
 * is nothing to build per request, so these are plain functions.
 */

/**
 * The product's single sending identity, locked in wrangler.jsonc's
 * `allowed_sender_addresses`. A send from any other address fails at the
 * binding rather than reaching an owner from a wrong From.
 */
export const SENDER = { email: "glosowanie@estatemanager.dev", name: "EstateManager" };

export type SendResult = { ok: true; messageId: string } | { ok: false; code: string; message: string };

/**
 * `Cloudflare.Env` types every binding as present, but a binding missing from
 * wrangler.jsonc is `undefined` at runtime and does not throw at deploy time —
 * the "green deploy, dead feature" class F-01 closed for Supabase. Widen the
 * generated type so that absence is expressible, and read it lazily: a
 * module-scope binding read is what would make the config-status banner throw
 * on first render.
 */
function emailBinding(): SendEmail | undefined {
  return (env as Partial<Cloudflare.Env>).EMAIL;
}

/** Whether the EMAIL binding is present. Never throws when it is not. */
export function isEmailConfigured(): boolean {
  return Boolean(emailBinding());
}

const TEST_SUBJECT = "EstateManager — test kanału pocztowego";

const TEST_TEXT = `To jest wiadomość testowa z systemu EstateManager.

Potwierdza ona, że kanał pocztowy działa. Nie zawiera linku do głosowania
i nie wymaga żadnego działania.`;

const TEST_HTML = `<p>To jest wiadomość testowa z systemu EstateManager.</p>
<p>Potwierdza ona, że kanał pocztowy działa. Nie zawiera linku do głosowania
i nie wymaga żadnego działania.</p>`;

/**
 * Binding errors arrive as `Error` with a string `.code` (E_SENDER_NOT_VERIFIED,
 * E_RATE_LIMIT_EXCEEDED, …). No retry and no classification table here — one
 * send cannot exercise the table, and an unproven mapping in production is
 * worse than none. S-04 builds it against a real fanout.
 */
function describeSendError(error: unknown): { code: string; message: string } {
  if (error instanceof Error) {
    const { code } = error as Error & { code?: unknown };
    return {
      code: typeof code === "string" ? code : "E_UNKNOWN",
      message: error.message,
    };
  }
  return { code: "E_UNKNOWN", message: "Nieznany błąd wysyłki." };
}

/**
 * Sends the fixed Polish test message. Never throws — the caller gets the
 * failure as a value. Both `html` and `text` go out: some clients render only
 * plain text, and carrying both improves spam scoring.
 */
export async function sendTestEmail(to: string): Promise<SendResult> {
  const binding = emailBinding();

  if (!binding) {
    return {
      ok: false,
      // Our own code, not Cloudflare's — the send never happened.
      code: "E_BINDING_MISSING",
      message: "Binding EMAIL nie jest skonfigurowany.",
    };
  }

  try {
    const result = await binding.send({
      to,
      from: SENDER,
      subject: TEST_SUBJECT,
      text: TEST_TEXT,
      html: TEST_HTML,
    });
    return { ok: true, messageId: result.messageId };
  } catch (error) {
    const { code, message } = describeSendError(error);
    // eslint-disable-next-line no-console -- observability is enabled in wrangler.jsonc; this is the only record of a failed send
    console.error(`EMAIL.send failed: ${code} — ${message}`);
    return { ok: false, code, message };
  }
}

/**
 * Sends one owner their voting link (S-04). The message is built by
 * src/lib/voting-link-email.ts; this function only puts it on the wire.
 *
 * Never throws — the fanout walks 70 owners and a throw would abort the run
 * mid-way, which is the one behaviour the resume exists to make unnecessary.
 * The caller gets every failure as a value and records it against that owner.
 *
 * `from` is deliberately not a parameter. wrangler.jsonc's
 * `allowed_sender_addresses` locks the sending identity, so a caller-supplied
 * address would fail at the binding anyway; making it a parameter would only
 * move that failure later and imply a choice that does not exist.
 */
export async function sendVotingLinkEmail(
  to: string,
  message: { subject: string; text: string; html: string },
): Promise<SendResult> {
  const binding = emailBinding();

  if (!binding) {
    return {
      ok: false,
      // Our own code, not Cloudflare's — the send never happened. The fanout
      // records it per owner like any other failure and the resume clears it
      // once the binding comes back.
      code: "E_BINDING_MISSING",
      message: "Binding EMAIL nie jest skonfigurowany.",
    };
  }

  try {
    const result = await binding.send({
      to,
      from: SENDER,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    return { ok: true, messageId: result.messageId };
  } catch (error) {
    const { code, message: reason } = describeSendError(error);
    // The code and nothing else. Not the recipient — an owner's address is
    // personal data — and above all not the message, which carries the bearer
    // token. Workers Logs already records /vote/<token> from the request URL
    // when an owner opens their link (CLAUDE.md); this path must not add a
    // second copy, in bulk, on the administrator's action.
    // eslint-disable-next-line no-console -- observability is enabled in wrangler.jsonc; this is the only record of a failed send
    console.error(`EMAIL.send failed for a voting link: ${code} — ${reason}`);
    return { ok: false, code, message: reason };
  }
}
