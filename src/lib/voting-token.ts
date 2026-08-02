/**
 * The bearer secret behind a voting link.
 *
 * PRD `## Open Questions` no. 1 is still open -- whether an electronically adopted
 * resolution is legally valid, and what identification it requires. Until it closes,
 * possession of this token IS the voter's identity, which makes it the strength of the
 * guardrail "nikt spoza rejestru nie oddaje glosu". Two consequences follow:
 *
 *   1. It is generated from a CSPRNG, never from anything derived (a uuid of the owner, a
 *      hash of their e-mail, a counter). 32 random bytes is 256 bits -- unguessable by any
 *      margin that matters to a building of 70 flats.
 *   2. It travels in a URL path. That means the page it lands on must carry no outbound
 *      links (a Referer header would hand the token to a third party), and the token must
 *      never reach a log line or an error message.
 *
 * Dependency-free on purpose, like src/lib/shares.ts and src/lib/units-csv.ts: with no
 * imports it can be executed directly with `node --experimental-strip-types`, which is the
 * only way encoding gets exercised in a project with no test runner.
 */

/** 256 bits. Not a parameter -- see createVotingToken. */
const TOKEN_BYTES = 32;

/**
 * Generates one voting token: 43 URL-safe characters, matching the database's
 * `voting_links_token_format` check (`^[A-Za-z0-9_-]{43}$`).
 *
 * 32 bytes base64-encode to 44 characters of which the last is padding; base64url drops
 * the padding, leaving 43. The two substitutions (`+` -> `-`, `/` -> `_`) are what make the
 * value safe in a URL path without escaping.
 *
 * It takes no arguments, and it must never grow a length or an alphabet parameter: a
 * caller-tunable secret length is how a 4-byte token eventually ships.
 */
export function createVotingToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);

  // btoa wants one character per byte. Built by hand rather than with
  // String.fromCharCode(...bytes) because spreading an array into arguments is a habit that
  // stops working on large inputs, and 32 bytes is not a reason to learn it wrongly.
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
