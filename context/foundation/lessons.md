# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Zawsze commituj bezpośrednio do main

- **Context**: Każdy commit w repozytorium EstateManager — dowolna faza, niezależnie od tego, czego dotyczy zmiana.
- **Problem**: Agent domyślnie odbija gałąź funkcyjną, zanim zacommituje na gałęzi domyślnej. Z tego nawyku leżą już w repo dwie porzucone gałęzie — `docs/agent-onboarding` (4 commity za `main`) i `fix/ci-branch-trigger` (1 commit za) — żadna nie została zmergowana ani skasowana.
- **Rule**: Zawsze commituj bezpośrednio do `main`. Nigdy nie twórz gałęzi funkcyjnej i nie pytaj, której gałęzi użyć.
- **Applies to**: all
- **Superseded**: 2026-08-02 przez [[Każdy feature i fix przez własną gałąź i pull request]] — reguła jest odwrócona: gałąź funkcyjna i PR są teraz obowiązkowe.

## Praca agentów toczy się w worktree, ale ląduje na main

- **Context**: Każde zadanie agenta, które może edytować kod — implementacja, triage po review, wszystko, co uruchamia agentów równolegle. Zastępuje w tym zakresie regułę [[Zawsze commituj bezpośrednio do main]] z 2026-08-01.
- **Problem**: Poprzednia reguła zakazywała gałęzi w ogóle, bo w repo zostały po nich dwie porzucone gałęzie. Ale przepływ wieloagentowy tego nie znosi: kilku agentów edytujących jeden checkout nadpisuje sobie nawzajem pliki. Zakaz gałęzi rozwiązywał problem porzuconych gałęzi kosztem uniemożliwienia pracy równoległej.
- **Rule**: Praca agenta, która może dotknąć kodu, idzie do worktree w `.claude/worktrees/`. Gałąź worktree jest tymczasowa — istnieje po to, żeby odizolować edycje, i wraca na `main` po zakończeniu zadania. Nie zostawiaj porzuconych worktree ani ich gałęzi. Nadal nie ma przepływu PR i nadal nie pytaj, której gałęzi użyć: odpowiedź to zawsze „worktree teraz, `main` docelowo". Zmiany wyłącznie dokumentacyjne mogą iść prosto w checkout `main`.
- **Applies to**: all
- **Superseded**: 2026-08-02 przez [[Każdy feature i fix przez własną gałąź i pull request]] — worktree zostaje, ale gałąź nie wraca na `main` merge'em lokalnym, tylko przez PR.

## Każdy feature i fix przez własną gałąź i pull request

- **Context**: Każda zmiana w repozytorium EstateManager — feature, fix, dokumentacja, chore. Zastępuje [[Zawsze commituj bezpośrednio do main]] (2026-08-01) w całości i domyka [[Praca agentów toczy się w worktree, ale ląduje na main]] (2026-08-02) w części o lądowaniu na `main`.
- **Problem**: Commitowanie prosto na `main` sprawdzało się, dopóki projekt był mały i pracował nad nim jeden agent naraz. Przy większym projekcie i równoległej pracy agentów każdy taki commit ląduje od razu na gałęzi, z której `deploy.yml` deployuje produkcję — bez przeglądu, bez zielonego CI przed faktem i bez punktu, w którym dwie równoległe zmiany dałoby się pogodzić przed wypuszczeniem.
- **Rule**: Każdy feature i każdy fix dostaje własną gałąź (`feat/<slug>`, `fix/<slug>`, `docs/<slug>`, `chore/<slug>`) odbitą od aktualnego `main` i własny pull request na GitHubie (`gh pr create --base main`). Nie commituj bezpośrednio na `main`. CI (`ci.yml`) uruchamia się na `pull_request` i musi być zielone przed merge'em; merge to `gh pr merge --squash --delete-branch`. Gałąź worktree jest tą gałęzią PR-a. Nie pytaj, której gałęzi użyć — zawsze nowej, odbitej od `main`. Commit, push/otwarcie PR-a i merge to trzy osobne zgody użytkownika; merge jest deployem na produkcję.
- **Applies to**: all
