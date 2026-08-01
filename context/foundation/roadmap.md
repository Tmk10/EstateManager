---
project: "EstateManager"
version: 2
status: draft
created: 2026-08-01
updated: 2026-08-01
prd_version: 2
main_goal: market-feedback
top_blocker: time
---

# Roadmap: EstateManager

> Wyprowadzona z `context/foundation/prd.md` (v2) oraz z automatycznego rozpoznania stanu kodu.
> Dokument edytowany w miejscu; archiwizowany, gdy zostanie zastąpiony.
> Kawałki poniżej są ułożone w kolejności zależności. Tabela „At a glance" jest indeksem.

## Vision recap

Administrator wspólnoty nie jest w stanie domknąć uchwały: zebranie odbywa się raz w roku,
kworum rzadko się zbiera, a około 85% spraw nie przechodzi z powodu braku wymaganej liczby
głosów — nie z powodu sprzeciwu. Kluczowe przeformułowanie problemu: produkt nie ma pomagać
ludziom *decydować*, tylko sprawić, żeby głosy w ogóle zostały oddane. MVP to moduł bazowy
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
> **Risk**: *najbardziej ryzykowne założenie* to takie, którego obalenie unieważnia produkt,
> a nie takie, które tylko podnosi koszt.

## At a glance

| ID   | Change ID                   | Outcome (użytkownik może…)                                                                                             | Prerequisites | PRD refs                     | Status   |
| ---- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------- | ---------------------------- | -------- |
| F-01 | `production-admin-access`   | (fundament) administrator loguje się na produkcji kontem założonym w bazie, ekran logowania mówi skąd je wziąć, a brak sekretu przestaje być cichy | —             | Access Control, Guardrails   | done     |
| F-02 | `transactional-mail-channel`| (fundament) z Workera wychodzi jedna prawdziwa wiadomość przez API dostawcy, na jego domenie testowej                     | —             | FR-002, FR-004               | ready    |
| S-01 | `building-registry-import`  | administrator importuje z pliku rejestr lokali z metrażem i właścicielami, a wyliczone udziały sumują się do 100%        | F-01          | US-02, FR-001, FR-006        | proposed |
| S-02 | `resolution-with-voting-links` | administrator tworzy uchwałę, uruchamia nad nią głosowanie i dysponuje indywidualnym linkiem dla każdego lokalu       | S-01          | US-02, FR-003                | proposed |
| S-03 | `share-weighted-vote`       | właściciel odczytuje treść uchwały i oddaje z linku ostateczny głos ważony udziałem swojego lokalu                       | S-02          | US-01, FR-005, FR-006        | proposed |
| S-04 | `voting-link-email-fanout`  | wszyscy właściciele w budynku otrzymują e-mailem swój indywidualny link do głosowania                                    | S-02, F-02    | US-02, FR-002, FR-004        | proposed |
| S-05 | `live-tally-and-outcome`    | administrator widzi na żywo bilans udziałów i brakującą część do progu, a uchwała sama zostaje podjęta albo upada        | S-03          | US-02, FR-007, FR-008        | proposed |
| S-06 | `finished-votes-archive`    | administrator przegląda zakończone głosowania i odtwarza, które udziały złożyły się na wynik                             | S-05          | FR-009, NFR (ślad)           | proposed |

## Streams

Pomoc nawigacyjna — grupuje elementy dzielące ten sam łańcuch zależności. Kolejność wiążąca
nadal wynika z grafu zależności poniżej; ta tabela to proponowana kolejność czytania
równoległych torów.

| Stream | Theme                  | Chain                            | Note                                                                                                                    |
| ------ | ---------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| A      | Rejestr i uchwała      | `F-01` → `S-01` → `S-02`         | Tor administratora. Wszystko inne z niego wyrasta — bez rejestru i uchwały nie ma czego ani komu wysyłać.               |
| B      | Głos i wynik           | `S-03` → `S-05` → `S-06`         | Dołącza do toru A przy `S-02`. Zawiera gwiazdę przewodnią `S-03` i domyka pętlę aż do śladu audytowego.                 |
| C      | Kanał pocztowy         | `F-02` → `S-04`                  | `F-02` startuje równolegle do całego toru A; `S-04` dołącza do toru A przy `S-02`. Najkrótszy tor po odchudzeniu `F-02`.|

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

- **Outcome:** (fundament) wybrany dostawca poczty transakcyjnej jest podłączony, a z Workera wychodzi jedna prawdziwa wiadomość i dociera do skrzynki testowej — nadana z domeny testowej dostawcy, bez zobowiązania co do tego, w którym folderze wyląduje.
- **Change ID:** `transactional-mail-channel`
- **PRD refs:** FR-002, FR-004
- **Unlocks:** `S-04` (rozsyłka indywidualnych linków). Usuwa jedyne niewiadome, które mogłyby uczynić `S-04` niewykonalną: czy z tego runtime'u da się w ogóle wysłać pocztę i przez jaki interfejs.
- **Prerequisites:** —
- **Parallel with:** F-01, S-01, S-02, S-03
- **Blockers:** —
- **Unknowns:**
  - Który dostawca poczty transakcyjnej — i czy da się go wołać po HTTP z runtime'u Workers? `context/foundation/infrastructure.md` §D2 odnotowuje, że runtime nie utrzymuje połączeń SMTP, więc każda biblioteka oparta na SMTP odpada, a odpowiedź bywa znana dopiero po wdrożeniu. — Owner: zespół. Block: no.
