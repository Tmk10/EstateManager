# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Zawsze commituj bezpośrednio do main

- **Context**: Każdy commit w repozytorium EstateManager — dowolna faza, niezależnie od tego, czego dotyczy zmiana.
- **Problem**: Agent domyślnie odbija gałąź funkcyjną, zanim zacommituje na gałęzi domyślnej. Z tego nawyku leżą już w repo dwie porzucone gałęzie — `docs/agent-onboarding` (4 commity za `main`) i `fix/ci-branch-trigger` (1 commit za) — żadna nie została zmergowana ani skasowana.
- **Rule**: Zawsze commituj bezpośrednio do `main`. Nigdy nie twórz gałęzi funkcyjnej i nie pytaj, której gałęzi użyć.
- **Applies to**: all
