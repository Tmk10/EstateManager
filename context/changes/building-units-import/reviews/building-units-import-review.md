<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Building Units Import

- **Plan**: `context/changes/building-units-import/plan.md`
- **Scope**: Phases 1–4 of 4 (full plan)
- **Date**: 2026-08-02
- **Verdict**: REJECTED
- **Findings**: 1 critical, 4 warnings, 5 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | FAIL |
| Architecture | WARNING |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

Success criteria were re-run, not taken on trust: `npx astro sync && npm run lint && npm run build` all pass on the worktree; `main` and `origin/main` are both at `b13a68a`, confirming Phase 4's fast-forward and push; the working tree is clean with no untracked files (so the Phase 2 harness was indeed not committed). All 41 Progress checkboxes carry a commit sha and have observable evidence in the diff.

File-level scope is exact: every file in the diff is named in the plan, and every file named in the plan is in the diff. All ten "What We're NOT Doing" boundaries hold — `supabase/seed.sql` untouched, `.github/workflows/` contains no `supabase` invocation, no test runner, no unit edit/delete path, no owner-facing route, `authenticated` policies still unscoped.

## Findings

### F1 — Rows sharing an e-mail silently discard the second owner's name

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `supabase/migrations/20260802072737_create_units_and_owners.sql:454-462`, `src/pages/buildings/[id]/units/import.astro:99-105`
- **Detail**: `owner_keys` uses `distinct on (s.owner_key) … order by s.owner_key, s.row_no`, so when two CSV rows share an e-mail (matched case-insensitively) but carry **different names**, the second name is dropped without an error. The preview renders `row.fullName` straight from the parser, so it shows both names — on the one screen whose entire purpose is "check before you save". `src/lib/units-csv.ts` dedupes unit numbers (`unitNumberLines`, line 309) but never compares names against a shared e-mail.

  Confirmed against the local stack:

  ```
  input   : 1;50,00;Jan Kowalski;k@x.pl   |   2;50,00;Anna Kowalska;K@X.PL
  preview : "Jan Kowalski", "Anna Kowalska"
  stored  : 1 → Jan Kowalski (k@x.pl)  |  2 → Jan Kowalski (k@x.pl)
  ```

  There is no recovery: re-import is refused by `EM002` and no screen edits units, so the only correction is a hand-written `update` against production.

  *Failure scenario*: an administrator imports a registry in which a married couple own two separate lokale and share one inbox under different surnames. The confirmed registry attributes both units to one spouse. `S-02` then addresses that unit's voting link to a person the row never named, and `S-03` weighs their vote — in the first table in this project holding other people's personal data.
- **Fix A ⭐ Recommended**: Reject the conflict in `parseUnitsCsv` — when two rows share a lower-cased e-mail but differ in `imie_nazwisko`, emit an error naming both line numbers.
  - Strength: Fails before anything is written, in the module that already owns "one pass finds everything wrong with the file" and already has the `unitNumberLines` machinery to copy. The administrator fixes the file, which is where the ambiguity actually lives.
  - Tradeoff: Rejects a file that is arguably legitimate (one person, two spellings) and forces an edit; adds a fifth uniqueness rule to the parser.
  - Confidence: HIGH — same shape as the existing duplicate-unit-number check at `units-csv.ts:334-348`, and it needs no migration.
  - Blind spot: Whether Polish registries in practice carry per-row name variants for the same owner (e.g. with/without a middle name), which would make this noisy.
- **Fix B**: Collapse rows by e-mail in the preview so the screen displays exactly what `owner_keys` will store.
  - Strength: Accepts the file, and restores the preview's contract — what you see is what gets written.
  - Tradeoff: The administrator has to notice a name they typed has quietly changed; the silent discard still happens, it is merely visible. Also means the preview table stops being row-per-unit.
  - Confidence: MEDIUM — correct in principle, but relies on the administrator spotting it rather than on the system refusing.
  - Blind spot: Not verified how the preview table would render a unit whose owner name differs from its own row.
- **Decision**: PENDING

