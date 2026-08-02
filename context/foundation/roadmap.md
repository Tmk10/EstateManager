---
project: "EstateManager"
version: 4
status: draft
created: 2026-08-01
updated: 2026-08-02
prd_version: 4
main_goal: market-feedback
top_blocker: time
---

# Roadmap: EstateManager

> Wyprowadzona z `context/foundation/prd.md` (v4) oraz z automatycznego rozpoznania stanu kodu.
> Dokument edytowany w miejscu; archiwizowany, gdy zostanie zastąpiony.
> Kawałki poniżej są ułożone w kolejności zależności. Tabela „At a glance" jest indeksem.

## Vision recap

Administrator wspólnoty nie jest w stanie domknąć uchwały: zebranie odbywa się raz w roku,
kworum rzadko się zbiera, a około 85% spraw nie przechodzi z powodu braku wymaganej liczby
głosów — nie z powodu sprzeciwu. Kluczowe przeformułowanie problemu: produkt nie ma pomagać
ludziom _decydować_, tylko sprawić, żeby głosy w ogóle zostały oddane. MVP to moduł bazowy
(rejestr lokali i właścicieli) plus moduł głosowania: administrator loguje się i prowadzi
uchwałę, właściciel oddaje jeden ważony udziałem głos z indywidualnego linku otrzymanego
e-mailem, bez konta i bez hasła.

## North star

