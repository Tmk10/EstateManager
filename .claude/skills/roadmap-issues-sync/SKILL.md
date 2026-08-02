---
name: roadmap-issues-sync
description: >
  Mirror context/foundation/roadmap.md into GitHub issues — create issues for new
  roadmap items, update ones whose scope moved, close ones the roadmap marks done,
  linking the pull request or the commits that delivered them. One-way: the roadmap
  is the source of truth and is never written to. Trigger phrases: "sync the issues",
  "update GitHub issues", "zsynchronizuj issues", "zaktualizuj status issues",
  "mirror the roadmap into the backlog", "dodaj nowe taski z roadmapy". Use AFTER
  /10x-roadmap or /10x-archive changed the roadmap. Do NOT use to file a bug or to
  plan a change — that's /10x-new and /10x-plan.
argument-hint: "[--dry-run]"
allowed-tools:
  - Read
  - Glob
  - Grep
  - Bash
  - Write
  - AskUserQuestion
---

# /roadmap-issues-sync — Mirror the roadmap into GitHub issues

`context/foundation/roadmap.md` is the source of truth; the GitHub backlog is its mirror.
Mirrors drift silently — the roadmap moves from v2 to v4, four items ship, one item gets
split in two, three new ones appear, and nothing on either side raises a hand. This skill
computes the diff, shows it, and applies it after one confirmation.

**Direction is one-way and absolute: roadmap → GitHub.** The skill reads the repository
and writes only to GitHub. It never edits `roadmap.md`, never commits, never opens a
branch or a pull request.

**Authority is bounded**: it may create issues, update existing ones (title, body,
labels), and close ones the roadmap marks done. It never deletes an issue, never reopens
one, and never touches an issue that lacks the `roadmap` label.

## When to use, when to skip

**Use when** the roadmap changed and the backlog has not caught up: right after
`/10x-roadmap` regenerates or extends it, right after `/10x-archive` flips an item to
`done`, or when returning to a project and wanting the backlog to be trustworthy again.

**Skip when** the intent is to file something the roadmap does not contain — a bug, a
chore, a spike. Those are ordinary GitHub issues and this skill deliberately cannot see
them. Also skip when the roadmap itself is what needs changing: fix it there first, then
run this. Scope is argued in the roadmap, never in an issue.

## Relationship to other skills

- `/10x-roadmap` — writes the roadmap this skill reads. Its `## At a glance` table and
  per-item body blocks are the input format assumed throughout.
- `/10x-archive` — the sole writer of `Status: done`. This skill is what turns that field
  into a closed issue, so the natural order is `/10x-archive` then this.
- `/10x-new`, `/10x-plan` — operate on a single change. Orthogonal: an issue is where a
  slice is tracked, a change folder is where it is planned.

## Interactive prompts — host-agnostic

Where this procedure says *"ask the user"*, use whichever interactive-question tool the
host agent exposes: Claude Code → `AskUserQuestion`, Cursor → `ask_question`, OpenAI
Codex → `request_user_input`. Before the first question, scan the available tools for one
taking a `question`/`prompt` plus `options`/`choices`, and use the first match. If none
exists, fall back to a plain message asking the user to reply with one of the labelled
options — never block the procedure on a missing tool. State which one you picked the
first time you ask.

## Hard refusals

Three, checked before anything else and stated here so they are not re-derived:

1. **No writes to the repository.** Not to `roadmap.md`, not to `context/`, not anywhere.
   Issue bodies are staged as files (`gh --body-file` needs real files, and markdown
   bodies are too quote-heavy for heredocs), and those files go in a scratch directory
   from `mktemp -d`. If a resolved write path is inside the repository, stop and say:
   `refusing to write inside the repository — this skill is one-way (roadmap → GitHub).`
2. **No inference of doneness.** `Status: done` in the roadmap is the only signal. Shipped
   code, merged pull requests and archived change folders prove nothing here. An item the
   roadmap does not mark done stays open, silently, by design — `/10x-archive` is what
   flips that field.
3. **No touching issues outside the mirror.** An issue without the `roadmap` label is
   never read, modified or closed. It may appear in the report as *report-only*, nothing
   more.

## Initial Response

Parse the argument: `--dry-run` means stop after the report in Step 7 and change nothing.
No argument means the full run, still gated by the confirmation in Step 7. Anything else
is unknown — say so and stop.