### F2 — `assert_building_registry` reads through the caller's RLS, so `S-02` scoping will silently void both invariants

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Architecture
- **Location**: `supabase/migrations/20260802072737_create_units_and_owners.sql:284-333` and `:485-489`
- **Detail**: The assertion is `security invoker` (correct per the project rule as written), so its `select … from public.units` runs under the caller's policies. Today `units_select_authenticated using (true)` makes the aggregate complete and the invariant holds. But this migration's own comment at lines 146-154 commits to scoping that policy in `S-02` — and the moment it does, "shares total exactly 10000" becomes visibility-dependent. Worse, the `update public.buildings set total_area_m2 = (select sum(u.area_m2) from public.units u …)` at line 485 reads through the same policy, writes `NULL`, and that `NULL` then makes the assertion take its **no-units early return** at line 308 instead of raising.

  Demonstrated on the local stack (policy reverted afterwards):

  ```sql
  alter policy "units_select_authenticated" on public.units to authenticated using (false);
  set local role authenticated;
  select public.import_building_units(<building>, <2 units, 5000 bps each>);
  -- COMMIT succeeds. Resulting row:
  --   total_area_m2 = null   units = 2   sum(share_bps) = 10000
  ```

  Two units at 10000 bps with `total_area_m2` NULL and **no error raised** — a silent break of both invariants the triggers exist to guarantee, on the table that decides vote outcomes.

  *Failure scenario*: `S-02` adds `building_id in (select …)` to the units policies. The next import writes `total_area_m2 = NULL`, the registry page's total floor area silently disappears, and a partially-visible caller can commit a registry that does not total 100%.
- **Fix A ⭐ Recommended**: Make `assert_building_registry` `security definer` (keeping `set search_path = ''`), and have the `sum(area_m2)` subquery at line 486 go through it or through an equally definer-scoped read.
  - Strength: An integrity check that can be defeated by the caller's visibility is not an integrity check. CLAUDE.md's no-definer rule is aimed at the **write** path — "a `definer` function here would turn the single write path into the single RLS bypass" — and this function writes nothing, takes only a `uuid`, and returns `void`, so it cannot be used to read or modify anything.
  - Tradeoff: Introduces the first `security definer` object in the project, which weakens a rule that is currently absolute and easy to audit. Needs a comment stating exactly why this one is exempt, or the next reader will "fix" it back.
  - Confidence: MEDIUM — the reasoning is sound and standard, but the exemption has to be written into CLAUDE.md as well as the migration, or the rule and the code disagree.
  - Blind spot: Have not checked whether a definer assertion changes behaviour for the `anon` role, which currently cannot reach any of these tables at all.
- **Fix B**: Leave it invoker and record it as an explicit `S-02` precondition — in `plan.md`'s follow-ups and in the migration comment at lines 146-154 that already promises the scoping.
  - Strength: Costs nothing now, keeps the no-definer rule absolute, and puts the warning exactly where the person doing `S-02` will read it.
  - Tradeoff: Depends entirely on that person reading it. The failure it guards against is silent, so nothing will catch a miss.
  - Confidence: MEDIUM — correct as documentation, but it defers a correctness property to a future author's diligence.
  - Blind spot: Whether `S-02`'s scoping will even touch the units `select` policy, or only add an owner-token path alongside it.
- **Decision**: PENDING

