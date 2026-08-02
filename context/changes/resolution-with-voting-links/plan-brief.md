# Resolution with Voting Links — Plan Brief

> Full plan: `context/changes/resolution-with-voting-links/plan.md`

## What & Why

Roadmap slice `S-02`. An administrator writes a resolution for a building with an imported
registry, reviews it as a draft, opens the vote, and from that moment holds one individual
voting link **per owner** — readable on screen and passable by hand. It exists as its own
slice so the guiding star `S-03` can be tested on a single manually handed link, before the
mail channel is involved.

The link is the product's only identity mechanism (PRD `## Open Questions` no. 1 is still
open), so this is where the guardrail _"nikt spoza rejestru nie oddaje głosu"_ gets its
actual strength.

## Starting Point

`public.buildings`, `public.owners` and `public.units` exist with 8 RLS policies each —
`authenticated` unconditional, `anon` denied on every operation. `owners` is already one row
per **person**, keyed by e-mail; `units.share_bps` are integer basis points totalling exactly
10000 per building, asserted at commit. Nothing in the schema knows about resolutions,
statuses, or any caller without a session.

## Desired End State

An administrator on the live Worker creates a resolution (number, title, body) as a draft,
corrects it, presses _Uruchom głosowanie_, and sees a table of owner → link: name, e-mail,
that owner's units, their summed share, the full URL and a copy button. Pasting the URL into
a private window shows the resolution and the reader's own weight — with no session, and with
no way to tell a wrong token from one that does not exist.

## Key Decisions Made

| Decision                    | Choice                                              | Why (1 sentence)                                                                                                 |
| --------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Who holds a link            | **One per owner**, not per unit; shares summed      | An owner with two units should vote once and get one message — and `owners` is already one row per person.       |
| Token shape                 | 32 random bytes, base64url, stored in plain text    | The administrator must be able to re-read and hand over the link, which a stored hash forbids.                   |
| Unauthenticated read        | One `security definer` function taking the token    | A policy cannot know the token, so the alternative is `using (true)` on a table of every secret in the building. |
| Lifecycle                   | Two steps: draft → open                             | A typo in a resolution people vote on irreversibly is worth one extra click to avoid.                            |
| Link permanence             | Permanent; status answers whether voting is open    | `FR-007` gives voting no end date, so there is no natural expiry to invent.                                      |
| Owners without e-mail       | Get no token                                        | Already the schema's stated position — they lose the link, not their weight in the tally.                        |
| Resolution fields           | Number (required, unique per building), title, body | The number is what ties the record to the community's paper trail.                                               |
| Opening the vote            | Two application queries — links first, status last  | Chosen over an RPC; the ordering makes a partial failure harmless and re-runnable.                               |
| `authenticated` RLS scoping | Still unscoped, and the migration says why          | The token identifies an owner, not a user, so v1 still has no user↔building binding to scope to.                 |
| PRD conflict                | Fixed in this change, first phase                   | `S-03`/`S-05`/`S-06` read the PRD, so the per-owner rule has to live there, not only here.                       |

## Scope

**In scope:** two tables + 16 RLS policies + content-freeze trigger + `resolve_voting_link`;
draft create/edit; opening the vote; owner → link table with copy; public `/vote/<token>`
read-only page; PRD and roadmap correction; production deploy and walkthrough.

**Out of scope:** casting a vote (`S-03`), e-mail fan-out (`S-04`), any tally or threshold
(`S-05`), closing a resolution, deleting drafts, editing after launch, exporting links,
building-scoped `authenticated` policies.

## Architecture / Approach

`resolutions` (draft|open, number unique per building) ← `voting_links` (token, one row per
resolution × owner). Both carry `building_id` purely to hold **composite foreign keys** into
`resolutions (id, building_id)` and `owners (id, building_id)`, which makes a link pairing an
owner with another building's resolution unrepresentable rather than merely discouraged —
the same trick `units_owner_same_building_fkey` already uses.

The administrator's side rides the existing form → endpoint → `redirect(?error=)` pattern.
The unauthenticated side has exactly one door: `resolve_voting_link(text)`, `security definer`
with `execute` revoked from `public` and granted to `anon`, whose fixed return list _is_ the
visibility contract — no e-mail, no other owner, no per-unit area.

## Phases at a Glance

| Phase                       | What it delivers                                  | Key risk                                                                                 |
| --------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 1. PRD & roadmap            | Foundation documents say "per owner"              | Half-corrected documents leave `S-05` computing the wrong rule                           |
| 2. Schema & access contract | Two tables, 16 policies, freeze trigger, resolver | The `definer` function is a deliberate RLS bypass — its return list is the whole barrier |
| 3. Administrator's path     | Draft, edit, launch, owner → link table           | Launch is two queries; wrong order leaves an open vote with missing links                |
| 4. `/vote/<token>`          | Public read-only page with no session             | Leaking the difference between a wrong token and a missing one                           |
| 5. Production & record      | Migration pushed, PR merged, path walked live     | Migration must land **before** the deploy — nothing in CI applies it                     |

**Prerequisites:** `S-01b` done (registry imported); linked Supabase checkout for
`db push`; local stack up for `npm run db:types`.
**Estimated effort:** ~3–4 sessions across 5 phases; Phase 2 is the heaviest.

## Open Risks & Assumptions

- **The token is a bearer secret in a URL.** Anyone who receives a forwarded link can vote as
  that owner. PRD accepts this ("równoważne twierdzeniu, że ktoś nie podpisał się pod
  uchwałą"), but it is the risk this slice creates.
- **Two queries instead of one transaction** (user's call, against the recommendation).
  Mitigated by ordering and by `unique (resolution_id, owner_id)`, not eliminated.
- **Plain-text tokens sit next to owner personal data**, so a database read is a voting
  compromise as well as a privacy one.
- **`authenticated` is still every user.** Any signed-in account reads every building's links.
  Unchanged from `S-01`/`S-01b`, and blocked on the v2 roles model.
- **No test runner.** Everything security-shaped is proven through PostgREST probes and
  manual steps, not automated tests.

## Success Criteria (Summary)

- An administrator can create a resolution, open the vote, and read one link per owner —
  pressing the launch button twice changes nothing.
- A link opened with no session shows the resolution and the reader's own weight; a made-up
  token, a foreign token and a draft's token are indistinguishable from each other.
- The whole path is demonstrated on the live Worker, not only locally.