Then go to Step 1 without further prompting.

## Step 1 — Preflight

```bash
gh auth status
gh repo view --json nameWithOwner -q .nameWithOwner
test -f context/foundation/roadmap.md
```

Each failure stops the run with the corresponding message and nothing else:

- not authenticated → `error: gh is not authenticated. Run \`gh auth login\` and re-run.`
- no repo → `error: no GitHub remote resolved. This skill syncs against a GitHub repository.`
- no roadmap → `error: no roadmap at context/foundation/roadmap.md. Run /10x-roadmap first.`

Read the roadmap's frontmatter `version` — it goes in the "Mirror of …" line of every
body, so a reader can tell which roadmap generation an issue was rendered from.

## Step 2 — Parse the roadmap

Read the whole file. It is the input format `/10x-roadmap` emits; four regions matter.

**`## At a glance`** — one row per item: `ID`, `Change ID`, Outcome (short form),
`Prerequisites`, `PRD refs`, `Status`.

**`## Foundations` and `## Slices`** — per-item blocks headed `### <ID>: <title>`, with
bold-label bullets: `- **Outcome:**`, `- **Change ID:**`, `- **PRD refs:**`,
`- **Prerequisites:**`, `- **Parallel with:**`, `- **Unlocks:**` (optional),
`- **Blockers:**`, `- **Unknowns:**` (sub-bullets), `- **Risk:**`, `- **Status:**`, and
on completed items sometimes `- **Zrealizowane:**` (what it left behind) and
`- **Do przemyślenia poza tym kawałkiem:**` (deliberately deferred).

Take prose from the body block, not from the table — the table is an index and truncates.
Status values seen in practice: `proposed`, `ready`, `blocked`, `done`, `done (YYYY-MM-DD)`.
Treat a trailing parenthesised date as the completion date.

**`## Streams`** — stream letter, theme, and the chain. The theme becomes the
`stream:<letter>` label description; translate it to English.

**`## Backlog Handoff`** — the `Notes` column carries caveats the body blocks do not, in
particular content-blocked items. Fold it into the issue body where it adds something.

**Stop, do not guess**, if an item's `Status` differs between the table and its body
block, or if an item appears in one and not the other. That is an inconsistent roadmap,
and picking a side would launder the inconsistency into the backlog. Report both values
and which line each came from.

Also note the north-star item — the roadmap marks it in `## North star` and in the item
heading.

## Step 3 — Fetch the backlog

```bash
gh issue list --state all --limit 200 --label roadmap \
  --json number,title,state,body,labels
```

Match each issue to a roadmap item, in this order:

1. the `Roadmap ID: \`<ID>\`` footer line in the body — the durable key. It survives
   retitling, rescoping and a changed Change ID, which is exactly what a split does.
2. failing that, the `[<ID>]` prefix in the title.

Do **not** match on Change ID. It is the field a split changes.

An issue matching nothing goes to the *report-only* bucket. A roadmap item matching
nothing is a *create*.

## Step 4 — Derive the target label set

For each roadmap item: `roadmap`, plus `type:foundation` or `type:slice` from the ID
prefix, plus `stream:<letter>` from the Streams table, plus `north-star` if marked, plus
exactly one status label by this rule, evaluated top to bottom:

| Condition | Label | Issue state |
| --- | --- | --- |
| roadmap `Status: done` | `status:done` | closed |
| any Unknown marked `Block: tak` / `Block: yes` | `status:blocked` | open |
| every prerequisite's roadmap status is `done` | `status:ready` | open |
| otherwise | `status:blocked` | open |

The second row is load-bearing and easy to miss: an item can have every code dependency
satisfied and still be blocked, because what it lacks is a decision — a product name, a
contact address. Such an item is *blocked*, and the blocking question must be quoted in
its body so the label explains itself.

Only `done` is read off the roadmap's `Status` field. Its other values (`proposed`,
`ready`, `blocked`) are advisory and deliberately ignored: `/10x-roadmap` writes
`proposed` across the board and does not revisit it as prerequisites close, so trusting
it would leave every unblocked item mislabelled. The status label is derived from
prerequisites and blocking Unknowns, which do get maintained.

Create any missing label with the colour and description from
`references/issue-body-template.md` § Label registry. Never recolour an existing one.