### F3 — The confirm endpoint has no upload size guard at all

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/pages/api/buildings/[id]/units.ts:31`
- **Detail**: `await context.request.formData()` runs unguarded. `import.astro:83` caps the upload at 1 MB, but the confirm endpoint is a separate entry point — and it is the only one that writes, re-parsing from scratch precisely because it does not trust the client. `parseUnitsCsv` then calls `splitRecords` (`units-csv.ts:264`), which materialises every record and field **before** `MAX_ROWS` is consulted at line 295.

  *Failure scenario*: a signed-in administrator POSTs a 60 MB `csv` field to `/api/buildings/<id>/units`. The body is fully buffered, decoded to a JS string, and expanded into a records array — several multiples of 60 MB against the Workers 128 MB isolate limit — producing a `1101`/500 rather than the Polish error this endpoint is written to return. The 1000-row cap never fires.
- **Fix**: Check `context.request.headers.get("content-length")` before `formData()`, and cap `csv.length` before `parseUnitsCsv`, reusing `MAX_FILE_BYTES` from the import page. Apply the same `content-length` pre-check at `import.astro:78`, where the 1 MB guard likewise runs only after the body is buffered.
- **Decision**: PENDING

### F4 — A concurrent import fails with `EM003`, telling the administrator to file a bug

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `supabase/migrations/20260802072737_create_units_and_owners.sql:422-432`, `src/pages/api/buildings/[id]/units.ts:14-19`
- **Detail**: The `EM002` emptiness check and the inserts share a transaction but take no lock. Verified with two concurrent local sessions: **correctness holds** — the `update public.buildings` at line 485 serialises them on the buildings row, and the loser's deferred trigger re-reads under a fresh READ COMMITTED snapshot and aborts. But it aborts with `EM003`, which `ERROR_MESSAGES` maps to *"Suma udziałów nie wynosi 100%. Zgłoś to jako błąd."* — telling an administrator who hit a routine race to report a bug, instead of `EM002`'s accurate "already imported". Observed: `Building … unit shares total 20000 bps, expected 10000`.

  The protection is also emergent rather than stated: it depends on the `buildings` UPDATE staying inside the function and on READ COMMITTED. A future refactor that moves that UPDATE removes the serialisation with nothing failing to signal it.

  *Failure scenario*: two administrators of the same wspólnota confirm imports within the same second. One sees a message instructing them to report a bug that does not exist, and the plan's own reasoning — that `EM003`/`EM004` are unreachable if the arithmetic is right — quietly stops being true.
- **Fix**: Add `perform 1 from public.buildings where id = p_building_id for update;` immediately before the `EM002` check, making the guarantee explicit and producing the correct message.
- **Decision**: PENDING

### F5 — An unterminated quote defeats the parser's "report everything at once" contract

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `src/lib/units-csv.ts:64-143`
- **Detail**: The plan states the requirement as *"a 70-row file with five typos must produce five messages, not one"* (`plan.md:409-410`). `splitRecords` never reports an unbalanced quote — it absorbs the rest of the file into a single field. Confirmed:

  ```
  input : header \n 1;52,40;"Jan;a@b.pl \n 2;10,00;Ala;x@y.pl \n 3;;;
  output: exactly ONE error — { line 2, "Wiersz ma 3 pól zamiast 4. Sprawdź, czy nie brakuje średnika." }
  ```

  Rows 3 and 4 are swallowed, including a genuinely empty row 4, and the message points at a missing semicolon when the defect is a stray `"`.

  *Failure scenario*: an administrator whose spreadsheet emitted one unbalanced quote gets a single misleading message about semicolons, fixes a semicolon that was never wrong, re-uploads, and gets the same message again. Line numbers past the stray quote are meaningless.
- **Fix**: Track `inQuotes` at EOF in `splitRecords` and emit a dedicated Polish error naming `recordStartLine` — the line where the unterminated field began.
- **Decision**: PENDING

### F6 — `id` is interpolated into redirect targets without `encodeURIComponent`

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/pages/api/buildings/[id]/units.ts:29` and `:78`
- **Detail**: `id` comes from `context.params` and goes into both redirect targets raw, while `message` on the same line is correctly encoded. Not an open redirect — both targets start with the literal `/buildings/` prefix, so even `%2F%2Fevil.com` resolves same-origin. But `%3F` or `%23` in the segment truncates the intended target (`/buildings/?x=1/units/import?error=…` lands on `/buildings/`), and `%0d%0a` reaches the `Headers` constructor as a 500 instead of a Polish error.
- **Fix**: Wrap `id` in `encodeURIComponent`, as `message` already is.
- **Decision**: PENDING

### F7 — Raw Postgres `error.message` reaches the UI and the query string

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/pages/api/buildings/[id]/units.ts:75`; `src/pages/buildings/[id]/index.astro:40,52`; `src/pages/buildings/[id]/units/import.astro:55,70`
- **Detail**: A non-uuid `[id]` on the API route puts `invalid input syntax for type uuid: "…"` in the address bar. This mirrors the existing convention at `src/pages/api/buildings/index.ts:52`, so it is not new — but it is now on four more surfaces. Note the inconsistency **inside this change**: `[id]/index.astro:40` and `import.astro:55` special-case `22P02` correctly and render "Nie znaleziono budynku."; `units.ts` does not.
- **Fix**: At minimum add the `22P02` special case to `units.ts` so the three new surfaces agree; a project-wide decision to stop forwarding `error.message` is a separate, larger change.
- **Decision**: PENDING

### F8 — The preview step handles `POST` inline, forfeiting post-redirect-get

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: `src/pages/buildings/[id]/units/import.astro:77-119`
- **Detail**: The upload step handles `POST` in the page rather than through a form-data + redirect endpoint, which is the shape `src/pages/api/buildings/index.ts` + `buildings/new.astro` established and `CLAUDE.md` describes. This is deliberate, documented at lines 10-13, matches Astro's own recipe, and the plan called for it explicitly (`plan.md:535`) — the confirm step *does* follow the endpoint convention. The cost is that the preview is the direct response to a POST, so a reload or a back-navigation prompts form resubmission.
- **Fix**: None recommended — noted so the deviation is a recorded decision rather than an accident. Revisit only if resubmission prompts turn up in use.
- **Decision**: PENDING

