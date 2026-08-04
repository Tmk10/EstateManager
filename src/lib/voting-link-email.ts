/**
 * The message one owner receives, and the Polish sentence an administrator reads when it
 * fails to arrive (S-04).
 *
 * No dependencies, no Astro, no Supabase, and deliberately no import of src/lib/email.ts --
 * that module imports `cloudflare:workers`, and the resolution page renders
 * describeSendFailure per row, so importing it there would pull a Workers-only module into
 * a component's import graph. The split is: this module decides WHAT is said, email.ts
 * decides HOW it is sent.
 *
 * Being dependency-free also makes it executable on its own with
 * `node --experimental-strip-types`, which in a repository with no test runner is the only
 * way the escaping below gets exercised. Keep it that way.
 */

export interface VotingLinkMessageInput {
  buildingName: string;
  resolutionNumber: string;
  resolutionTitle: string;
  /** Administrator-authored free text. Untrusted on the HTML path -- see escapeHtml. */
  resolutionBody: string;
  ownerFullName: string;
  /** Absolute `${origin}/vote/${token}`. The ONLY URL that may appear in the message. */
  voteUrl: string;
}

export interface VotingLinkMessage {
  subject: string;
  text: string;
  html: string;
}

/**
 * The five characters that change meaning inside HTML. `&` must be replaced first or it
 * would re-escape the ampersands the later replacements introduce.
 *
 * This is the first place in the project where user-supplied text is rendered somewhere
 * Astro's own escaping does not reach: a resolution body goes from an administrator's
 * textarea into someone else's mail client. `'` and `"` are included because interpolated
 * values also land inside attributes (the href below), where they would otherwise close
 * the attribute early.
 */
function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Escaped first, marked up second. Reversing that order would turn the `<p>` and `<br>`
 * this function emits into `&lt;p&gt;`, and -- far worse -- would leave a body containing
 * markup live.
 *
 * A blank line starts a new paragraph; a single newline is a line break. Anything else
 * about the body's shape is preserved as written, because a resolution's wording is the
 * legal object here and not something to reflow.
 */
function bodyToHtmlParagraphs(body: string): string {
  return escapeHtml(body)
    .split(/\n[ \t]*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0)
    .map((paragraph) => `<p>${paragraph.replaceAll("\n", "<br>")}</p>`)
    .join("\n");
}

/**
 * Builds the message for exactly one owner.
 *
 * What it carries: who it is addressed to, which building, which resolution, the FULL
 * resolution text, and the link. What it must never carry: another owner's name, anyone's
 * share, anyone's address, or a second URL. The NFR that an owner learns nothing about
 * other owners governs the message as much as it governs /vote/<token>.
 *
 * The full text is embedded rather than summarised, and that is safe here for a reason
 * specific to this slice: EM006 freezes number, title and body the moment the vote opens,
 * and this fanout only ever runs on an open resolution. The text in the message therefore
 * cannot drift from the text on the voting page -- the usual objection to duplicating
 * content into mail does not apply.
 *
 * The subject names the resolution AND the building on purpose. The PRD's secondary
 * persona is niezainteresowany i nieswiadomy: someone who did not know a vote was
 * happening. To that reader a one-line message with a bare link is indistinguishable from
 * phishing, and the subject is the only part they are guaranteed to see.
 */
export function buildVotingLinkMessage(input: VotingLinkMessageInput): VotingLinkMessage {
  const { buildingName, resolutionNumber, resolutionTitle, resolutionBody, ownerFullName, voteUrl } = input;

  const subject = `Głosowanie nad uchwałą nr ${resolutionNumber} — ${buildingName}`;

  const text = `Dzień dobry,

Adresat: ${ownerFullName}
Dotyczy: ${buildingName}

Rozpoczęło się głosowanie nad uchwałą nr ${resolutionNumber}: ${resolutionTitle}.

Treść uchwały:

${resolutionBody}

Aby oddać głos, otwórz poniższy link. Jest on przypisany wyłącznie do adresata
tej wiadomości i nie należy go nikomu przekazywać:

${voteUrl}

Głos można oddać tylko raz i jest on ostateczny.

Wiadomość wysłana automatycznie przez system EstateManager. Prosimy na nią nie odpowiadać.`;

  // Every interpolated value is escaped -- the body above all, but the name and the
  // building name are registry data an administrator typed too, and voteUrl sits inside an
  // attribute. A token is [A-Za-z0-9_-]{43} so escaping it changes nothing today; it is
  // escaped anyway, because "changes nothing today" is not a property to build on.
  const html = `<p>Dzień dobry,</p>
<p>Adresat: <strong>${escapeHtml(ownerFullName)}</strong><br>
Dotyczy: <strong>${escapeHtml(buildingName)}</strong></p>
<p>Rozpoczęło się głosowanie nad uchwałą nr <strong>${escapeHtml(resolutionNumber)}</strong>:
${escapeHtml(resolutionTitle)}.</p>
<p><strong>Treść uchwały:</strong></p>
${bodyToHtmlParagraphs(resolutionBody)}
<p>Aby oddać głos, otwórz poniższy link. Jest on przypisany wyłącznie do adresata
tej wiadomości i nie należy go nikomu przekazywać:</p>
<p><a href="${escapeHtml(voteUrl)}">${escapeHtml(voteUrl)}</a></p>
<p>Głos można oddać tylko raz i jest on ostateczny.</p>
<p>Wiadomość wysłana automatycznie przez system EstateManager. Prosimy na nią nie
odpowiadać.</p>`;

  return { subject, text, html };
}

