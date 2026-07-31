---
bootstrapped_at: 2026-07-31T22:35:06Z
starter_id: 10x-astro-starter
starter_name: "10x Astro Starter (Astro + Supabase + Cloudflare)"
project_name: estate-manager
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

Verbatim frontmatter from `context/foundation/tech-stack.md`:

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: estate-manager
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: true
```

### Why this stack

A solo developer shipping a share-weighted resolution-voting MVP in five
after-hours weeks needs a pinned, opinionated starter rather than an assembled
one. Astro+Supabase+Cloudflare is the recommended default for `(web, js)` and
clears all four agent-friendly gates. The product needs exactly two surfaces:
an authenticated administrator area (registry import, resolution creation, live
share tally) and an unauthenticated tokenized page an owner opens once from an
e-mail link — both server-rendered pages plus API routes, no client-side app.
Supabase supplies Postgres, the admin e-mail/password login, and file-import
storage out of the box; the threshold rule is arithmetic over a small table, so
explicit TypeScript and Zod contracts at the boundary are the whole data story.
The PRD's `large` user scale is read-count, not write-load, so the edge deploy
is sufficient. Two PRD requirements fall outside the starter and are owned
explicitly: transactional e-mail for individual voting links (FR-002, FR-004)
via a mail API called from an Astro API route, and the limited reminder series
(FR-010, nice-to-have) via Cloudflare Cron Triggers or Supabase `pg_cron`.

## Pre-scaffold verification

| Signal      | Value                                                          | Severity | Notes                                                                              |
| ----------- | -------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------- |
| npm package | not run                                                          | n/a      | `cmd_template` starts with `git clone`; no `create-*` CLI to resolve                |
| GitHub repo | `przeprogramowani/10x-astro-starter` last pushed 2026-05-17      | fresh    | from `card.docs_url`; ~2.5 months old, within the 3-month fresh threshold            |

Tooling note: `gh` is not installed on this machine. The repo recency signal was
obtained from the unauthenticated GitHub REST API via `curl` instead, which
returns the same `pushed_at` field. No warning was surfaced to the user because
the resolved severity was `fresh`.

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone
**Exit code**: 0
**Files moved**: 19
**Conflicts (.scaffold siblings)**: `CLAUDE.md` → `CLAUDE.md.scaffold`
**.gitignore handling**: moved silently (absent in cwd, so no append-merge was needed)
**.bootstrap-scaffold cleanup**: deleted
**Upstream `.git/` removal**: `.bootstrap-scaffold/.git/` deleted before move-up, so the starter's history did not leak into this project

### File-by-file move log

| Entry                | Resolution                                    |
| -------------------- | --------------------------------------------- |
| `astro.config.mjs`   | moved                                         |
| `CLAUDE.md`          | conflict → `CLAUDE.md.scaffold` (existing won) |
| `components.json`    | moved                                         |
| `eslint.config.js`   | moved                                         |
| `node_modules/`      | moved                                         |
| `package-lock.json`  | moved                                         |
| `package.json`       | moved                                         |
| `public/`            | moved                                         |
| `README.md`          | moved                                         |
| `src/`               | moved                                         |
| `supabase/`          | moved                                         |
| `tsconfig.json`      | moved                                         |
| `wrangler.jsonc`     | moved                                         |
| `.env.example`       | moved                                         |
| `.github/`           | moved                                         |
| `.gitignore`         | moved                                         |
| `.husky/`            | moved                                         |
| `.nvmrc`             | moved                                         |
| `.prettierrc.json`   | moved                                         |
| `.vscode/`           | moved                                         |

`context/` was untouched — the starter ships no `context/` directory, so the
drop rule never had to fire. `.claude/` in cwd was likewise untouched (no
counterpart in the scaffold). The temp directory was empty after the move and
was removed cleanly; no leftover paths.

## Post-scaffold audit

**Tool**: `npm audit --json`
**Summary**: 1 CRITICAL, 12 HIGH, 7 MODERATE, 2 LOW (22 total)
**Direct vs transitive**: 0/1/2/0 direct of total 1/12/7/2. Dependency tree: 449 prod, 316 dev, 131 optional, 895 total.
**Audit tool exit code**: 1 (informational only — non-zero exit is expected when findings exist and does not halt bootstrapper)
**Fixes available**: every one of the 22 findings reports `fixAvailable: true`.

#### CRITICAL findings

- **`tar`** (range `<=7.5.20`) — transitive, reached via the `supabase` CLI dependency.
  Six advisories bundled: PAX size override applied to intermediary GNU long-name/long-link
  headers causing a tar-parser interpretation differential (file smuggling); process crash via
  PAX numeric path type confusion; decompression/parse DoS via unlimited input; infinite loop
  in archive replace on a negative tar entry size; uncaught-exception DoS via NUL byte in PAX
  path/linkpath records; uncontrolled recursion in `mapHas`/`filesFilter` allowing an
  uncatchable stack-overflow DoS via a crafted long-path tar. Fix available.

#### HIGH findings

- **`astro`** (range `<=7.0.9`) — **DIRECT dependency.** Reflected XSS via unescaped slot name;
  Host-header SSRF in prerendered error-page fetch; XSS via unescaped attribute names in spread
  props; reflected XSS via unescaped View Transition animation properties; XSS via unescaped
  spread attribute names in `renderHTMLElement` (incomplete fix for CVE-2026-54298); XSS via
  unescaped `transition:*` directive values on hydrated islands. Also pulls `esbuild` and
  `sharp` advisories. Fix available.
- **`brace-expansion`** (`<=1.1.16 || 3.0.0 - 5.0.7`) — transitive. DoS via exponential-time
  expansion of consecutive non-expanding `{}` groups; DoS via unbounded expansion length causing
  an OOM process crash. Fix available.
- **`devalue`** (`5.6.3 - 5.8.0`) — transitive. DoS via sparse-array deserialization. Fix available.
- **`fast-uri`** (`3.0.0 - 3.1.3`) — transitive. Host confusion via literal backslash authority
  delimiter; host confusion via failed IDN canonicalization. Fix available.
- **`js-yaml`** (`4.0.0 - 4.2.0`) — transitive. Quadratic-complexity DoS in merge-key handling via
  repeated aliases; YAML merge-key chains forcing quadratic CPU consumption. Fix available.
- **`miniflare`** (`<=0.0.0-fff677e35 || 3.20250204.0 - 4.20260721.0`) — transitive, via
  `sharp`/`undici`/`ws`. Fix available.
- **`postcss`** (`<=8.5.17`) — transitive. Path traversal in previous-source-map auto-loading
  (`sourceMappingURL`) leading to arbitrary `.map` file disclosure. Fix available.
- **`sharp`** (`<0.35.0`) — transitive. Inherited libvips vulnerabilities: CVE-2026-33327,
  CVE-2026-33328, CVE-2026-35590, CVE-2026-35591. Fix available.
- **`svgo`** (`4.0.0 - 4.0.1`) — transitive. `removeScripts` plugin leaves some executable scripts
  intact. Fix available.
- **`undici`** (`7.0.0 - 7.27.2`) — transitive. TLS certificate-validation bypass via dropped
  `requestTls` in SOCKS5 ProxyAgent; HTTP header injection via `Set-Cookie` percent-decoding;
  WebSocket DoS via fragment-count bypass; cross-origin request routing via SOCKS5 proxy pool
  reuse; HTTP response-queue poisoning via keep-alive socket reuse; `Set-Cookie` SameSite
  downgrade via permissive substring matching; cross-user information disclosure via shared-cache
  whitespace bypass. Fix available.
- **`vite`** (`7.0.0 - 7.3.3`) — transitive. `launch-editor` NTLMv2 hash disclosure via UNC path
  handling on Windows; `server.fs.deny` bypass on Windows alternate paths. Fix available.
- **`ws`** (`8.0.0 - 8.20.1`) — transitive. Uninitialized memory disclosure; memory-exhaustion DoS
  from tiny fragments and data chunks. Fix available.

#### MODERATE findings

- **`supabase`** (`1.1.6 - 2.98.2`) — **DIRECT dependency.** Inherits the `tar` CRITICAL chain above.
- **`wrangler`** (`<=0.0.0-kickoff-demo || 3.108.0 - 4.101.0`) — **DIRECT dependency.** Via
  `esbuild` and `miniflare`.
- **`@astrojs/language-server`** (`2.14.0 - 2.16.10`) — transitive, via `volar-service-yaml`.
- **`@cloudflare/vite-plugin`** (`<=0.0.0-fff677e35 || 0.0.7 - 1.41.0`) — transitive, via
  `miniflare`/`wrangler`/`ws`.
- **`volar-service-yaml`** (`<=0.0.70`) — transitive, via `yaml-language-server`.
- **`yaml`** (`2.0.0 - 2.8.2`) — transitive. Stack overflow via deeply nested YAML collections.
- **`yaml-language-server`** (`1.11.1-08d5f7b.0 - 1.21.1-f1f5a94.0 || 1.22.1-0ae5603.0 - 1.22.1-fc5f874.0`)
  — transitive, via `yaml`.

#### LOW / INFO findings

- **`@babel/core`** (`<=7.29.0`) — transitive. Arbitrary file read via `sourceMappingURL` comment.
- **`esbuild`** (`0.27.3 - 0.28.0`) — transitive. Arbitrary file read when running the development
  server on Windows.

### Reading these findings

Three of the 22 findings sit on packages this project chose explicitly (`astro`,
`supabase`, `wrangler`); the remaining 19 arrive through the dependency graph and
are advisory until the upstream maintainer ships a fix — though in this tree every
finding already reports an available fix. Several of the transitive findings
(`vite`, `esbuild`, `@babel/core`, `miniflare`, the language-server chain) affect
dev-time or Windows-only paths rather than the deployed Cloudflare edge runtime, so
they carry different practical weight than the `astro` XSS cluster, which is
direct and touches request-handling code this project will actually serve.
Bootstrapper does not auto-patch — `npm audit fix` is available and the risk call
is yours.

## Hints recorded but not acted on

| Hint                    | Value                 |
| ----------------------- | --------------------- |
| bootstrapper_confidence | first-class           |
| quality_override        | false                 |
| path_taken              | standard              |
| self_check_answers      | null                  |
| team_size               | solo                  |
| deployment_target       | cloudflare-pages      |
| ci_provider             | github-actions        |
| ci_default_flow         | auto-deploy-on-merge  |
| has_auth                | true                  |
| has_payments            | false                 |
| has_realtime            | false                 |
| has_ai                  | false                 |
| has_background_jobs     | true                  |

No CI/CD scaffolding, auth wiring, or background-job setup was generated from
these flags — v1 records them so a later skill can act without a schema bump.
Note that the starter ships its own `.github/` directory, which was moved into
place by the scaffold step; that is the starter's content, not something
bootstrapper generated from `ci_provider`.

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history.
- Review any `.scaffold` siblings the conflict policy created and decide which version of each file to keep. Here that is `CLAUDE.md.scaffold` — the starter's own agent instructions, held back because this directory already had a `CLAUDE.md`.
- Address audit findings per your project's risk tolerance — the full breakdown is in this log.
- Copy `.env.example` to `.env` and fill in Supabase credentials before running the dev server.