### F9 — Three small, documented drifts from the plan's stated contracts

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `src/pages/buildings/[id]/index.astro:46-49,67`; `src/pages/buildings/[id]/units/import.astro:23`; `src/lib/units-csv.ts:343-347`
- **Detail**: Each is commented in place and each is defensible; listing them so the plan and the code can be reconciled rather than drifting silently.
  1. The plan says units are "ordered by `unit_number`" in the query. The query has no `.order()`; rows are sorted in JS with `localeCompare(…, "pl", { numeric: true })` because SQL text ordering puts "10" between "1" and "2". This is better than what was planned.
  2. `ACCEPTED_TYPES` also contains `""`, so a browser sending no content-type passes the guard. The plan named exactly three types.
  3. "A duplicate reports both lines" is implemented as one error on the second occurrence naming the first line, not two error entries. The information is there; the shape differs.
- **Fix**: Fold all three into `plan.md` as an addendum so the plan stays usable as ground truth for the next review.
- **Decision**: PENDING

### F10 — Parser validates more than the plan specified; SQL has no length bounds

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: `src/lib/units-csv.ts:166-191`, `:314-317`; `supabase/migrations/20260802072737_create_units_and_owners.sql:24-102`
- **Detail**: Two extras beyond the plan, both benign and both commented: unknown and duplicated header columns are rejected (so a file with a fifth column now fails), and a blank line in the *middle* of a file is an error (the plan only said trailing blanks are ignored). Conversely, `unit_number` ≤ 50 and `full_name` ≤ 200 are enforced **only** in the parser — the SQL has not-blank checks but no length bound, so a direct RPC call could store a 1 MB `unit_number`. Authenticated-administrator-only, hence low.
- **Fix**: Note the two parser extras in the plan addendum alongside F9; optionally add `check (length(unit_number) <= 50)` and `check (length(full_name) <= 200)` in a later migration so the database carries the same bound as the parser.
- **Decision**: PENDING

## Verified clean

Recorded so a later reader knows these were checked by execution, not by reading:

- **`shares.ts` arithmetic.** 30 000 randomised registries (1–60 units, areas 1…1 000 000 hundredths): zero cases where shares did not total exactly 10000. Ties break by ascending file index (`[1,1,1]` → `[3334,3333,3333]`). No float in the value path; max numerator `1e10` against `MAX_SAFE_INTEGER ≈ 9.007e15`. `areaHundredthsToDecimalString` slices rather than divides.
- **CSV line numbers survive embedded newlines.** A quoted cell spanning physical lines 2-3 causes the next record to be reported as line 4. `""` escapes, BOM stripping, and the `TextDecoder(fatal:true)` Windows-1250 path all behave as specified. Errors are collected, not fail-fast — three bad rows produced six distinct errors.
- **No `security definer` anywhere.** `pg_proc.prosecdef = f` for all four new functions.
- **Triggers are constraint triggers, deferred, and handle DELETE.** `pg_trigger` confirms `tgdeferrable`/`tginitdeferred` on both. `assert_units_registry` uses `old.building_id` on DELETE — the NULL-on-delete bug is not present.
- **Migration is non-destructive.** No drop/truncate/non-additive alter. `add column total_area_m2 numeric(10,2)` is nullable with no default, so no table rewrite; its check validates trivially against existing NULLs. Cascade delete of a building with an imported registry succeeds despite `on delete restrict` on the unit→owner FK — executed, not assumed.
- **Trigger cost is bounded.** A real 1000-unit import: RPC 34 ms, COMMIT (1000 deferred firings) 145 ms.
- **No injection.** Every value flows through `jsonb` operators into parameterised inserts. No `set:html`, no `dangerouslySetInnerHTML`; Astro's attribute escaping contains the 1 MB hidden `previewCsv` field.
- **Auth coverage complete.** All four new paths are covered by the `/buildings` and `/api/buildings` prefixes in `PROTECTED_ROUTES`; no middleware edit was needed and none was made.
- **Null-client branch handled** at all four new Supabase touchpoints. Every Supabase call checks `error`. No hardcoded secrets.
- **Pattern compliance otherwise good.** `@/*` alias throughout with no `../`; `UnitsUploadForm.tsx` matches `BuildingForm.tsx`'s shape and reuses `SubmitButton`/`ServerError`; `units-template.csv.ts` generating from `CSV_HEADERS` is exactly the drift-proofing `CLAUDE.md` describes.
