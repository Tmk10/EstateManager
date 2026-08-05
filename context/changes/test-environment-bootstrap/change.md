---
change_id: test-environment-bootstrap
title: Stand up the test environment — Vitest, pgTAP, and the CI gates for both
status: implemented
created: 2026-08-05
updated: 2026-08-05
archived_at: null
---

## Notes

`context/foundation/test-plan.md` §4 named a stack and §5 named the gates it would
unlock, but nothing was installed: no `test` script, no Vitest, no pgTAP, and zero
test files anywhere in `src/` or `supabase/`. This change installs the harnesses and
wires the gates.

Scope was set by the product owner at the outset and is deliberately narrower than
§3 Phase 1: **harnesses and gates, with a smoke test at each layer — not the tests
the phases exist to buy.** Phase 1's udział-allocation oracle (Risk #2) and its
real-world registry fixtures (Risk #8 parse half) are not written here, and neither
is Phase 2's contract suite. What lands is the ability to write them, plus proof
that ability works.

Delivered:

- **Vitest 4.1.10** — `vitest.config.ts`, `npm test` / `npm run test:watch`, and
  `src/lib/smoke.test.ts` (3 assertions).
- **pgTAP** — `supabase/tests/database/smoke.test.sql` (4 assertions), `npm run test:db`.
- **CI** — `ci.yml` gains `npm test` in the existing job and a new parallel
  `db-contract` job (`supabase/setup-cli` → `supabase start` → `supabase test db`).
  `deploy.yml` gains `npm test` only.
- **Documents** — `test-plan.md` §3–§6 and the `CLAUDE.md` hard rule that said no
  test runner exists.

### Two things a later reader needs

**`getViteConfig()` does not work in this project, and §4 recommended it.** Astro's
testing guide wires Vitest through `getViteConfig()` from `astro/config`; §4 was
written against that guide on 2026-08-04. It loads `astro.config.mjs`, which
registers the Cloudflare adapter's Vite plugin, and that plugin rejects the
`resolve.external` list Vitest sets on its `ssr` environment — the run dies at
startup before collecting a test. `{ adapter: undefined }` as the second argument
does not help; Astro's inline config merges over the file config rather than
unsetting keys. The config uses `defineConfig` from `vitest/config` plus
`vite-tsconfig-paths`, which reads `@/*` out of `tsconfig.json` so the alias cannot
drift from the one the app builds against. Nothing the current suite needs is lost —
the modules Phase 1 targets are dependency-free by design. §3 Phase 3 is where this
has to be revisited, because an integration test that renders an Astro component
needs the Astro pipeline back.

**pgTAP is created inside the test transaction, not in a migration.** `create
extension if not exists pgtap` runs inside the file's own `begin`/`rollback`, so the
extension never enters `supabase/migrations/` and therefore never reaches production.
That is deliberate: migrations here are applied to production by hand and are
forward-only, so test scaffolding must not enter them. The consequence to keep: every
pgTAP file must carry that line itself.

### Verified

Locally, against the running local stack, node 22.14.0:

- `npm run lint` — clean
- `npm test` — 1 file, 3 tests, pass
- `npm run test:db` — 1 file, 4 tests, pass
- `npm run build` — complete

The `db-contract` CI job is verified by CI, not locally: it proves `supabase start`
applies every migration to a _fresh_ database, which the local stack (long-lived,
hand-made state) cannot demonstrate.