- **Risk:** Zakres odchudzony 2026-08-01, gdy dostarczalność została przeniesiona do v2. Fundament przestał dotyczyć tego, **czy wiadomość dojdzie do skrzynki głównej**, a zaczął dotyczyć tego, **czy w ogóle da się ją wysłać z tego runtime'u** — to drugie nadal potrafi zatrzymać `S-04`, i to po wdrożeniu, a nie na maszynie deweloperskiej, bo `astro dev` i produkcja rozjeżdżają się dokładnie na tych interfejsach. Zakres celowo minimalny: jedna wiadomość, nie rozsyłka i nie konfiguracja domeny. Świadomie przyjęta konsekwencja: część właścicieli nie zobaczy linku, więc frekwencja zmierzona w PoC jest dolnym oszacowaniem możliwości kanału elektronicznego, a nie jego sufitem.
- **Status:** ready

## Slices

### S-01: Import rejestru budynku

- **Outcome:** administrator importuje z pliku listę lokali z metrażem oraz przypisanymi do nich właścicielami i widzi rejestr swojego budynku, w którym wyliczone z metrażu udziały sumują się do 100%.
- **Change ID:** `building-registry-import`
- **PRD refs:** US-02, FR-001, FR-006
- **Prerequisites:** F-01
- **Parallel with:** F-02
- **Blockers:** —
- **Unknowns:**
  - W jakim formacie zarządca posiada dziś listę lokali (arkusz, CSV, wydruk z innego systemu) i czy da się ustalić jeden format wejściowy? — Owner: użytkownik. Block: no.
  - Jak zachować się przy sumie udziałów różnej od 100% po zaokrągleniach — odrzucić import czy przyjąć z ostrzeżeniem? Zaokrąglenia rozstrzygną uchwałę przy wyniku bliskim progu (kontrargument odnotowany przy FR-006). — Owner: użytkownik. Block: no.
- **Risk:** Pierwszy kawałek, który zakłada tabele — a warstwa danych jest dziś pusta, więc to tutaj powstaje kontrakt bezpieczeństwa dla całego produktu: każda tabela z włączonym zabezpieczeniem na poziomie wiersza, po jednej polityce na operację i rolę, każda ograniczona zakresem budynku, z rolą anonimową włącznie — bo właściciel głosuje bez sesji. Wprowadzenie tego kontraktu tutaj, a nie później, jest tańsze niż dopisywanie go do istniejących tabel. Bariera PRD „dane właścicieli nie wychodzą poza budynek" jest egzekwowana właśnie w tym miejscu, nie w interfejsie.
- **Status:** proposed

### S-02: Uchwała i indywidualne linki do głosowania

- **Outcome:** administrator tworzy uchwałę, uruchamia nad nią głosowanie i od tego momentu każdemu lokalowi w budynku odpowiada indywidualny link, który administrator może odczytać i przekazać.
- **Change ID:** `resolution-with-voting-links`
- **PRD refs:** US-02, FR-003
- **Prerequisites:** S-01
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
- **Prerequisites:** S-02, F-02
- **Parallel with:** S-03, S-05
- **Blockers:** —
- **Unknowns:**
  - Co robi system z lokalami bez adresu e-mail w rejestrze — pomija cicho, czy pokazuje administratorowi listę do obejścia tradycyjnego? PRD dopuszcza kanał papierowy jako równoległy, ale nie mówi, czy aplikacja go sygnalizuje. — Owner: użytkownik. Block: no.
  - Czy rozsyłka do budynku mieści się w jednym wywołaniu Workera, czy wymaga rozłożenia w czasie? `infrastructure.md` §D3 i §G11 wskazują, że to zadanie ma kształt wsadowy, a runtime jest zakresowany do pojedynczego żądania. — Owner: zespół. Block: no.
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

## Backlog Handoff

