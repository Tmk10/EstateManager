# Docs

Explanatory material for the developer: what the solutions used in this codebase actually are, and why they were chosen. Written to be read and learned from, not to be consumed by a skill.

These are lessons about the project, addressed to a person. A doc here answers "what is this technology, what does it cost me, and why is it in my project" — the question the contract documents never ask because they are busy deciding.

## What belongs here

- Overviews of the stack, tooling, or an architectural approach used in the code
- Write-ups of a solution that took effort to understand and would take the same effort to re-derive
- Background on a decision's *subject matter*, as opposed to the decision record itself

## What does not

- **Contract documents** — `prd.md`, `tech-stack.md`, `infrastructure.md`, `deployment.md` and anything else that feeds the skill chain lives in `context/foundation/`. Those are inputs to tooling; these are not.
- **Recurring rules for future work** — those go to `context/foundation/lessons.md`, which the planning and review skills read as a prior. A rule an agent must follow is not a doc.
- **Change-scoped material** — plans, research and reviews tied to one change belong under `context/changes/<change-id>/`.

## Update convention

**Edit-in-place**, as in `foundation/`. A doc here describes the project as it currently stands; when the code moves on, correct the doc rather than dating a copy. Docs that describe an abandoned approach are deleted, not archived — the decision history already lives in `foundation/`.

## Contents

- [`tech_stack_information.md`](./tech_stack_information.md) — the product stack and dev toolchain, each entry with pros, cons, and the project-specific reason it was chosen (Polish)
