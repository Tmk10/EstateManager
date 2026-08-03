# Share-Weighted Vote (S-03) — Plan Brief

> Full plan: `context/changes/share-weighted-vote/plan.md`

## What & Why

The owner opens their individual link, reads the uchwała, and casts a final `za` or `przeciw`
weighted by the summed udziały of their lokale. This is the roadmap's **north star**: the only
place the product's central claim — *blokadą jest nieobecność, a nie sprzeciw* — can be confirmed
or refuted. Everything else in the roadmap matters only if this click happens.

## Starting Point

`S-02` built the path up to the click and stopped. `/vote/<token>` already resolves a token through
`public.resolve_voting_link` — `security definer`, one opaque token in, one narrow row out, zero
rows for an unknown token and a draft resolution alike — and renders the uchwała plus the reader's
own name, lokale and udział. Where the buttons belong, it renders *"Oddawanie głosów nie jest
jeszcze dostępne"*. Nothing writes a vote, and nothing can: `anon` is denied on all four operations
on every table, and a policy cannot see a bearer token.

Two gaps came out of the `S-02` implementation review marked **blocking** for this slice: nothing
refuses reassigning a live token to another owner, and nothing refuses deleting an open resolution.

## Desired End State

An owner with no account and no JavaScript presses `Za` or `Przeciw`, confirms on a second screen
that names their choice and warns the vote is final, and lands on a receipt showing which way they
voted, when, and with what weight. Returning to the link later shows that same receipt. A second
cast is impossible. The administrator sees how many owners have voted out of how many hold links.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Write path for an unauthenticated voter | One `security definer` function, `cast_vote(token, choice)` | The only alternative makes the browser post its own `owner_id` and the bearer token as a column — worse than what `S-02` already rejected. | Plan |
| Vote weight | Snapshotted onto the vote row | `S-06` must show *which* udziały made a result, which is a record, not a reconstruction. | Plan |
| `public.votes` RLS | `select` true for `authenticated`; **insert/update/delete false for both roles** | Makes "głos jest ostateczny" a property of the database, and closes the review's worry that any admin account could cast any owner's vote. | Plan |
| Audit trail depth | link, owner, building, choice, weight, timestamp — no request metadata | Enough to reconstruct the result; IP would be personal data of someone who never got a privacy notice. | Plan |
| Hardening scope | The two blocking prerequisites **plus** vote immutability | `cast_vote` bypasses RLS, so only a trigger binds the write path itself. | Roadmap + Plan |
| Second visit | The uchwała plus a receipt of their own vote | One design answers both FR-005's confirmation promise and the open second-visit question. | User |
| Casting | Two-step confirm, same page, no JS | A mis-tap in a mail client's in-app browser is unrecoverable and disenfranchises a real owner. | User |
| Headers (finding F4) | Set `Cache-Control` / `X-Robots-Tag` / `Referrer-Policy`, before the view branch | `S-02` skipped this knowingly; the page now renders a receipt on shared devices, so the stakes moved. | User |
| Error model | Neutral before the token resolves, specific after | Keeps the token space unprobeable while giving a real owner an actionable sentence. | Plan |
| Administrator UI | A bare count of owners who voted | Visible evidence votes are landing; labelled as people, not udziały, so `S-05` replaces rather than argues with it. | User |
| Verification | Local end-to-end, then one real vote on production | workerd and Node diverge exactly on these interfaces, and only production exercises the `anon` grant. | User |

## Scope

**In scope:** two hardening triggers (`EM008`, `EM009`); `public.votes` with policies and an
immutability trigger (`EM010`); `cast_vote`; `resolve_voting_link` widened with the reader's own
vote; the three-state vote page with security headers; `POST /api/vote/[token]`; a vote count on
the admin resolution page; regenerated `database.types.ts`; production migration push and one real
vote.

**Out of scope:** the tally, the 50% threshold and the `passed`/`rejected` statuses (`S-05`); the
e-mail fanout (`S-04`); any per-owner voted/choice breakdown (`S-06`); vote withdrawal; the v2 roles
model; moving the token out of the URL path.

## Architecture / Approach

```
/vote/<token>            GET   resolve_voting_link  ──► buttons | confirm | receipt
   └─ ?wybor=za          GET   (no side effect)
        └─ POST /api/vote/<token> ──► cast_vote(token, choice) ──► redirect back
```

`cast_vote` is the project's **first `security definer` write**. CLAUDE.md's no-definer rule exists
to protect the registry's single write path, where `import_building_units` stays `invoker` so an
invisible building raises `EM001`; here there is no caller identity to preserve, because `anon` is
denied on every table by design. The client sends a token and a choice and never names an owner, a
resolution or a weight — the function resolves and sums everything itself.

Finality is enforced three times, at three different callers: a unique constraint on
`(resolution_id, owner_id)`, policies denying writes to both roles, and a trigger refusing `update`
and `delete` — the last being the only one `cast_vote` itself is subject to.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Schema | Hardening triggers, `public.votes`, `cast_vote`, widened read contract, types | The first definer write — the migration has to argue the exception, not assume it |
| 2. Voting path | Three-state page with headers, `POST /api/vote/[token]` | A new branch that answers differently before a token resolves turns the token space into something worth probing |
| 3. Admin count | `Zagłosowało N z M właścicieli` | A people-count on the outcome's page invites being read as the tally |
| 4. Production | Migrations pushed, deployed, one real vote | Migrations must land before the code; forward-only, no rollback |

**Prerequisites:** `S-02` (done); a local Supabase stack (Docker, ~7 GB RAM); a linked checkout for
`db push`; tokens read by hand from the database, since `S-04` does not exist.
**Estimated effort:** ~3–4 sessions across 4 phases.

## Open Risks & Assumptions

- **The token remains the whole identity of a voter** (PRD Open Question no. 1, unresolved). This
  slice makes possession of a token capable of casting a binding vote, which raises the stakes on
  every earlier decision about how tokens travel.
- **Workers Logs persists every token for 7 days** (finding F3, accepted as risk). Unchanged here
  and unchangeable without moving the secret out of the URL path.
- **`voting_links_*_authenticated` is still `using (true)`** — every administrator account reaches
  every building's rows. Carried forward from `S-02`; makes the v2 roles model a hard prerequisite
  for a **second** administrator account, not a nice-to-have.
- **`share_bps` is snapshotted and becomes authoritative.** If the registry ever gains an edit path,
  the snapshot and the live sum can disagree and the snapshot must win.
- **Nothing in CI applies migrations** (residual **G14**). Getting the push order wrong serves code
  querying a table that does not exist.

## Success Criteria (Summary)

- An owner with no account and no JavaScript casts one weighted vote and sees it confirmed —
  locally and on production.
- The vote cannot be changed, withdrawn, duplicated, or cast by anyone but the link's holder — and
  each of those is refused by the database, not by the UI.
- Every failure the unauthenticated path can reach before a token resolves looks identical, headers
  included.