| Roadmap ID | Change ID                      | Suggested issue title                                                     | Ready for `/10x-plan` | Notes                                                                 |
| ---------- | ------------------------------ | ------------------------------------------------------------------------- | --------------------- | --------------------------------------------------------------------- |
| F-01       | `production-admin-access`      | Doprowadzić dostęp administratora na produkcji do stanu sprawdzalnego      | yes                   | Uruchom `/10x-plan production-admin-access`                           |
| F-02       | `transactional-mail-channel`   | Podłączyć dostawcę poczty i wysłać pierwszą wiadomość z Workera            | yes                   | Uruchom `/10x-plan transactional-mail-channel`. Może iść równolegle do `F-01` |
| S-01       | `building-registry-import`     | Import rejestru lokali i właścicieli budynku                               | no                    | Wymaga `F-01`                                                          |
| S-02       | `resolution-with-voting-links` | Utworzenie uchwały i wygenerowanie indywidualnych linków                   | no                    | Wymaga `S-01`                                                          |
| S-03       | `share-weighted-vote`          | Oddanie ważonego udziałem głosu z indywidualnego linku                     | no                    | Wymaga `S-02`. Gwiazda przewodnia                                      |
| S-04       | `voting-link-email-fanout`     | Rozesłanie indywidualnych linków do głosowania e-mailem                    | no                    | Wymaga `S-02` oraz `F-02`                                              |
| S-05       | `live-tally-and-outcome`       | Bilans udziałów na żywo i automatyczne rozstrzygnięcie uchwały             | no                    | Wymaga `S-03`                                                          |
| S-06       | `finished-votes-archive`       | Przegląd zakończonych głosowań ze śladem wyniku                            | no                    | Wymaga `S-05`                                                          |

## Open Roadmap Questions

1. **Czy uchwała podjęta elektronicznie jest ważna prawnie i jakiej formy wymaga?** — Owner: użytkownik (wymaga rozstrzygnięcia prawnego, nie produktowego). Dotyczy identyfikacji głosującego, dopuszczalnej formy oddania głosu i trybu indywidualnego zbierania głosów. Waga podniesiona przez decyzję o głosowaniu bez konta i hasła: identyfikacja głosującego opiera się wyłącznie na posiadaniu indywidualnego linku. Block: nie blokuje żadnego kawałka roadmapy; blokuje wdrożenie produkcyjne na prawdziwej wspólnocie — czyli moment, w którym `S-03` i `S-04` przestają być testem, a stają się procesem uchwałodawczym.
2. **Ile trwa domknięcie jednej uchwały dzisiaj (dni/tygodnie)?** — Owner: użytkownik. Potrzebne jako punkt odniesienia dla oceny, o ile produkt skraca cykl. Block: roadmap-wide, nieblokujące — brak odpowiedzi nie zatrzymuje żadnego kawałka, ale bez niej wynik pierwszego prawdziwego głosowania nie będzie miał do czego zostać porównany.

## Parked

Odłożone decyzją podjętą przy tej roadmapie (2026-08-01):

- **Dostarczalność powiadomień poza folder spam** — Why parked: uznane za zbyt wymagające dla PoC i MVP, przeniesione do v2 (PRD §Non-Goals → „Non-goale niefunkcjonalne"). Do v2 należy: własna domena nadawcza, rekordy SPF/DKIM/DMARC, rozłożenie wysyłki w czasie i obsługa odbić (`infrastructure.md` §G12). Konsekwencja odnotowana w polu **Risk** `S-04`: frekwencja zmierzona w PoC jest dolnym oszacowaniem, a niespełnione kryterium sukcesu nie rozstrzyga, czy zawiodła teza produktu, czy kanał nadawczy.
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
- **Pozostałe moduły aplikacji** (rachunki, bilans, utrzymanie, przeglądy, ubezpieczenia, ogród, sprzątanie, koszty) — Why parked: PRD §Non-Goals; MVP to moduł bazowy plus moduł głosowania.
- **Samodzielna rejestracja administratora** (wraz z potwierdzaniem adresu e-mail i resetem hasła) — Why parked: PRD §Non-Goals; konta zakłada się ręcznie w panelu Supabase, a `F-01` usuwa ze startera to, co po rejestracji zostało.
- **Model ról i zarządzanie uprawnieniami** — Why parked: PRD §Non-Goals; w v1 każdy użytkownik w bazie jest administratorem. W v2 rola zmienia się bezpośrednio w bazie danych — bez ekranu w aplikacji.
- **Dostęp administratora bez jawnego konta testowego** (prawdziwe konta zakładane w panelu Supabase, nadawanie i reset haseł) — Why parked: PRD §Non-Goals; w MVP ekran logowania jawnie podaje `test@test.com` / `Test123!`. Śledzone jako PRD §Open Questions nr 3 i blokujące wdrożenie z prawdziwym rejestrem.
- **Zobowiązanie do użyteczności całej ścieżki na ekranie telefonu** — Why parked: PRD §Non-Functional Requirements; rozważone i nieprzyjęte jako wiążąca właściwość, mimo że ścieżka główna zaczyna się od wiadomości e-mail.
- **Potwierdzona zgodność prawna formy głosowania** — Why parked: PRD §Non-Goals; MVP powstaje przed rozstrzygnięciem otwartego pytania nr 1 i nie deklaruje, że produkowane uchwały są formalnie skuteczne.

## Done

(Puste przy pierwszym wygenerowaniu. `/10x-archive` dopisuje tu wpis — i przestawia status
elementu na `done` — gdy archiwizowana zmiana ma pasujący `Change ID`.)