## Step 5 — Render bodies and compute the diff

Render each item's target body from `references/issue-body-template.md`, then sort every
item into one of four buckets:

- **create** — roadmap item with no issue
- **update** — open issue whose title, body or labels differ from target
- **close** — roadmap says `done`, issue is open
- **report-only** — issue labelled `roadmap` matching no item; listed, never touched

**A closed issue is frozen.** It is stamped once, by the run that closes it, and never
rewritten afterwards. Nothing is gained by re-rendering the record of a shipped slice
every time the roadmap's version bumps, and a rule that keeps rewriting closed issues
guarantees every future run reports work to do. If a closed issue is genuinely wrong,
that is a hand edit, not a sync.

For a **body** diff, compare meaning, not bytes. Whitespace, reflowed prose and reordered
label lists are not drift. Section content, dependency numbers, open-question set and the
`Roadmap ID:` footer are. A body diff that comes down to rewording is a false positive and
will make every run look busy — when unsure, leave the body alone.

**A split, rename or rescope is an update, never a close-and-recreate.** Retitle, rewrite
the body, add a comment recording what the issue used to be. The number must survive:
other issue bodies cite it, and a dangling `#3` costs more than a stale title.

## Step 6 — Provenance for each close

This is the one place the repository is consulted, and it feeds the closing comment — not
the decision to close, which Step 4 already made from the roadmap alone.

```bash
gh pr list --state merged --limit 100 --search "<change-id>" --json number,title,url,headRefName
git log --oneline --reverse -- "context/changes/<change-id>"
git log --oneline --reverse --grep "(<change-id>)"
```

Union the two commit lists, oldest first, and drop duplicates. Prefer a merged pull
request when one exists; otherwise list the commits — items delivered before the
branch-and-PR rule landed have no pull request, and the commit list is the only
provenance they will ever have.

Resolve the record path: `context/changes/<change-id>/`, or `context/archive/<date>-<change-id>/`
once archived.

**Zero pull requests and zero commits is a warning in the report**, not a stop: the
roadmap claims the item is done and the repository shows nothing delivered it. Surface
both facts and let the human decide — this is the only cross-check the skill performs,
and it checks its own output rather than second-guessing the roadmap.

## Step 7 — Report, then one confirmation

Print, as markdown tables: creates (ID, change-id, proposed title, labels), updates (ID,
issue number, what changes), closes (ID, issue number, provenance to be linked),
report-only (issue number, title), labels to be created, and warnings.

If nothing is in any bucket, say `backlog is in sync with roadmap v<N> — nothing to do.`
and stop. That is the expected outcome of a run right after a previous one.

With `--dry-run`, stop here.

Otherwise ask the user once, with the report visible: apply, or abort. Nothing has touched
GitHub before this point, and everything after it follows from that single answer.

## Step 8 — Execute, in this order

The order is load-bearing, not stylistic.

1. **Create missing labels.** Issue creation fails on a label that does not exist.
2. **Create new issues**, capturing each assigned number as it comes back.
3. **Update bodies and labels** — now that new numbers exist, cross-references resolve.
4. **Close** done items: post the provenance comment, set `status:done`, remove the stale
   status label, then `gh issue close --reason completed`.
5. **Second pass** over any body that references an issue created in step 2.

Step 5 is not optional. An issue created in step 2 cannot reference a number that will
only be assigned later in step 2 — so in any run creating more than one issue with
dependencies between them, at least one body is written with an unresolvable reference and
must be patched afterwards. Rendering cross-references in a single pass is wrong every
time it matters.

Stage each body in the scratch directory and pass it with `--body-file`. Never inline a
markdown body as a shell argument.

## Step 9 — Verify

Re-list and print the final state:

```bash
gh issue list --state all --limit 200 --json number,state,title,labels \
  -q '.[] | "\(.number)\t\(.state)\t\(.title)\t[\([.labels[].name] | join(", "))]"' | sort -n
```

Then state, in one line each: how many issues were created, updated and closed, and what
the human still owes — items whose blocking Unknown is a decision only they can make.
Those are the ones the backlog cannot unblock on its own.

## Out of scope

Named so they are not added by reflex: milestones; GitHub Projects boards; reading issue
comments back into the roadmap; reopening issues; assignees; estimates. Every one of them
either reverses the direction of the mirror or duplicates state the roadmap already holds.