/**
 * Provider error code -> a sentence telling the administrator what to do about it.
 *
 * Only the codes reachable from THIS call site are mapped. The header codes
 * (E_HEADER_NOT_ALLOWED, E_HEADERS_TOO_MANY, …) are absent on purpose: the fanout sends no
 * custom headers, so they cannot occur, and inventing Polish for an unreachable code would
 * put a confident sentence in front of an administrator that nobody has ever seen the
 * system produce. The fallback exists for exactly those -- it names the raw code, which is
 * something they can quote in a bug report.
 *
 * E_RECIPIENT_NOT_ALLOWED and E_TOO_MANY_RECIPIENTS are likewise unmapped: the first
 * applies to sandbox-mode destination allowlists this account does not use, the second to
 * a >50-recipient message, and the fanout sends one recipient at a time.
 */
const FAILURE_SENTENCES: Record<string, string> = {
  // Ours, not Cloudflare's -- the send never happened.
  E_BINDING_MISSING:
    "Kanał pocztowy nie jest skonfigurowany — wiadomość nie została wysłana. Zgłoś to administratorowi systemu i spróbuj ponownie.",

  // Configuration, not the owner's address.
  E_SENDER_NOT_VERIFIED:
    "Domena nadawcza nie jest zweryfikowana w Cloudflare. To błąd konfiguracji, nie adresu właściciela.",
  E_SENDER_DOMAIN_NOT_AVAILABLE:
    "Domena nadawcza jest niedostępna do wysyłki. To błąd konfiguracji, nie adresu właściciela.",

  // The one failure that is about this specific address and that resending cannot fix.
  E_RECIPIENT_SUPPRESSED:
    "Ten adres został zablokowany przez dostawcę (wcześniejsze odbicie lub zgłoszenie spamu). Skontaktuj się z tym właścicielem poza systemem.",

  // Transient -- pressing the button again is the remedy.
  E_RATE_LIMIT_EXCEEDED: "Przekroczono chwilowy limit wysyłki. Odczekaj chwilę i naciśnij przycisk ponownie.",
  E_INTERNAL_SERVER_ERROR: "Chwilowy błąd po stronie dostawcy poczty. Naciśnij przycisk ponownie.",

  // Transient, but on a longer clock.
  E_DAILY_LIMIT_EXCEEDED:
    "Wyczerpano dzienny limit wysyłanych wiadomości. Dokończ rozsyłkę jutro — wysłane linki pozostają ważne.",

  E_DELIVERY_FAILED: "Serwer odbiorcy odrzucił wiadomość. Sprawdź poprawność adresu e-mail tego właściciela.",

  // A malformed request is a defect in this application, and saying so is more useful than
  // implying the administrator did something wrong.
  E_VALIDATION_ERROR: "Wiadomość została odrzucona jako nieprawidłowa. To błąd w aplikacji — zgłoś go.",
  E_FIELD_MISSING: "W żądaniu zabrakło wymaganego pola. To błąd w aplikacji — zgłoś go.",

  // What describeSendError in src/lib/email.ts returns for a throw with no string .code.
  E_UNKNOWN:
    "Wysyłka nie powiodła się z nieznanego powodu. Naciśnij przycisk ponownie; jeśli błąd się powtórzy, zgłoś go.",
};

/**
 * Never throws and never returns an empty string: an unmapped code still produces a
 * sentence, and that sentence contains the code. Showing a raw code is a small failure of
 * polish; showing nothing, or a wrong sentence, is a failure of truth.
 */
export function describeSendFailure(code: string): string {
  return (
    FAILURE_SENTENCES[code] ??
    `Wysyłka nie powiodła się (kod ${code}). Naciśnij przycisk ponownie; jeśli błąd się powtórzy, zgłoś ten kod.`
  );
}
