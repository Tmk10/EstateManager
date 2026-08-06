import { expect, test, type Page } from "@playwright/test";

import { createVotingToken } from "@/lib/voting-token";

import { createVotingScenario, purgeBuilding, uniqueBuildingName } from "./fixtures/db";

/**
 * Risk #7, `context/foundation/test-plan.md` §2 -- a hit and a miss on a voting link must not
 * become distinguishable, or the link turns into an oracle for "is this address a voter".
 *
 * Anyone can put any string after `/vote/`. If an unknown token, a token whose uchwała is
 * still a draft, and a real token answer even slightly differently -- a status, a header, a
 * redirect, a shorter page -- then the token space is worth probing, and what leaks is the
 * membership of a building's electorate.
 *
 * §2 names the anti-pattern for this risk by name: "asserting only the body -- a test blind
 * to headers and status is blind to the actual leak". A browser test reads the DOM by
 * default, which walks straight into it. So the comparison below is made on the *response*:
 * `page.goto` hands back status, headers and the redirect chain, and the assertions run over
 * all three before anything looks at rendered markup.
 *
 * The page sets its three headers before it resolves the token, precisely so they cannot
 * differ between branches (`src/pages/vote/[token].astro`, property 1). This test is what
 * would notice if someone moved them inside the resolved branch.
 *
 * Modelled on `seed.spec.ts`.
 */

/**
 * The reader of a voting link has no session -- it is the one route in the product reachable
 * without one. The admin `storageState` every other spec inherits would send a cookie no real
 * voter has, and would run the RPC as `authenticated` rather than `anon`.
 */
test.use({ storageState: { cookies: [], origins: [] } });

/** Everything a reader can observe without reading the page body. */
const OBSERVABLE_HEADERS = ["cache-control", "x-robots-tag", "referrer-policy"] as const;

interface Probe {
  status: number;
  headers: Record<string, string>;
  redirected: boolean;
  body: string;
}

async function probe(page: Page, path: string): Promise<Probe> {
  const response = await page.goto(path);
  if (!response) {
    throw new Error(`No response for ${path}`);
  }

  const headers = response.headers();
  return {
    status: response.status(),
    // Read as "absent" rather than skipped: a header that disappears on one branch only is
    // exactly the kind of difference this test exists to catch.
    headers: Object.fromEntries(OBSERVABLE_HEADERS.map((name) => [name, headers[name] ?? "<absent>"])),
    redirected: response.request().redirectedFrom() !== null,
    body: await response.text(),
  };
}

let buildingId: string | null = null;

test.afterEach(async () => {
  if (buildingId) {
    await purgeBuilding(buildingId);
    buildingId = null;
  }
});

test("an unknown token, a draft uchwała's token and a forged choice are indistinguishable from each other", async ({
  page,
}) => {
  const scenario = await createVotingScenario(uniqueBuildingName("vote-oracle"));
  buildingId = scenario.buildingId;

  const hit = await probe(page, `/vote/${scenario.openToken}`);

  const misses: Record<string, Probe> = {
    // Well-formed and never issued: the shape a prober would actually send.
    unknown: await probe(page, `/vote/${createVotingToken()}`),
    // Really stored, really this building's, and still resolves to nothing because
    // resolve_voting_link filters `draft`. The hardest of the three to keep silent, since
    // the row exists and the lookup succeeds.
    draft: await probe(page, `/vote/${scenario.draftToken}`),
    // A real token cut short. The page does no shape pre-validation on purpose -- rejecting
    // before lookup would answer faster than looking up, which is measurable.
    truncated: await probe(page, `/vote/${scenario.openToken.slice(0, 20)}`),
    // A forged choice on a token that resolves to nothing: `?wybor` is caller-controlled and
    // must not move the answer.
    forgedChoice: await probe(page, `/vote/${createVotingToken()}?wybor=za`),
  };

  // The control, and it comes first: every assertion below says a miss looks like the hit, so
  // an application that neutral-paged *everything* would satisfy all of them while being
  // entirely broken. This is what makes the rest mean something.
  expect(hit.status).toBe(200);
  expect(hit.redirected).toBe(false);
  expect(hit.body).toContain(scenario.resolutionTitle);
  expect(hit.body).toContain(scenario.ownerFullName);

  for (const [label, miss] of Object.entries(misses)) {
    expect(miss.status, `${label}: status differs from a hit`).toBe(hit.status);
    expect(miss.headers, `${label}: observable headers differ from a hit`).toEqual(hit.headers);
    expect(miss.redirected, `${label}: redirected where a hit did not`).toBe(hit.redirected);
  }

  // The misses must also be identical to *each other*, byte for byte. Matching the hit on
  // status and headers is not enough: a neutral page that named which kind of miss it was --
  // or was merely a different length -- would still answer the prober's question.
  const [[referenceLabel, reference], ...others] = Object.entries(misses);
  for (const [label, miss] of others) {
    expect(miss.body, `${label}: neutral page differs from ${referenceLabel}`).toBe(reference.body);
  }

  // No branch may echo a token back. The neutral page has no resolved view to hang one on,
  // and this is what keeps it that way.
  for (const [label, miss] of Object.entries(misses)) {
    expect(miss.body, `${label}: echoed the open token`).not.toContain(scenario.openToken);
    expect(miss.body, `${label}: echoed the draft token`).not.toContain(scenario.draftToken);
  }

  await page.goto(`/vote/${createVotingToken()}`);
  await expect(page.getByRole("heading", { name: "Nie znaleziono głosowania" })).toBeVisible();

  // The other half of "a forged choice changes nothing": on a token that *does* resolve, an
  // unrecognised `?wybor` has to fall through to the buttons exactly as a missing one does.
  // Erroring here would give the page an answer that depends on something other than whether
  // the token resolved -- which is the leak, arriving by the back door.
  await page.goto(`/vote/${scenario.openToken}?wybor=nieznany`);
  await expect(page.getByRole("button", { name: "Za", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Przeciw", exact: true })).toBeVisible();
});