**S-03: Właściciel oddaje z indywidualnego linku ważony udziałem głos „za" albo „przeciw"** —
to jedyny moment, w którym teza produktu („blokadą jest nieobecność, a nie sprzeciw")
potwierdza się albo upada; wszystko inne ma znaczenie tylko wtedy, gdy ten klik następuje.

> „North star" (gwiazda przewodnia) oznacza tu: najmniejszy kawałek działający od początku do
> końca, którego udane dowiezienie dowodzi, że główna teza produktu jest prawdziwa — dlatego
> ustawiony jest tak wcześnie, jak pozwalają na to jego zależności, a nie tam, gdzie
> wypadłby przy równomiernym rozłożeniu pracy. Powiązane pojęcie używane niżej w polach
> **Risk**: _najbardziej ryzykowne założenie_ to takie, którego obalenie unieważnia produkt,
> a nie takie, które tylko podnosi koszt.

## At a glance

| ID    | Change ID                      | Outcome (użytkownik może…)                                                                                                                         | Prerequisites    | PRD refs                                 | Status   |
| ----- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ---------------------------------------- | -------- |
| F-01  | `production-admin-access`      | (fundament) administrator loguje się na produkcji kontem założonym w bazie, ekran logowania mówi skąd je wziąć, a brak sekretu przestaje być cichy | —                | Access Control, Guardrails               | done     |
| F-02  | `transactional-mail-channel`   | (fundament) z Workera wychodzi jedna prawdziwa wiadomość, przez natywny binding Cloudflare, z własnej domeny                                       | —                | FR-002, FR-004                           | done     |
| S-01  | `building-create`              | administrator zakłada budynek prostym formularzem (nazwa, miejscowość, ulica z numerem), a schemat jest przygotowany na dokładanie kolejnych pól   | F-01             | US-02, FR-011                            | done     |
| S-01b | `building-units-import`        | administrator importuje z pliku do istniejącego budynku rejestr lokali z metrażem i właścicielami, a wyliczone udziały sumują się do 100%          | S-01             | US-02, FR-001, FR-006                    | done     |
| S-02  | `resolution-with-voting-links` | administrator tworzy uchwałę, uruchamia nad nią głosowanie i dysponuje indywidualnym linkiem dla każdego lokalu                                    | S-01b            | US-02, FR-003                            | proposed |
| S-03  | `share-weighted-vote`          | właściciel odczytuje treść uchwały i oddaje z linku ostateczny głos ważony udziałem swojego lokalu                                                 | S-02             | US-01, FR-005, FR-006                    | proposed |
| S-04  | `voting-link-email-fanout`     | wszyscy właściciele w budynku otrzymują e-mailem swój indywidualny link do głosowania                                                              | S-02, F-02       | US-02, FR-002, FR-004                    | proposed |
| S-05  | `live-tally-and-outcome`       | administrator widzi na żywo bilans udziałów i brakującą część do progu, a uchwała sama zostaje podjęta albo upada                                  | S-03             | US-02, FR-007, FR-008                    | proposed |
| S-06  | `finished-votes-archive`       | administrator przegląda zakończone głosowania i odtwarza, które udziały złożyły się na wynik                                                       | S-05             | FR-009, NFR (ślad)                       | proposed |
| S-07  | `dashboard-help-section`       | zalogowany administrator wchodzi do modułu „Pomoc" pod trasą `/help` i wie, do kogo zgłosić problem — w v1 wyłącznie adres e-mail dewelopera       | F-01             | — (poza PRD, patrz Unknowns)             | proposed |
| S-08  | `landing-page-identity`        | osoba wchodząca na stronę startową widzi nazwę aplikacji i krótki opis, co ta aplikacja robi — zamiast strony startera                             | —                | Vision, US-02                            | proposed |
| S-09  | `multi-module-ui`              | administrator porusza się po interfejsie, który pokazuje aplikację jako zestaw modułów, a nie jako jeden ekran z listą budynków                    | S-05, S-07, S-08 | Vision (moduł bazowy + moduł głosowania) | proposed |

## Streams

Pomoc nawigacyjna — grupuje elementy dzielące ten sam łańcuch zależności. Kolejność wiążąca
nadal wynika z grafu zależności poniżej; ta tabela to proponowana kolejność czytania
równoległych torów.

| Stream | Theme               | Chain                              | Note                                                                                                                                                                                                                                                                                                                                    |
| ------ | ------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A      | Rejestr i uchwała   | `F-01` → `S-01` → `S-01b` → `S-02` | Tor administratora. Wszystko inne z niego wyrasta — bez rejestru i uchwały nie ma czego ani komu wysyłać. `S-01` stawia schemat i kontrakt dostępu na jednej małej tabeli, `S-01b` napełnia go rejestrem.                                                                                                                               |
| B      | Głos i wynik        | `S-03` → `S-05` → `S-06`           | Dołącza do toru A przy `S-02`. Zawiera gwiazdę przewodnią `S-03` i domyka pętlę aż do śladu audytowego.                                                                                                                                                                                                                                 |
| C      | Kanał pocztowy      | `F-02` → `S-04`                    | `F-02` zamknięte 2026-08-01 — tor jest bezczynny do `S-02`, przy którym `S-04` dołącza do toru A. Domena i plan Workers Paid są już opłacone, więc `S-04` nie niesie już warunków wstępnych poza repozytorium.                                                                                                                          |
| D      | Prezentacja i pomoc | `S-08` → `S-07` → `S-09`           | Tor dodany 2026-08-02. Nie dotyka domeny ani schematu, więc biegnie **równolegle do wszystkiego** i nie blokuje niczego w torach A–C. `S-08` i `S-07` są rozłączne i można je zrobić w dowolnej kolejności; `S-09` domyka tor i celowo stoi na końcu całej roadmapy, bo dopiero po `S-05` istnieje więcej niż jeden moduł do pokazania. |

## Baseline

Co jest już w kodzie na dzień `2026-08-01` (rozpoznane automatycznie, potwierdzone przez
użytkownika). Fundamenty poniżej zakładają obecność tych elementów i **nie** budują ich od nowa.

- **Frontend:** present — Astro 6 + React 19 + Tailwind 4 + shadcn/ui; `src/layouts/Layout.astro`, `src/components/ui/`, gotowe formularze auth w `src/components/auth/`.
- **Backend / API:** partial — `output: "server"`, każda trasa renderowana serwerowo; trasy API istnieją wyłącznie dla auth i zdrowia (`src/pages/api/auth/*`, `src/pages/api/health.ts`). Zero tras domenowych.
- **Data:** absent — jest `supabase/config.toml`, ale brak katalogu `supabase/migrations/`, brak jakiegokolwiek schematu, brak polityk dostępu, brak wygenerowanych typów. Zero tabel.
- **Auth:** partial — klient Supabase SSR (`src/lib/supabase.ts`), middleware ustawia `context.locals.user`, bramka `PROTECTED_ROUTES = ["/dashboard"]` w `src/middleware.ts`, endpointy `signin`/`signup`/`signout`. Ograniczenia: sekrety są `optional: true`, więc brak konfiguracji daje `null` client i ciche no-opy. Od 2026-08-01 obowiązuje decyzja, że konta administratorów zakłada się **bezpośrednio w bazie danych, przez panel Supabase** (Authentication → Users → Add user), a aplikacja nie ma rejestracji (PRD `## Access Control`), więc ścieżka rejestracja → potwierdzenie e-mailem → logowanie **nie jest wymaganiem produktowym**: `signup` ze startera został usunięty przez `F-01` (2026-08-01), a Site URL i `auth.email.enable_confirmations` przestały być zakresem F-01. Jedyna ścieżka wejścia to formularz logowania z kontem założonym w panelu — na czas MVP `test@test.com` / `Test123!`, którego dane ekran logowania podaje wprost. Zalogowanie się tym kontem na produkcji zostało potwierdzone 2026-08-01 (`F-01`, faza 3).
- **Deploy / infra:** present — Cloudflare Workers, aplikacja żyje pod `estate-manager.estate-manager.workers.dev`; `.github/workflows/ci.yml` (lint + build) oraz `deploy.yml` (auto-deploy przy push do `main`; od `F-01` kończy się asercją `/api/health`, a bramka „lint przed deployem" została dowiedziona negatywnym przypadkiem 2026-08-01).
- **Observability:** partial — Workers Logs włączone w `wrangler.jsonc`, retencja 3 dni na planie Free; sonda `/api/health` zwraca 200/503 zależnie od dostępności Supabase. Brak śledzenia błędów, brak logu aplikacyjnego, brak alertowania o zadaniach w tle.

## Foundations

### F-01: Działający dostęp administratora na produkcji

- **Outcome:** (fundament) na produkcji da się zalogować kontem założonym w panelu Supabase — na czas MVP kontem testowym, którego dane ekran logowania podaje wprost razem z informacją, że konta zakłada się w panelu — konto to ma uprawnienia administratora, w aplikacji nie ma już ścieżki rejestracji, a brak wymaganej konfiguracji Supabase przestaje przechodzić jako zielony deploy.
- **Change ID:** `production-admin-access`
- **PRD refs:** `## Access Control` (konta zakładane w panelu Supabase, konto testowe `test@test.com` / `Test123!` pokazywane na ekranie logowania, każdy użytkownik w bazie jest w v1 administratorem), `## Non-Goals` (bez samodzielnej rejestracji, bez modelu ról, bez ukrywania danych konta testowego), `## Success Criteria` → Guardrails (nikt spoza rejestru nie oddaje głosu), `## Open Questions` nr 3
- **Unlocks:** `S-01` i przez nią cały tor administratora (`S-02`, `S-05`, `S-06`) — żaden z tych kawałków nie jest weryfikowalny na produkcji, dopóki nie da się tam zalogować. Domyka też ryzyko opisane w `context/foundation/infrastructure.md` §G6 („udany deploy niedziałającej aplikacji").
- **Prerequisites:** —
- **Parallel with:** F-02
- **Blockers:** —
- **Unknowns:**
  - ROZSTRZYGNIĘTE 2026-08-01: konta administratorów zakłada się w panelu Supabase (Authentication → Users → Add user), czyli bezpośrednio w bazie; aplikacja nie ma i nie będzie miała ekranu rejestracji. F-01 nie buduje pod to żadnego kodu — to procedura ręczna, do opisania w README. Konsekwencja dla zakresu: ścieżka potwierdzania adresu e-mail wypada z F-01 (Site URL i `auth.email.enable_confirmations` przestają być tu blokerem), a wchodzi usunięcie `signup` ze startera oraz komunikat na ekranie logowania z danymi konta testowego.
  - Czym zastąpić konto testowe `test@test.com` / `Test123!` przed wdrożeniem z prawdziwym rejestrem, kto ma dostęp do panelu Supabase i jak nadawać oraz resetować hasła, skoro aplikacja nie ma resetu? — Owner: użytkownik. Śledzone jako PRD §Open Questions nr 3. Block: no (nie blokuje PoC na danych testowych).
- **Risk:** Sekrety zadeklarowane jako `optional` były świadomym wyborem startera i są niebezpieczne od momentu, w którym aplikacja przestaje być szkieletem: rotacja klucza albo deploy z powłoki bez bindingów daje Worker zwracający 200 i puste strony. Sekwencjonowany jako pierwszy, bo cel „sygnał od użytkowników" zakłada obserwowanie produkcji, a nie środowiska lokalnego. Zakres celowo minimalny — to nie jest przebudowa uwierzytelniania, tylko doprowadzenie istniejącej ścieżki do stanu sprawdzalnego i głośno zawodzącego. Drugie ryzyko, dołożone 2026-08-01 wraz z decyzją o jawnym koncie testowym: dane logowania są wypisane na ekranie logowania, a każde konto w bazie jest kontem administratora z wglądem w rejestr i dane kontaktowe właścicieli — do PoC na danych testowych to wystarcza, przed wdrożeniem z prawdziwym rejestrem nie (PRD `## Open Questions` nr 3).
- **Status:** done

### F-02: Działający kanał poczty transakcyjnej

- **Outcome:** (fundament) kanał poczty transakcyjnej jest podłączony, a z Workera wychodzi jedna prawdziwa wiadomość i dociera do skrzynki testowej — nadana z **własnej domeny**, przez natywny binding Cloudflare Email Service, bez zobowiązania co do tego, w którym folderze wyląduje.
- **Change ID:** `transactional-mail-channel`
- **PRD refs:** FR-002, FR-004
- **Unlocks:** `S-04` (rozsyłka indywidualnych linków). Usuwa jedyne niewiadome, które mogłyby uczynić `S-04` niewykonalną: czy z tego runtime'u da się w ogóle wysłać pocztę i przez jaki interfejs.
- **Prerequisites:** — (w sensie zależności między kawałkami; ma natomiast ręczne warunki wstępne, patrz Unknowns)
- **Parallel with:** F-01, S-01, S-02, S-03
- **Blockers:** —
- **Unknowns:**
  - ROZSTRZYGNIĘTE 2026-08-01: dostawcą jest **Cloudflare Email Service (Email Sending)**, wołany natywnym bindingiem `send_email`, a nie po HTTP z kluczem API. Pełne uzasadnienie, porównanie ośmiu dostawców i ścieżka odwrotu (Resend) w `context/changes/transactional-mail-channel/research.md`. Trzy konsekwencje dla zakresu, wszystkie świadomie przyjęte: (1) **domena testowa dostawcy znika z zakresu** — Cloudflare takiej nie ma, więc `F-02` obejmuje zakup domeny w Cloudflare Registrar i `wrangler email sending enable`; (2) **wymagany jest plan Workers Paid ($5/mies.)**, dziś jesteśmy na Free — `infrastructure.md` niezależnie postuluje ten plan z powodu limitu 10 ms CPU, więc koszt nie jest przypisany wyłącznie poczcie; (3) **produkt jest w becie**, przyjęte na kanale, na którym stoi cała teza produktu.
  - ZAWĘŻONE 2026-08-01: **skala PoC to 100 wiadomości dziennie** — decyzja produktowa, liczba dobrana z zapasem, żeby nie przeszkadzała w budowie PoC. Nadal jest to liczba nasza, nie Cloudflare'a: ich kwoty nie da się ustawić ani odczytać z `wrangler`, a w dokumentacji jej wciąż nie ma (istnieje tylko kod błędu `E_DAILY_LIMIT_EXCEEDED`). Decyzja nie zamyka więc niewiadomej, tylko ją **zawęża**: z „jaki jest limit?" do „czy limit wynosi co najmniej 100?", na co odpowiada jedna strona panelu albo `GET /accounts/{account_id}/email/sending/limits`. To jedyna pozostała rzecz, która może tu ugryźć, i kosztuje minutę — do sprawdzenia w ramach `F-02`, przy otwartym koncie. Uzasadnienie i konsekwencje: `context/changes/transactional-mail-channel/docs-cloudflare-email.md` §9. — Owner: zespół. Block: no (nie blokuje jednej wiadomości).
  - ZAMKNIĘTE 2026-08-01 w ramach `F-02`: **rzeczywisty limit Cloudflare to 200 wiadomości dziennie** (odczytany z panelu; `wrangler email sending settings` go nie pokazuje). Założenie „ich kwota wynosi co najmniej 100" jest więc spełnione z dwukrotnym zapasem. Konsekwencja dla `S-04`: rozsyłka do budynku 70 lokali **oraz** pełna runda przypomnień (`FR-010`) tego samego dnia — łącznie 140 wiadomości — mieszczą się w limicie, czego pułap 100 nie obejmował. Licznik dzienny nadal nie jest potrzebny.
  - USTALONE 2026-08-01: **budynek PoC ma 70 lokali**. Wcześniejsze dokumenty planują wokół 180–200 lokali (pre-mortem i dissent D3 w `infrastructure.md`); to datowane zapisy rozumowania, zostają jak są, ale liczbą roboczą dla wszystkiego planowanego od teraz jest 70. Razem ze 100 wiadomościami dziennie daje to rozsyłkę do budynku w jednej dobie z **zapasem 30 wiadomości**, który pochłania ponowienia po `E_DELIVERY_FAILED`, lokal dodany później i powtórne uruchomienie. Konsekwencja dla zakresu `S-04`: **licznik dzienny nie jest potrzebny na czas PoC** — wystarczy obsłużyć `E_DAILY_LIMIT_EXCEEDED` jako błąd pokazywany administratorowi, a nie ponawiany. Mierzenie własnych wysyłek staje się warte budowy dopiero, gdy prawdziwy budynek przekroczy pułap. Jedyny przypadek, który nadal go przekracza — pełna runda przypomnień (`FR-010`) tego samego dnia co rozsyłka — dotyczy funkcji nice-to-have, odłożonej i naturalnie wypadającej innego dnia. — Owner: użytkownik. Block: no.
- **Risk:** Zakres odchudzony 2026-08-01, gdy dostarczalność została przeniesiona do v2. Fundament przestał dotyczyć tego, **czy wiadomość dojdzie do skrzynki głównej**, a zaczął dotyczyć tego, **czy w ogóle da się ją wysłać z tego runtime'u** — to drugie nadal potrafi zatrzymać `S-04`, i to po wdrożeniu, a nie na maszynie deweloperskiej, bo `astro dev` i produkcja rozjeżdżają się dokładnie na tych interfejsach. Zakres celowo minimalny: jedna wiadomość, nie rozsyłka. Świadomie przyjęta konsekwencja: część właścicieli nie zobaczy linku, więc frekwencja zmierzona w PoC jest dolnym oszacowaniem możliwości kanału elektronicznego, a nie jego sufitem. Ryzyko dołożone przy wyborze dostawcy (2026-08-01): binding likwiduje klucz API, czyli całą klasę awarii „zielony deploy, cichy no-op", która stała za `F-01` — ale **nie likwiduje potrzeby sprawdzenia**, że binding istnieje. Brakujący albo źle nazwany `env.EMAIL` nadal zawodzi dopiero w runtime, więc musi być wystawiony przez `src/lib/config-status.ts` na równi z Supabase.
- **Status:** done (2026-08-01)

## Slices

> **Podział `S-01` (2026-08-01).** Pierwotne `S-01: Import rejestru budynku` (`building-registry-import`)
> obejmowało jednym kawałkiem założenie budynku i wczytanie do niego lokali. Rozbite na `S-01`
> i `S-01b`, bo to dwa osobno dowożalne kroki o różnym ciężarze: pierwszy to formularz na dwóch
> polach, drugi to parsowanie pliku i arytmetyka udziałów. Numeracja `S-02`–`S-06` **celowo
> nietknięta** — `S-03` i `S-04` są cytowane w zamkniętych planach, w `CLAUDE.md` i w komentarzach
> w kodzie (`src/lib/email.ts`, `src/pages/api/health.ts`), więc przenumerowanie unieważniłoby
> zapisy, których nie wolno edytować wstecz. Stąd `S-01b`, a nie przesunięcie całej listy.

### S-01: Założenie budynku

- **Outcome:** administrator zakłada budynek prostym formularzem — nazwa, miejscowość, ulica z numerem — i widzi go zapisanego; zestaw pól jest tak dobrany, żeby dołożenie kolejnego (NIP wspólnoty, rok budowy, numer księgi) było jedną migracją i jednym polem formularza, bez przebudowy tabeli ani ścieżki zapisu.
- **Change ID:** `building-create`
- **PRD refs:** US-02, FR-011
- **Prerequisites:** F-01
- **Parallel with:** — (F-02 zamknięte)
- **Blockers:** —
- **Unknowns:**
  - Czy nazwa budynku ma być unikalna, i co się dzieje przy próbie założenia drugiego budynku o tej samej nazwie i adresie? — Owner: użytkownik. Block: no.
  - ROZSTRZYGNIĘTE 2026-08-02: adres nie jest jednym polem tekstowym, tylko dwoma — miejscowość oraz ulica z numerem. Powód: pojedyncze pole „adres" jest nieprzeszukiwalne i nieporównywalne, a rozbicie na pustej tabeli kosztuje jedną kolumnę; wykonane później byłoby migracją danych z parsowaniem wolnego tekstu. Unikalność obejmuje wtedy trójkę (nazwa, miejscowość, ulica).
  - PRZYJĘTE ZAŁOŻENIE 2026-08-01: formularz **zakłada** budynki, ale produkt nadal pracuje na jednym — `## Non-Goals` PRD („bez obsługi wielu budynków") pozostaje w mocy i nic poniżej `S-01b` nie obsługuje portfela. Formularz jest tu sposobem, w jaki ten jeden budynek powstaje — zamiast migracji albo seeda — a nie zapowiedzią wielobudynkowości. Do potwierdzenia przez użytkownika, gdyby intencja była inna. — Owner: użytkownik. Block: no.
- **Risk:** Pierwszy kawałek, który zakłada tabele — a warstwa danych jest dziś pusta, więc to **tutaj**, przy dwóch polach, a nie później przy pełnym rejestrze, powstaje kontrakt bezpieczeństwa dla całego produktu: każda tabela z włączonym zabezpieczeniem na poziomie wiersza, po jednej polityce na operację i rolę, z rolą anonimową włącznie — bo właściciel głosuje bez sesji. To jest właściwy powód, dla którego ten kawałek stoi osobno: ustawienie wzorca na najmniejszej możliwej tabeli jest tańsze i łatwiejsze do sprawdzenia niż dopisywanie go do rejestru, który już ma dane. Tu też pada pierwsze prawdziwe uruchomienie `supabase/seed.sql`, który od `F-01` leży nieuruchomiony (Docker był wtedy niedostępny). Wymaganie rozszerzalności jest sprawdzalne, nie deklaratywne: kolumny opisowe budynku nienazwane w `FR-011` mają być dokładane bez migracji zmieniającej istniejące wiersze.
- **Status:** done (2026-08-02)
- **Zrealizowane:** pierwsza migracja w historii projektu (`supabase/migrations/20260801222109_create_buildings.sql`) zakłada `public.buildings` z adresem w dwóch kolumnach (`city`, `street` z numerem), włącza zabezpieczenie na poziomie wiersza i definiuje osiem polityk — cztery dla roli zalogowanej i cztery odmawiające roli anonimowej. Kontrakt sprawdzony przez PostgREST, nie tylko odczytany z katalogu: anonim dostaje `[]` na odczycie i `42501` na zapisie. `supabase/seed.sql` uruchomił się po raz pierwszy od `F-01` i jego założenia o `auth.users` się potwierdziły — zweryfikowane logowaniem, nie zapytaniem. Ekrany: `/buildings` (lista z pustym stanem) oraz `/buildings/new` (formularz), obie ścieżki w `PROTECTED_ROUTES`. Migracja wgrana na produkcję ręcznie (`db push`) — nic w CI tego nie robi, residual **G14** zostaje otwarty.
- **Do przemyślenia poza tym kawałkiem:** interfejs jest teraz dwujęzyczny (nowe ekrany po polsku, ekrany logowania ze startera po angielsku), a odrzucony formularz nie zachowuje wpisanych wartości — obie rzeczy świadomie zostawione jako osobne zmiany.

### S-01b: Import lokali do istniejącego budynku

- **Outcome:** administrator wybiera założony wcześniej budynek, importuje z pliku listę lokali z metrażem oraz przypisanymi do nich właścicielami i widzi rejestr, w którym wyliczone z metrażu udziały sumują się do 100%.
- **Change ID:** `building-units-import`
- **PRD refs:** US-02, FR-001, FR-006
- **Prerequisites:** S-01 — import celuje w **istniejący** budynek, więc bez `S-01` nie ma do czego importować
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - W jakim formacie zarządca posiada dziś listę lokali (arkusz, CSV, wydruk z innego systemu) i czy da się ustalić jeden format wejściowy? — Owner: użytkownik. Block: no.
  - Jak zachować się przy sumie udziałów różnej od 100% po zaokrągleniach — odrzucić import czy przyjąć z ostrzeżeniem? Zaokrąglenia rozstrzygną uchwałę przy wyniku bliskim progu (kontrargument odnotowany przy FR-006). — Owner: użytkownik. Block: no.
  - Co się dzieje przy powtórnym imporcie do budynku, który ma już lokale — odrzucenie, zastąpienie czy dopisanie? Rejestr jest w v1 statyczny (`## Non-Goals`), więc najprostszą odpowiedzią jest odrzucenie, ale nie jest ona rozstrzygnięta. — Owner: użytkownik. Block: no.
- **Risk:** Tu mieszka cała trudność pierwotnego `S-01`: parsowanie pliku o nieustalonym formacie i arytmetyka udziałów, od której zależy poprawność każdego późniejszego rozstrzygnięcia uchwały. Kontrakt bezpieczeństwa jest już postawiony przez `S-01`, więc ten kawałek go **stosuje**, a nie wymyśla — tabele lokali i właścicieli dziedziczą wzorzec ograniczenia zakresem budynku. Bariera PRD „dane właścicieli nie wychodzą poza budynek" jest egzekwowana właśnie tutaj, na poziomie polityk dostępu, nie w interfejsie: to pierwszy moment, w którym w bazie pojawiają się cudze dane kontaktowe.
- **Status:** done (2026-08-02)

### S-02: Uchwała i indywidualne linki do głosowania

- **Outcome:** administrator tworzy uchwałę, uruchamia nad nią głosowanie i od tego momentu każdemu lokalowi w budynku odpowiada indywidualny link, który administrator może odczytać i przekazać.
- **Change ID:** `resolution-with-voting-links`
- **PRD refs:** US-02, FR-003
- **Prerequisites:** S-01b — link powstaje per lokal, więc potrzebny jest zaimportowany rejestr, a nie sam budynek
- **Parallel with:** F-02
- **Blockers:** —
- **Unknowns:**
  - Czy link jest wieczny (głosowanie nie ma terminu końcowego, więc nie ma naturalnej daty wygaśnięcia), czy unieważnia się w momencie rozstrzygnięcia uchwały? — Owner: użytkownik. Block: no.
- **Risk:** Wydzielony z rozsyłki celowo — dzięki temu gwiazda przewodnia `S-03` może zostać sprawdzona na jednym ręcznie przekazanym linku, zanim kanał pocztowy będzie gotowy, i nie czeka na `F-02`. Link jest jedynym mechanizmem identyfikującym głosującego (PRD, otwarte pytanie nr 1), więc jego wytworzenie jest miejscem, w którym zapada decyzja o sile bariery „nikt spoza rejestru nie oddaje głosu".
- **Status:** proposed

### S-03: Właściciel oddaje ważony głos z linku — **gwiazda przewodnia**

- **Outcome:** właściciel otwiera otrzymany indywidualny link, czyta treść uchwały, oddaje głos „za" albo „przeciw" bez zakładania konta i bez logowania, dostaje potwierdzenie zapisania głosu, a udział jego lokalu jest doliczony do wyniku; głos jest ostateczny.
- **Change ID:** `share-weighted-vote`
- **PRD refs:** US-01, FR-005, FR-006
- **Prerequisites:** S-02
- **Parallel with:** F-02, S-04
- **Blockers:** —
- **Unknowns:**
  - Co widzi właściciel, który otworzy swój link po raz drugi — potwierdzenie własnego głosu czy komunikat, że głosowanie jest dla niego zamknięte? PRD gwarantuje jedynie, że głos jest nieodwracalny. — Owner: użytkownik. Block: no.
- **Risk:** Najbardziej ryzykowne założenie całego produktu — czyli takie, którego obalenie unieważnia produkt — brzmi: właściciel domyślnie niezainteresowany i nieświadomy swojego prawa głosu jednak kliknie i zagłosuje. Ten kawałek jest jedynym miejscem, w którym to założenie da się sprawdzić, dlatego stoi tak wcześnie, jak pozwalają zależności, i przed automatyzacją rozsyłki. Egzekwowana tu jest też bariera „właściciel nie poznaje danych innych właścicieli": strona głosowania nie może ujawnić ani metraży, ani udziałów, ani cudzych głosów, mimo że stoi na tym samym rejestrze co panel administratora.
- **Status:** proposed

### S-04: Rozesłanie linków e-mailem

- **Outcome:** administrator uruchamia rozsyłkę i wszyscy właściciele w budynku otrzymują wiadomość z własnym indywidualnym linkiem do głosowania.
- **Change ID:** `voting-link-email-fanout`
- **PRD refs:** US-02, FR-002, FR-004
- **Prerequisites:** S-02, F-02 — przy czym `F-02` dostarcza tu więcej niż sam kod: własną domenę nadawczą i plan Workers Paid, bez których rozsyłka nie ruszy
- **Parallel with:** S-03, S-05
- **Blockers:** —
- **Unknowns:**
  - Co robi system z lokalami bez adresu e-mail w rejestrze — pomija cicho, czy pokazuje administratorowi listę do obejścia tradycyjnego? PRD dopuszcza kanał papierowy jako równoległy, ale nie mówi, czy aplikacja go sygnalizuje. — Owner: użytkownik. Block: no.
  - Czy rozsyłka do budynku mieści się w jednym wywołaniu Workera, czy wymaga rozłożenia w czasie? `infrastructure.md` §D3 i §G11 wskazują, że to zadanie ma kształt wsadowy, a runtime jest zakresowany do pojedynczego żądania. Zaostrzone 2026-08-01 wyborem dostawcy: Cloudflare Email Service **nie ma endpointu wsadowego**, więc budynek to tyle osobnych wywołań `env.EMAIL.send()`, ile ma lokali. Po ustaleniu budynku PoC na **70 lokali** (patrz `F-02`) pytanie brzmi: czy 70 kolejnych wywołań bindingu mieści się w jednym żądaniu i czy liczą się one do limitu podzapytań. Mniejszy budynek poprawia szanse, ale nie odpowiada — a że pułap dzienny (100) przestał wymuszać rozłożenie rozsyłki w czasie, limit podzapytań wraca na miejsce pytania wiążącego. To limit, który ujawnia się dopiero na produkcji. — Owner: zespół. Block: no.
  - Jak zapewnić, że ponowione uruchomienie rozsyłki nie wyśle właścicielom drugiego linku do tej samej uchwały? Cloudflare **nie ma kluczy idempotencji**, więc stan wysyłki per lokal musi powstać w bazie i rozsyłka musi wznawiać, a nie zaczynać od nowa. Częściowo darmowe: ten sam zapis jest potrzebny dla śladu audytowego `S-06` i dla odpowiedzi na pytanie o lokale bez adresu. — Owner: zespół. Block: no.
- **Risk:** Sekwencjonowany po gwieździe przewodniej celowo: jeśli `S-03` pokaże, że mechanika głosowania nie działa, automatyzacja rozsyłki byłaby pracą włożoną w powiększanie zasięgu wadliwej ścieżki. Jednocześnie to ten kawałek zamienia pojedynczy sprawdzony głos w prawdziwy sygnał od użytkowników — bez niego kryterium sukcesu (ponad 50% udziałów wyłącznie kanałem elektronicznym) jest niemierzalne. Po przeniesieniu dostarczalności do v2 pomiar jest **zaniżony w nieznanym stopniu**: nie wiadomo, ilu właścicieli nie dostało linku do skrzynki głównej, więc niespełnione kryterium sukcesu nie rozstrzyga, czy zawiodła teza produktu, czy kanał nadawczy. Warto przy pierwszym prawdziwym budynku zebrać choćby zgrubny sygnał zwrotny („czy dostałeś maila"), bo bez niego wynik PoC jest nieinterpretowalny w jedną ze stron.
- **Status:** proposed

### S-05: Bilans udziałów na żywo i rozstrzygnięcie uchwały

- **Outcome:** administrator widzi na bieżąco, jaka część udziałów już zagłosowała i ile brakuje do progu, a uchwała zostaje automatycznie oznaczona jako podjęta, gdy udziały „za" przekroczą 50% wszystkich udziałów w budynku, albo jako upadła, gdy przekroczą je udziały „przeciw".
- **Change ID:** `live-tally-and-outcome`
- **PRD refs:** US-02, FR-007, FR-008
- **Prerequisites:** S-03
- **Parallel with:** S-04
- **Blockers:** —
- **Unknowns:**
  - Czy w momencie rozstrzygnięcia administrator ma zostać powiadomiony, czy wystarczy, że zobaczy stan przy kolejnym wejściu? PRD nie przewiduje żadnego powiadomienia dla administratora. — Owner: użytkownik. Block: no.
- **Risk:** To jedyna reguła w produkcie, która musi być dowodliwie poprawna — próg liczony jest od wszystkich udziałów w nieruchomości, a nie od oddanych, więc pomyłka w mianowniku przesuwa wynik uchwały. `infrastructure.md` §D9 odnotowuje, że runtime nie utrzymuje połączeń do bazy, więc transakcyjne domknięcie progu jest ograniczeniem narzuconym przez platformę dokładnie na tym fragmencie logiki. Osobno: §G1 wskazuje, że koszt renderowania bilansu rośnie z ilością danych, a nie z ruchem — ten widok jest pierwszym miejscem, w którym to się ujawni.
- **Status:** proposed

### S-06: Przegląd zakończonych głosowań

- **Outcome:** administrator przegląda listę zakończonych głosowań wraz z wynikiem i dla dowolnej zakończonej uchwały odtwarza, które udziały złożyły się na rezultat.
- **Change ID:** `finished-votes-archive`
- **PRD refs:** FR-009, `## Non-Functional Requirements` (dla każdej zakończonej uchwały da się w dowolnym momencie wykazać, które udziały złożyły się na wynik), `## Success Criteria` → Guardrails (każdy głos jest policzalny i ma ustalony ślad)
- **Prerequisites:** S-05
- **Parallel with:** S-04
- **Blockers:** —
- **Unknowns:**
  - Jak głęboki ma być ślad przy zachowaniu bariery „właściciel nie poznaje głosów innych właścicieli" — czy administrator widzi rozbicie na konkretne lokale, czy wyłącznie sumy? PRD wymaga odtwarzalności wyniku, ale nie rozstrzyga, komu wolno zobaczyć rozbicie. — Owner: użytkownik. Block: no.
- **Risk:** Bariera „każdy głos jest policzalny i ma ustalony ślad" jest wymaganiem trwałym, nie ekranem — jeśli zapis śladu nie powstanie razem z pierwszymi głosami w `S-03` i `S-05`, ten kawałek nie będzie miał czego pokazać dla uchwał już rozstrzygniętych. Osobno: `infrastructure.md` §D5 i §G3 wskazują, że platforma nie pomaga tu w niczym — retencja logów wynosi 3 dni, więc cały ślad musi mieszkać w bazie, a tabela śladu jest najszybciej rosnącą i najrzadziej indeksowaną tabelą schematu.
- **Status:** proposed

### S-07: Moduł „Pomoc"

- **Outcome:** zalogowany administrator wchodzi do **modułu „Pomoc"** pod własną trasą `/help` i wie, do kogo zgłosić problem. W v1 moduł zawiera **dokładnie jedno zdanie** — „W przypadku problemów skontaktuj się z deweloperem: tomek.maq@gmail.com" — ale jest osobnym miejscem w aplikacji, a nie blokiem na cudzym ekranie, więc dołożenie kolejnych treści (FAQ, instrukcja importu, opis progu 50%, zgłoszenie błędu) jest dopisaniem bloku na istniejącej stronie, bez zakładania nowej trasy i bez ruszania nawigacji.
- **Change ID:** `dashboard-help-section`
- **PRD refs:** — brak. To pierwszy element roadmapy, który nie wywodzi się z żadnego wymagania PRD; wchodzi jako decyzja produktowa podjęta 2026-08-02. Patrz Unknowns.
- **Prerequisites:** F-01 (panel istnieje i jest za logowaniem)
- **Parallel with:** wszystko — nie dotyka schematu, domeny ani ścieżki zapisu
- **Blockers:** —
- **Unknowns:**
  - ROZSTRZYGNIĘTE 2026-08-02: treścią v1 jest **sam adres e-mail dewelopera**, bez imienia i nazwiska, bez telefonu i bez deklaracji czasu odpowiedzi. Pełne brzmienie: „W przypadku problemów skontaktuj się z deweloperem: tomek.maq@gmail.com". Adres ma być odnośnikiem `mailto:`, żeby zgłoszenie było jednym kliknięciem, a nie przepisywaniem z ekranu. To zamyka jedyną niewiadomą blokującą ten kawałek.
  - ROZSTRZYGNIĘTE 2026-08-02: sekcja jest widoczna **wyłącznie dla zalogowanego użytkownika**. Nie pojawia się na stronie startowej ani na żadnej trasie publicznej — w szczególności nie na `/vote/<token>` z `S-02`, mimo że właściciel głosujący z linku nie ma sesji i to on najpewniej utknie. Konsekwencja przyjęta świadomie: właściciel, który ma problem z głosowaniem, nie znajdzie w aplikacji drogi kontaktu i pozostaje mu telefon do zarządcy — czyli ta sama droga, którą PRD `## Non-Goals` przewiduje dla obiekcji wobec uchwały. Gdyby to się okazało realnym problemem po pierwszym prawdziwym głosowaniu, właściwą odpowiedzią jest osobny, minimalny kontakt na stronie głosowania, a nie otwarcie tej sekcji dla anonimów.
  - ROZSTRZYGNIĘTE 2026-08-02: „Pomoc" jest **osobnym modułem pod własną trasą `/help`**, a nie blokiem na `/dashboard`. Powód podany przez właściciela produktu: dziś jest tam sam adres, ale w kolejnych iteracjach treści przybędzie, a treść, która rośnie na cudzym ekranie, prędzej czy później wymusza przeprowadzkę — taniej założyć jej własne miejsce od razu, przy jednym zdaniu, niż przenosić rozrośnięty blok później. Zmienia to wcześniejsze zawężenie z tego samego dnia, które wskazywało blok na `/dashboard` jako wariant domyślny; decyzja właściciela produktu je zastępuje.
  - **Konsekwencja techniczna, nie do pominięcia:** `/help` musi zostać dopisana do `PROTECTED_ROUTES` w `src/middleware.ts`. Ta tablica jest **jedyną bramką autoryzacji w tej aplikacji** — nowa trasa jest publiczna, dopóki się w niej nie pojawi, a regresja w tym miejscu nie jest widoczna na ekranie: strona wygląda tak samo dla zalogowanego i dla anonima. Skoro ustaliliśmy, że moduł ma być widoczny wyłącznie po zalogowaniu, ten jeden wpis **jest** tym ustaleniem; wszystko inne w tym kawałku to tekst.
  - **Zakres słowa „moduł" — do rozstrzygnięcia przy `S-09`, nie tutaj.** PRD `## Vision` używa słowa „moduł" w znaczeniu handlowym: pakiety, które odbiorca dobiera pod siebie (rachunki, przeglądy, ubezpieczenia), przy jednym module obowiązkowym. „Pomoc" nie jest czymś, z czego klient rezygnuje, więc przyjęte znaczenie jest **nawigacyjne**: własne miejsce w interfejsie, obecne zawsze, nie pozycja z oferty. Zapisane wprost, żeby `S-09` nie wystawił „Pomocy" w jednym rzędzie z modułami, których nie ma. — Owner: użytkownik. Block: no (nie blokuje `S-07`; przesądza o wyglądzie nawigacji w `S-09`).
- **Risk:** Kawałek pozostaje trywialny treścią, ale po decyzji o osobnej trasie **przestał być trywialny mechaniką**, i to w miejscu, w którym pomyłka jest niewidoczna. `/help` nie jest chroniona, dopóki nie trafi do `PROTECTED_ROUTES` w `src/middleware.ts`, a niechroniona strona z adresem e-mail wygląda dokładnie tak samo jak chroniona — bez próby wejścia w trybie prywatnym nikt tego nie zauważy. To jest jedyna rzecz w tym kawałku, którą trzeba sprawdzić, a nie odczytać z kodu. Drugie ryzyko, wprowadzone przez to samo słowo „moduł": kawałek na jedno zdanie łatwo rozdmuchać do infrastruktury modułowej — układu, rejestru modułów, wspólnej nawigacji. To należy do `S-09`; `S-07` dowozi jedną trasę, jedno zdanie i jeden wpis w tablicy. Ryzyko „cudze dane bez zgody" **odpadło** 2026-08-02 — adres podał właściciel projektu i jest to jego własny adres, zgodny z tożsamością commitów w tym repozytorium. Zostaje część, której zgoda nie usuwa: repozytorium jest publiczne na GitHubie, więc adres wejdzie do historii gita i pozostanie w niej także po ewentualnym późniejszym usunięciu z kodu — a umieszczenie strony za logowaniem ogranicza zbieranie adresu ze strony, nie z historii. Warto to wiedzieć przed pierwszym commitem, bo drugi raz decyzji się nie podejmuje. Ryzyko bez zmian: „Pomoc" bywa miejscem, w którym ląduje dokumentacja produktu pisana w kodzie zamiast w `context/` — jeśli treść zacznie rosnąć, powinna mieszkać w jednym miejscu, a nie w dwóch rozjeżdżających się.
- **Status:** proposed

### S-08: Strona startowa przedstawiająca aplikację

- **Outcome:** osoba wchodząca na `/` widzi nazwę aplikacji i krótki opis tego, co ona robi — zamiast strony startera. Dziś `src/pages/index.astro` renderuje `src/components/Welcome.astro`, czyli nietknięty ekran „**10x Astro Starter**" z angielskim podpisem _„A production-ready starter with authentication, modern tooling, and a cosmic developer experience"_. To jedyny publiczny ekran produktu i mówi obecnie o czymś innym niż produkt.
- **Change ID:** `landing-page-identity`
- **PRD refs:** `## Vision` (moduł bazowy plus moduł głosowania; blokadą jest nieobecność, nie sprzeciw), US-02
- **Prerequisites:** — (trasa publiczna, nie wymaga niczego z toru A)
- **Parallel with:** wszystko
- **Blockers:** —
- **Unknowns:**
  - Jaka jest **nazwa produktu widoczna dla użytkownika**? W repozytorium „EstateManager" jest identyfikatorem technicznym (nazwa Workera, nazwa projektu), a cała warstwa produktowa jest po polsku. Czy na stronie startowej stoi „EstateManager", czy nazwa polska? — Owner: użytkownik. Block: **tak** — to dosłownie treść, którą ten kawałek ma wyświetlić.
  - Czy strona startowa ma prowadzić do logowania, czy tylko opisywać? Właściciel głosujący **nigdy tu nie trafia** — wchodzi z linku e-mailowego prosto na uchwałę — więc jedynym odbiorcą tej strony jest administrator albo osoba oceniająca produkt. — Owner: użytkownik. Block: no.
  - Czy zostaje kosmiczna stylistyka startera (`bg-cosmic`, gradienty, pole gwiazd), czy strona dostaje własny kierunek wizualny? Odpowiedź przesądza, czy `S-09` zastanie spójny język wizualny, czy dwa. — Owner: użytkownik. Block: no (ale odpowiedź „zostaje" trzeba podjąć świadomie, a nie przez zaniechanie).
- **Risk:** Najtańszy kawałek na tej roadmapie i jednocześnie jedyny, który widzi ktoś spoza projektu, zanim cokolwiek kliknie — dziś komunikuje, że to czyjś starter. Ryzyko merytoryczne jest zerowe, ryzyko zakresowe realne: „strona startowa" to miejsce, w którym łatwo dorobić sekcje funkcji, cennik i stopkę, czyli zbudować landing marketingowy zamiast opisu na dwa zdania. Zakres świadomie ograniczony do nazwy i krótkiego opisu; wszystko ponad to jest osobną decyzją.
- **Status:** proposed

### S-09: UI dostosowany do aplikacji wielomodułowej

- **Outcome:** administrator porusza się po interfejsie, który przedstawia aplikację jako **zestaw modułów** — dziś moduł bazowy (budynki, lokale, właściciele), moduł głosowania (uchwały, wyniki) i pomoc — zamiast jednego panelu z listą odnośników. Nawigacja, nagłówki i układ są wspólne dla wszystkich modułów, więc dołożenie kolejnego jest wpisem w jedno miejsce, a nie kolejnym ekranem doklejonym obok.
- **Change ID:** `multi-module-ui`
- **PRD refs:** `## Vision` (MVP to moduł bazowy plus moduł głosowania — podział na moduły jest tezą produktu, nie pomysłem na wygląd)
- **Prerequisites:** S-05, S-07, S-08
- **Parallel with:** — celowo ostatni element roadmapy
- **Blockers:** —
- **Unknowns:**
  - Które moduły mają się pojawić w nawigacji? PRD `## Non-Goals` **parkuje pozostałe moduły** (rachunki, bilans, utrzymanie, przeglądy, ubezpieczenia, ogród, sprzątanie, koszty). Nawigacja pokazująca je jako wyszarzone „wkrótce" obiecuje użytkownikowi produkt, którego nie ma i który nie jest zaplanowany. — Owner: użytkownik. Block: no, ale przesądza o połowie zakresu.
  - Czy to przebudowa nawigacji, czy również systemu wizualnego (typografia, kolory, komponenty `shadcn/ui`)? Pierwsze to kilka plików, drugie to każdy istniejący ekran. — Owner: użytkownik. Block: no.
- **Risk:** To jedyny kawałek na roadmapie, który dotyka **wszystkich wcześniejszych ekranów naraz**, i dlatego stoi na końcu: zrobiony wcześniej, byłby przebudowywany po każdym kolejnym kawałku. Główne ryzyko jest zakresowe i wprost sprzeczne z `## Non-Goals` — „interfejs wielomodułowy" to zaproszenie do zaprojektowania architektury informacji dla modułów, które są zaparkowane. Granica, którą trzeba trzymać: v1 układa UI tak, żeby **przyjął** kolejne moduły, i nie pokazuje ani jednego, którego nie ma. Ryzyko drugie: przebudowa nawigacji dotyka `src/middleware.ts` i tablicy `PROTECTED_ROUTES`, która jest w tym projekcie **jedyną bramką autoryzacji** — nowa trasa nie jest chroniona, dopóki nie zostanie tam dopisana, a regresja w tym miejscu jest niewidoczna na ekranie.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID                      | Suggested issue title                                                      | Ready for `/10x-plan` | Notes                                                                                                                                                                                            |
| ---------- | ------------------------------ | -------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F-01       | `production-admin-access`      | Doprowadzić dostęp administratora na produkcji do stanu sprawdzalnego      | zrobione              | Zamknięte 2026-08-01. Logowanie administratora potwierdzone na produkcji                                                                                                                         |
| F-02       | `transactional-mail-channel`   | Podłączyć Cloudflare Email Service i wysłać pierwszą wiadomość z Workera   | zrobione              | Zamknięte 2026-08-01. Domena `estatemanager.dev`, plan Workers Paid, pierwsza wysyłka z produkcji potwierdzona                                                                                   |
| S-01       | `building-create`              | Założenie budynku formularzem (nazwa, miejscowość, ulica z numerem)        | zrobione              | Wdrożone na produkcję 2026-08-02. Zapis: `context/changes/building-create/`                                                                                                                      |
| S-01b      | `building-units-import`        | Import lokali i właścicieli do istniejącego budynku                        | zrobione              | Wdrożone na produkcję 2026-08-02. Zapis: `context/changes/building-units-import/`                                                                                                                |
| S-02       | `resolution-with-voting-links` | Utworzenie uchwały i wygenerowanie indywidualnych linków                   | yes                   | `S-01b` zamknięte 2026-08-02, więc odblokowane. Uruchom `/10x-new resolution-with-voting-links`                                                                                                  |
| S-03       | `share-weighted-vote`          | Oddanie ważonego udziałem głosu z indywidualnego linku                     | no                    | Wymaga `S-02`. Gwiazda przewodnia                                                                                                                                                                |
| S-04       | `voting-link-email-fanout`     | Rozesłanie indywidualnych linków do głosowania e-mailem                    | no                    | Wymaga `S-02` oraz `F-02`                                                                                                                                                                        |
| S-05       | `live-tally-and-outcome`       | Bilans udziałów na żywo i automatyczne rozstrzygnięcie uchwały             | no                    | Wymaga `S-03`                                                                                                                                                                                    |
| S-06       | `finished-votes-archive`       | Przegląd zakończonych głosowań ze śladem wyniku                            | no                    | Wymaga `S-05`                                                                                                                                                                                    |
| S-07       | `dashboard-help-section`       | Moduł „Pomoc" pod trasą `/help`, w v1 z adresem e-mail dewelopera          | yes                   | Odblokowane 2026-08-02 — treść, widoczność i kształt ustalone (osobna trasa `/help`, jedno zdanie, tylko dla zalogowanych, wpis w `PROTECTED_ROUTES`). Uruchom `/10x-new dashboard-help-section` |
| S-08       | `landing-page-identity`        | Strona startowa z nazwą aplikacji i krótkim opisem zamiast strony startera | no                    | Bez zależności w kodzie, ale **brakuje treści**: trzeba przesądzić nazwę widoczną dla użytkownika i opis                                                                                         |
| S-09       | `multi-module-ui`              | Interfejs przedstawiający aplikację jako zestaw modułów                    | no                    | Wymaga `S-05`, `S-07`, `S-08`. Ostatni element roadmapy — dotyka wszystkich wcześniejszych ekranów                                                                                               |

## Open Roadmap Questions

1. **Czy uchwała podjęta elektronicznie jest ważna prawnie i jakiej formy wymaga?** — Owner: użytkownik (wymaga rozstrzygnięcia prawnego, nie produktowego). Dotyczy identyfikacji głosującego, dopuszczalnej formy oddania głosu i trybu indywidualnego zbierania głosów. Waga podniesiona przez decyzję o głosowaniu bez konta i hasła: identyfikacja głosującego opiera się wyłącznie na posiadaniu indywidualnego linku. Block: nie blokuje żadnego kawałka roadmapy; blokuje wdrożenie produkcyjne na prawdziwej wspólnocie — czyli moment, w którym `S-03` i `S-04` przestają być testem, a stają się procesem uchwałodawczym.
2. **Ile trwa domknięcie jednej uchwały dzisiaj (dni/tygodnie)?** — Owner: użytkownik. Potrzebne jako punkt odniesienia dla oceny, o ile produkt skraca cykl. Block: roadmap-wide, nieblokujące — brak odpowiedzi nie zatrzymuje żadnego kawałka, ale bez niej wynik pierwszego prawdziwego głosowania nie będzie miał do czego zostać porównany.

## Parked

Odłożone decyzją podjętą przy tej roadmapie (2026-08-01):

- **Dostarczalność powiadomień poza folder spam** — Why parked: uznane za zbyt wymagające dla PoC i MVP, przeniesione do v2 (PRD §Non-Goals → „Non-goale niefunkcjonalne"). Do v2 należy: rozłożenie wysyłki w czasie, obsługa odbić i strojenie polityki DMARC (`infrastructure.md` §G12). **Skorygowane 2026-08-01:** własna domena nadawcza **wypadła z tej listy** — wybór Cloudflare Email Service czyni ją warunkiem wstępnym `F-02`, a nie pracą v2, bo dostawca nie ma domeny testowej. Rekordy uwierzytelniające prowadzi Cloudflare dla strefy, którą i tak hostuje. Zaparkowane pozostaje **strojenie** dostarczalności, nie samo posiadanie domeny. Konsekwencja odnotowana w polu **Risk** `S-04`: frekwencja zmierzona w PoC jest dolnym oszacowaniem, a niespełnione kryterium sukcesu nie rozstrzyga, czy zawiodła teza produktu, czy kanał nadawczy.
- **Przypomnienia dla niegłosujących właścicieli (FR-010)** — Why parked: jedyne wymaganie oznaczone w PRD jako opcjonalne, a wybrane główne ryzyko to budżet godzinowy (5 tygodni po godzinach, dziewięć wymagań koniecznych, jeden deweloper). PRD przy FR-004 sam wskazuje to jako pierwszą rzecz do dobudowania, jeśli frekwencja okaże się za niska — więc odparkowanie ma jasny wyzwalacz, a nie wymaga ponownej dyskusji. Odnotowane ryzyko na przyszłość: zadanie cykliczne zawodzi cicho — brak wiadomości nie generuje błędu i bywa zauważony tygodnie później (`infrastructure.md` §G10).

Granice zakresu przeniesione z `## Non-Goals` PRD — świadome, nie do przypadkowego cofnięcia:

- **Zastąpienie kanału papierowego** — Why parked: PRD §Non-Goals; głosowanie tradycyjne działa dalej, równolegle i poza systemem, a licznik aplikacji jest wynikiem kanału elektronicznego, nie wynikiem uchwały.
- **Dyskusja i komentarze pod uchwałą** — Why parked: PRD §Non-Goals; właściciel mający obiekcje kontaktuje się telefonicznie z zarządcą.
- **Dokument i protokół do pobrania** — Why parked: PRD §Non-Goals. Odnotowane ryzyko: `infrastructure.md` §D6 wskazuje to jako najbardziej prawdopodobną funkcję v2, dla której wybrany runtime jest nieprzyjazny.
- **Różnicowanie progów per typ uchwały** — Why parked: PRD §Non-Goals; jeden próg 50% dla wszystkich spraw, bez ostrzegania, że dana sprawa wymaga innej większości.
- **Konta i logowanie właścicieli** — Why parked: PRD §Non-Goals; głos oddawany z indywidualnego linku.
- **Obsługa wielu budynków** — Why parked: PRD §Non-Goals; v1 wiąże obie role z jednym budynkiem, portfel nieruchomości poza zakresem.
- **Edycja rejestru** — Why parked: PRD §Non-Goals; rejestr statyczny, zmiana właściciela wymaga interwencji poza aplikacją. Kontrargument uznany przy FR-001 i świadomie odłożony.
- **Modelowanie współwłasności lokalu** — Why parked: PRD §Non-Goals; jeden lokal = jeden głosujący dysponujący całym udziałem.
- **Rejestrowanie głosów oddanych papierowo** — Why parked: PRD §Non-Goals; system liczy wyłącznie kanał elektroniczny.
- **SMS jako kanał dotarcia** — Why parked: PRD §Non-Goals; wyłącznie e-mail.
- **Zgłaszanie uchwał, usterek i awarii przez mieszkańca** — Why parked: PRD §Non-Goals; w v1 właściciel wyłącznie głosuje.
- **Pozostałe moduły aplikacji** (rachunki, bilans, utrzymanie, przeglądy, ubezpieczenia, ogród, sprzątanie, koszty) — Why parked: PRD §Non-Goals; MVP to moduł bazowy plus moduł głosowania. **Uwaga po dodaniu `S-09` (2026-08-02):** `S-09` układa interfejs tak, żeby aplikacja czytała się jako zestaw modułów — i **nie odparkowuje** niczego z tej listy. Granica jest wiążąca: v1 przygotowuje UI na przyjęcie kolejnych modułów i nie pokazuje ani jednego, którego nie ma, w szczególności nie jako pozycji „wkrótce". Odparkowanie wymaga osobnej decyzji i zmiany w PRD, nie zmiany w nawigacji.
- **Samodzielna rejestracja administratora** (wraz z potwierdzaniem adresu e-mail i resetem hasła) — Why parked: PRD §Non-Goals; konta zakłada się ręcznie w panelu Supabase, a `F-01` usuwa ze startera to, co po rejestracji zostało.
- **Model ról i zarządzanie uprawnieniami** — Why parked: PRD §Non-Goals; w v1 każdy użytkownik w bazie jest administratorem. W v2 rola zmienia się bezpośrednio w bazie danych — bez ekranu w aplikacji.
- **Dostęp administratora bez jawnego konta testowego** (prawdziwe konta zakładane w panelu Supabase, nadawanie i reset haseł) — Why parked: PRD §Non-Goals; w MVP ekran logowania jawnie podaje `test@test.com` / `Test123!`. Śledzone jako PRD §Open Questions nr 3 i blokujące wdrożenie z prawdziwym rejestrem.
- **Zobowiązanie do użyteczności całej ścieżki na ekranie telefonu** — Why parked: PRD §Non-Functional Requirements; rozważone i nieprzyjęte jako wiążąca właściwość, mimo że ścieżka główna zaczyna się od wiadomości e-mail.
- **Potwierdzona zgodność prawna formy głosowania** — Why parked: PRD §Non-Goals; MVP powstaje przed rozstrzygnięciem otwartego pytania nr 1 i nie deklaruje, że produkowane uchwały są formalnie skuteczne.

## Done

(Puste przy pierwszym wygenerowaniu. `/10x-archive` dopisuje tu wpis — i przestawia status
elementu na `done` — gdy archiwizowana zmiana ma pasujący `Change ID`.)
