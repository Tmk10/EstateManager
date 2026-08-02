# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Zawsze commituj bezpośrednio do main

- **Context**: Każdy commit w repozytorium EstateManager — dowolna faza, niezależnie od tego, czego dotyczy zmiana.
- **Problem**: Agent domyślnie odbija gałąź funkcyjną, zanim zacommituje na gałęzi domyślnej. Z tego nawyku leżą już w repo dwie porzucone gałęzie — `docs/agent-onboarding` (4 commity za `main`) i `fix/ci-branch-trigger` (1 commit za) — żadna nie została zmergowana ani skasowana.
- **Rule**: Zawsze commituj bezpośrednio do `main`. Nigdy nie twórz gałęzi funkcyjnej i nie pytaj, której gałęzi użyć.
- **Applies to**: all
- **Applies to**: all

## Praca agentów toczy się w worktree, ale ląduje na main

- **Context**: Każde zadanie agenta, które może edytować kod — implementacja, triage po review, wszystko, co uruchamia agentów równolegle. Zastępuje w tym zakresie regułę [[Zawsze commituj bezpośrednio do main]] z 2026-08-01.
- **Problem**: Poprzednia reguła zakazywała gałęzi w ogóle, bo w repo zostały po nich dwie porzucone gałęzie. Ale przepływ wieloagentowy tego nie znosi: kilku agentów edytujących jeden checkout nadpisuje sobie nawzajem pliki. Zakaz gałęzi rozwiązywał problem porzuconych gałęzi kosztem uniemożliwienia pracy równoległej.
- **Rule**: Praca agenta, która może dotknąć kodu, idzie do worktree w `.claude/worktrees/`. Gałąź worktree jest tymczasowa — istnieje po to, żeby odizolować edycje, i wraca na `main` po zakończeniu zadania. Nie zostawiaj porzuconych worktree ani ich gałęzi. Nadal nie ma przepływu PR i nadal nie pytaj, której gałęzi użyć: odpowiedź to zawsze „worktree teraz, `main` docelowo". Zmiany wyłącznie dokumentacyjne mogą iść prosto w checkout `main`.
- **Applies to**: all
