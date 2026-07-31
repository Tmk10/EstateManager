---
project: "EstateManager"
context_type: greenfield
product_type: web-app
target_scale:
  users: large
  qps: low
  data_volume: small
created: 2026-07-31
updated: 2026-08-01
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: "context type"
      decision: "greenfield — potwierdzone przez użytkownika; katalog pusty, zero markerów projektu"
    - topic: "kategoria bólu"
      decision: "wszystkie cztery objawy (koszt zbierania głosów, brak kworum, brak kanału dla mieszkańca, papier) + dodany przez użytkownika skutek nadrzędny: paraliż działaniowy"
    - topic: "primary persona"
      decision: "administrator/zarządca jako primary; mieszkaniec jako secondary — aktywny uczestnik, nie decydent zakupowy"
    - topic: "insight / dlaczego jeszcze nie zbudowane"
      decision: "rynek to duże generyczne CRM-y; niepełne pokrycie wymagań wypycha część pracy do innych aplikacji; wysoka cena. Odpowiedź: modułowość z obowiązkowym modułem bazowym Nieruchomości i mieszkańcy"
    - topic: "moment wyzwalający"
      decision: "zebrania raz w roku (za rzadko dla uchwał pilnych); na zebraniach rzadko jest kworum; mieszkańcy niezainteresowani i często nieświadomi, że mogą głosować"
    - topic: "skala bólu"
      decision: "10+ uchwał rocznie na budynek; ~85% spraw nie przechodzi z braku głosów, nie ze sprzeciwu"
    - topic: "zakładanie kont mieszkańców"
      decision: "ZMIENIONE w fazie 4.5 — w v1 właściciel nie ma konta; głosuje z indywidualnego linku. Konta przeniesione do v2"
    - topic: "metoda logowania"
      decision: "ZMIENIONE w fazie 4.5 — właściciel bez logowania (link z tokenem); administrator loguje się e-mailem i hasłem"
    - topic: "liczba ról"
      decision: "dwie — administrator i mieszkaniec; bez osobnej roli zarządu i bez roli tylko-do-odczytu w MVP"
    - topic: "zakres budynków"
      decision: "ZMIENIONE w fazie 3 — v1 obsługuje jeden budynek po obu stronach; wielobudynkowość przeniesiona do v2"
    - topic: "zgłaszanie uchwał przez mieszkańca"
      decision: "poza MVP — mieszkaniec w v1 wyłącznie głosuje; zgłaszanie uchwał/usterek/awarii to osobny moduł"
    - topic: "waga głosu"
      decision: "głos liczy się per udział w nieruchomości; udział wyliczany z metrażu lokalu"
    - topic: "próg podjęcia uchwały"
      decision: "większość udziałów w całej nieruchomości — suma 'za' > 50% wszystkich udziałów; brak głosu działa jak głos przeciw"
    - topic: "kanał dotarcia"
      decision: "e-mail w MVP; SMS jako rozszerzenie poza MVP"
    - topic: "kształt MVP"
      decision: "Rdzeń + jeden budynek — import rejestru z pliku zamiast ekranów CRUD, głosowanie z linku bez konta, historia głosowań zostaje; wielobudynkowość, ekrany CRUD, konta właścicieli i rejestracja self-service administratora → v2"
    - topic: "opcje głosu"
      decision: "za / przeciw; bez opcji wstrzymania się — przy progu liczonym od wszystkich udziałów jest nieodróżnialna w skutku od braku głosu"
    - topic: "termin głosowania"
      decision: "brak terminu końcowego — głosowanie trwa, dopóki próg nie zostanie przekroczony"
    - topic: "zmiana oddanego głosu"
      decision: "niemożliwa — głos ostateczny; broni guardrailu o ustalonym śladzie"
    - topic: "współwłasność lokalu"
      decision: "jeden lokal = jeden głosujący; rejestr wskazuje osobę dysponującą całym udziałem lokalu. Współwłasność nie jest modelowana w v1"
    - topic: "kanał papierowy"
      decision: "istnieje równolegle — starsi właściciele głosują tradycyjnie. System NIE rejestruje głosów papierowych w v1; licznik w aplikacji obejmuje wyłącznie kanał elektroniczny"
    - topic: "aktualizacja rejestru"
      decision: "rejestr statyczny w v1 — kontrargument o zmianach właścicieli uznany i świadomie odłożony; zmiana wymaga interwencji poza aplikacją"
    - topic: "upadek uchwały"
      decision: "DODANE w rundzie Sokratesa — uchwała upada, gdy suma udziałów 'przeciw' przekroczy 50%; domyka definicję głosowania zakończonego"
    - topic: "rytm przypomnień"
      decision: "ograniczona liczba przypomnień w malejącej częstotliwości, potem cisza; uchwała zostaje otwarta, ale system przestaje zaczepiać — chroni dostarczalność poczty dla całego budynku"
    - topic: "priorytet przypomnień"
      decision: "nice-to-have bez zmian — MVP dowodzi tezy przy jednym mailu; przypomnienia jako pierwsza rzecz do dobudowania, jeśli frekwencja okaże się za niska"
    - topic: "reguła domenowa"
      decision: "sformułowanie przez wagę głosu — metraż przeliczany na udział, udział waży głos, rozstrzygnięcie przy przekroczeniu 50% wszystkich udziałów przez jedną ze stron. Anti-pattern pustego CRUD nie wystąpił"
    - topic: "właściwości jakościowe"
      decision: "przyjęte: dostarczalność powiadomień do skrzynki głównej, odtwarzalność wyniku po fakcie, nieujawnianie danych sąsiadów głosującemu. Nieprzyjęta: użyteczność ścieżki głosowania na telefonie"
    - topic: "nazwa produktu"
      decision: "EstateManager — nazwa całej modułowej aplikacji; moduł głosowania jest jej pierwszą częścią"
    - topic: "rodzaj produktu"
      decision: "aplikacja webowa"
    - topic: "skala docelowa"
      decision: "do dziesięciu tysięcy użytkowników — portfel nieruchomości jednego lub kilku zarządców"
    - topic: "ramy czasowe"
      decision: "brak twardego terminu; praca po godzinach (wieczory i weekendy)"
    - topic: "granice zakresu"
      decision: "cztery non-goale wybrane jawnie: brak zastąpienia kanału papierowego, brak dyskusji pod uchwałą, brak protokołu do pobrania, brak różnicowania progów per typ uchwały"
    - topic: "mierzalność kryterium głównego"
      decision: "ROZSTRZYGNIĘTE w fazie 7 — kryterium przeformułowane na kanał wyłącznie elektroniczny zamiast dodawania rejestracji głosów papierowych. Produkt odpowiada na pytanie 'czy kanał elektroniczny wystarczył', nie 'czy uchwała przeszła'"
  frs_drafted: 10
  quality_check_status: accepted
timeline_budget:
  mvp_weeks: 5
  hard_deadline: null
  after_hours_only: true
---

# Shape Notes

Nagłówki sekcji są po angielsku — to kontrakt schematu, na którym parsuje `/10x-prd`.
Treść zapisywana jest w języku, w którym prowadzona jest rozmowa (polski).

## Seed idea (verbatim)

> Modulowa Aplikacja dla zarzadcow nieruchomosci ktora pozwala kompleksowo zarzadzac
> wieloma nieruchomosciami. Aplikacja skladala by sie z wielu modulow natomiast w ramach
> MVP zostalby zaimnplementowany jeden z nich. Aplikacja posiadalaby dwa rodzaje
> uzytkownikow - administrator oraz mieszkaniec. Przykladowe moduly to glosowanie uchwal,
> zgloszenia mieszkancow, rachunki, generowanie bilansu, utrzymanie, przeglady,
> ubezpieczenia, pielegnacja ogrodu, sprzatanie. Awarie, Koszty, lista mieszkancow oraz
> tym podobne. Aplikacja moglaby sie skalowac poprzez dodawanie kolejnych budynkow.

## Vision & Problem Statement

Administrator wspólnoty mieszkaniowej nie jest w stanie domknąć uchwały. Zebranie
wspólnoty organizowane jest z reguły raz w roku — zdecydowanie za rzadko dla spraw
pilnych — a na samym zebraniu rzadko pojawia się kworum. Znaczna część mieszkańców nie
interesuje się głosowaniami i nie poczuwa się do udziału; wielu w ogóle nie wie, że może
głosować. W efekcie **około 85% spraw nie przechodzi z powodu braku wymaganej liczby
głosów — nie z powodu sprzeciwu**. Przy 10 i więcej uchwałach rocznie na budynek
(liczba rośnie z liczbą mieszkańców oraz wiekiem i kondycją budynku) oznacza to paraliż
działaniowy: bez podpisanej uchwały nie można wykonywać niezbędnych prac. Sprawy takie
jak pozwolenie na zabudowę antresoli czy założenie blokady na miejscu parkingowym nigdy
nie przechodzą, co kończy się samowolą albo porzuceniem pomysłu. Koszt dzisiejszego
rozwiązania to organizowanie zebrań plus osobiste obchodzenie mieszkańców po podpisy
przez administratora, a głosy i wyniki żyją na papierze — bez historii i bez śladu
audytowego.

Insight, który czyni ten problem wartym rozwiązania: dostępne na rynku produkty to duże,
generyczne CRM-y. Nie spełniają wszystkich wymagań, więc część odpowiedzialności i tak
zostaje przeniesiona do innych aplikacji; są duże i drogie; sprzedają cały pakiet naraz.
Odpowiedzią jest aplikacja złożona z modułów, które każdy odbiorca dobiera pod siebie —
z jednym modułem obowiązkowym (**Nieruchomości i mieszkańcy**, de facto baza danych
o zarządzanych nieruchomościach i ich mieszkańcach) i modułami dodatkowymi dla różnych
typów spraw. Kluczowe przeformułowanie problemu: skoro blokadą jest nieobecność, a nie
sprzeciw, produkt nie ma pomagać ludziom *decydować* — ma sprawić, żeby głosy w ogóle
zostały oddane.

## User & Persona

**Primary — administrator / zarządca nieruchomości.** Aplikacja jest przeznaczona dla
administratorów. To on ponosi koszt operacyjny zbierania głosów i to jemu zależy na
przegłosowaniu uchwały, bo bez niej nie może zlecić prac. Decydent zakupowy. Moment,
w którym po nią sięga: ma uchwałę wymagającą podjęcia, a najbliższe zebranie jest za
kilka miesięcy albo właśnie się odbyło bez kworum.

### Secondary persona

**Właściciel lokalu (mieszkaniec).** Użytkownicy również aktywnie korzystają z aplikacji.
W głosowaniu nad uchwałami udział biorą zarówno administrator, jak i właściciele —
właściciel nie jest biernym odbiorcą, tylko stroną procesu. Charakterystyka wynikająca
z diagnozy: domyślnie **niezainteresowany i nieświadomy** swojego prawa głosu. To nie
jest użytkownik, który szuka aplikacji — to użytkownik, którego trzeba do niej
doprowadzić. Nie jest personą sterującą zakresem MVP. Część właścicieli — zwłaszcza
starszych — pozostaje przy kanale papierowym i głosuje tradycyjnie; wg obserwacji
użytkownika ta grupa jest z reguły bardziej zdyscyplinowana w głosowaniu.

## Success Criteria

### Primary

- Uchwała przeprowadzona w aplikacji zbiera **powyżej 50% wszystkich udziałów
  w budynku w głosach „za", wyłącznie kanałem elektronicznym** — bez organizowania
  zebrania wspólnoty i bez osobistego zbierania podpisów przez administratora.
  Próg liczony jest od wszystkich udziałów w nieruchomości, a nie od udziałów, które
  wzięły udział w głosowaniu. Kryterium mierzy dokładnie tę porażkę, która dziś dotyka
  około 85% spraw.

Zakres kryterium (rozstrzygnięte w fazie 7): mierzy wyłącznie kanał elektroniczny.
Głosy oddane tradycyjnie działają równolegle i poza systemem (patrz `## Non-Goals`),
więc uchwała może zostać realnie podjęta przy niespełnionym kryterium. Poprzeczka jest
zatem świadomie wyższa niż realny sukces uchwały — jej spełnienie dowodzi, że sam kanał
elektroniczny wystarczył, bez wsparcia zbierania podpisów. Konsekwencja przyjęta
świadomie: produkt nie odpowiada na pytanie „czy uchwała przeszła", tylko na pytanie
„czy kanał elektroniczny wystarczył".

### Secondary

- Właściciele, którzy jeszcze nie zagłosowali, otrzymują automatyczne przypomnienia —
  frekwencja udziałowa rośnie bez dodatkowej pracy administratora. Cenne, ale samo
  w sobie nie dowodzi, że produkt zadziałał.

### Guardrails

- **Nikt spoza rejestru nie oddaje głosu.** Głos osoby niebędącej właścicielem
  unieważnia uchwałę — produkt wyrządziłby wtedy szkodę większą niż pożytek.
- **Każdy głos jest policzalny i ma ustalony ślad.** Wynik da się odtworzyć
  i uzasadnić: wiadomo, które udziały złożyły się na rezultat. Bez tego wynik jest
  nie do obrony w sporze.
- **Dane właścicieli nie wychodzą poza budynek.** Metraż, udziały i dane kontaktowe
  to dane osobowe i majątkowe; wyciek lub widoczność między budynkami to szkoda
  nieodwracalna.

## MVP Flow (robocze — źródło dla User Stories i Success Criteria)

Kształt wybrany w fazie 3, zrewidowany w fazie 4.5 (właściciel bez konta):

```
ADMINISTRATOR
  1. logowanie (konto zakładane przy wdrożeniu, bez rejestracji self-service)
  2. jeden budynek — bez przełącznika kontekstu
  3. import lokali i właścicieli z pliku (metraż jako kolumna; udział liczony)
  4. utworzenie uchwały → uruchomienie głosowania
  5. rozesłanie indywidualnych linków do głosowania
  6. podgląd wyniku na żywo + lista zakończonych głosowań

WŁAŚCICIEL
  7. e-mail z indywidualnym linkiem do głosowania
  8. klik → treść uchwały → głos „za” albo „przeciw” → koniec
     (bez konta, bez hasła, bez logowania)

SYSTEM
  udział = metraż lokalu / suma metraży w budynku
  uchwała podjęta, gdy suma udziałów „za”      > 50% wszystkich udziałów
  uchwała upada,   gdy suma udziałów „przeciw” > 50% wszystkich udziałów
```

Przeniesione do v2: konta i logowanie właścicieli, obsługa wielu budynków, ekrany CRUD
rejestru, edycja rejestru, rejestracja self-service administratora, SMS jako kanał
dotarcia, zgłaszanie uchwał przez mieszkańca (osobny moduł), rejestracja głosów
oddanych papierowo.

## Timeline acknowledgment

Acknowledged on 2026-07-31: MVP wymaga trwałego zaangażowania po godzinach; użytkownik
zaakceptował koszt. Wariant pełnego zakresu (8–12 tygodni) odrzucony w fazie 3 na rzecz
kształtu ograniczonego do jednego budynku (≈6 tygodni). Po decyzji z fazy 4.5
o usunięciu kont i logowania właścicieli szacunek skorygowany do **5 tygodni**.

## User Stories

### US-01: Właściciel oddaje głos nad uchwałą

- **Given** właściciel przypisany w rejestrze do lokalu w budynku, w którym trwa
  głosowanie, i posiadający indywidualny link otrzymany e-mailem
- **When** otwiera link
- **Then** widzi treść uchwały i oddaje głos „za" albo „przeciw", a udział jego lokalu
  zostaje doliczony do wyniku

#### Acceptance Criteria
- Głos jest ważony udziałem lokalu wyliczonym z metrażu, nie liczony per osoba
- Oddanie głosu nie wymaga konta, hasła ani logowania
- Po oddaniu głosu właściciel nie może go zmienić ani wycofać
- Link jest indywidualny — nie pozwala oddać głosu w imieniu innego lokalu
- Właściciel otrzymuje potwierdzenie, że jego głos został zapisany

### US-02: Administrator uruchamia głosowanie nad uchwałą

- **Given** administrator z zaimportowanym rejestrem lokali i właścicieli budynku
- **When** tworzy uchwałę i uruchamia nad nią głosowanie
- **Then** wszyscy właściciele w budynku otrzymują e-mail z indywidualnym linkiem,
  a administrator widzi na bieżąco, jaka część udziałów już zagłosowała i ile brakuje
  do progu

#### Acceptance Criteria
- Suma udziałów wszystkich lokali w budynku daje 100%
- Administrator widzi brakującą liczbę udziałów do przekroczenia progu 50%
- Uchwała zostaje oznaczona jako podjęta w momencie, w którym suma udziałów „za"
  przekracza 50% wszystkich udziałów w budynku

## Functional Requirements

### Rejestr i dostęp do głosowania

- FR-001: Administrator może zaimportować z pliku listę lokali z metrażem oraz przypisanych do nich właścicieli. Priority: must-have
  > Socrates: Rozważony kontrargument: „import jednorazowy nie wystarczy — lokale zmieniają
  > właścicieli, a bez edycji rejestru dane rozjadą się z rzeczywistością po pierwszej
  > sprzedaży mieszkania." Rozstrzygnięcie: kontrargument uznany, ale świadomie odłożony —
  > rejestr pozostaje statyczny w v1, zmiana właściciela wymaga interwencji poza aplikacją.
  > Trafia do `## Non-Goals` jako znane ograniczenie.
- FR-002: Administrator może rozesłać właścicielom indywidualne linki do głosowania. Priority: must-have
  > Socrates: Rozważone kontrargumenty: brak adresów e-mail u części właścicieli;
  > wysyłka lądująca w spamie; zignorowanie maila przez osobę, która nie wie, że może
  > głosować. Rozstrzygnięcie: brak kontrargumentu — FR zostaje. Właściciele poza
  > zasięgiem kanału elektronicznego głosują tradycyjnie, co jest akceptowaną ścieżką
  > równoległą. FR przeformułowany w fazie 4.5 z „zaproszenia do założenia dostępu"
  > na „indywidualne linki do głosowania" po rezygnacji z kont właścicieli.

### Uchwały i głosowanie

- FR-003: Administrator może utworzyć uchwałę i uruchomić nad nią głosowanie. Priority: must-have
  > Socrates: Rozważone kontrargumenty: jeden próg nie pasuje do wszystkich typów uchwał;
  > uchwała ma wymogi formalne co do treści; brak etapu dyskusji przed głosowaniem.
  > Rozstrzygnięcie: brak kontrargumentu — FR zostaje. Właściciel mający obiekcje nadal
  > ma możliwość kontaktu telefonicznego z zarządcą, więc produkt nie zamyka drogi
  > do dyskusji, tylko nie modeluje jej w systemie.
- FR-004: Właściciel otrzymuje powiadomienie e-mail z indywidualnym linkiem do głosowania. Priority: must-have
  > Socrates: Kontrargument przyjęty: „jeden mail to za mało — kto przeoczy jedną
  > wiadomość, przepada." Rozstrzygnięcie: potrzeba przypomnień uznana i obsłużona
  > przez FR-010, który pozostaje nice-to-have — MVP dowodzi tezy przy jednym mailu,
  > a przypomnienia są pierwszą rzeczą do dobudowania, jeśli frekwencja okaże się
  > za niska.
- FR-005: Właściciel może odczytać treść uchwały i oddać głos „za" albo „przeciw" z otrzymanego linku, bez zakładania konta i bez logowania; oddany głos jest ostateczny i nie podlega zmianie. Priority: must-have
  > Socrates: Rozważone kontrargumenty: link można przekazać dalej; pomyłkowy głos jest
  > nie do cofnięcia; uchwała łatwa do podważenia bez identyfikacji. Rozstrzygnięcie:
  > brak kontrargumentu — twierdzenie, że ktoś nie kliknął linku, jest równoważne
  > twierdzeniu, że ktoś nie podpisał się pod uchwałą w trybie papierowym. Ryzyko jest
  > więc takie samo jak w procesie, który produkt zastępuje, a nie nowe.
- FR-006: System wylicza udział każdego lokalu z jego metrażu i waży nim oddany głos. Priority: must-have
  > Socrates: Rozważone kontrargumenty: udział jest liczbą z aktu notarialnego, nie
  > proporcją metrażu; metraż pomija pomieszczenia przynależne; zaokrąglenia rozstrzygną
  > uchwałę przy wyniku bliskim progu. Rozstrzygnięcie: brak kontrargumentu — zarządca
  > posiada dokładnie takie dane o lokalach, jakie zawarte są w aktach notarialnych.
  > Konsekwencja dla importu: skoro źródłem są dane aktowe, plik wejściowy może nieść
  > udział wprost, zamiast wyliczać go z metrażu — do rozstrzygnięcia downstream.
- FR-007: System rozstrzyga los uchwały: zostaje **podjęta**, gdy suma udziałów „za" przekroczy 50% wszystkich udziałów w budynku, oraz **upada**, gdy suma udziałów „przeciw" przekroczy 50% wszystkich udziałów. Głosowanie nie ma terminu końcowego; trwa, dopóki jeden z tych progów nie zostanie przekroczony. Priority: must-have
  > Socrates: Kontrargument przyjęty: „nie zdefiniowano, kiedy uchwała upada — gdy
  > 'przeciw' przekroczy 50%, 'za' już matematycznie nie osiągnie progu, ale system
  > trzymałby sprawę otwartą w nieskończoność." Rozstrzygnięcie: FR zmieniony — dodany
  > warunek upadku przy przekroczeniu 50% udziałów „przeciw". Domyka to również
  > definicję głosowania zakończonego w FR-009.

### Wgląd i ślad

- FR-008: Administrator może śledzić na żywo, jaka część udziałów już zagłosowała i ile brakuje do progu. Priority: must-have
  > Socrates: Rozważone kontrargumenty: licznik pokazuje niepełny obraz, bo kanał
  > papierowy jest poza systemem; wiedza o brakujących lokalach zachęca do naciskania
  > konkretnych osób. Rozstrzygnięcie: brak kontrargumentu — możliwość naciskania
  > na konkretne osoby jest w tym produkcie cechą pożądaną, nie wadą. Zapisane jako
  > świadoma intencja produktowa.
- FR-009: Administrator może przeglądać zakończone głosowania wraz z ich wynikiem. Głosowanie jest zakończone, gdy uchwała została podjęta albo upadła (patrz FR-007). Priority: must-have
  > Socrates: Kontrargument przyjęty: „«zakończone» nie jest zdefiniowane — bez terminu
  > i bez warunku upadku lista zawierałaby wyłącznie sukcesy, co daje fałszywy obraz
  > historii wspólnoty." Rozstrzygnięcie: rozwiązane przez zmianę FR-007 — zakończone
  > oznacza podjęte albo upadłe.
- FR-010: System wysyła właścicielom, którzy nie oddali głosu, ograniczoną liczbę przypomnień w malejącej częstotliwości, po czym milknie. Priority: nice-to-have
  > Socrates: Kontrargument przyjęty: „bez terminu końcowego przypomnienia nie mają
  > rytmu — nie wiadomo, kiedy ani ile razy przypominać." Rozstrzygnięcie: FR zmieniony —
  > zamiast rytmu opartego na terminie wprowadzona ograniczona seria przypomnień,
  > po której system milknie. Uchwała pozostaje otwarta, ale produkt przestaje zaczepiać,
  > co chroni dostarczalność poczty dla całego budynku. Priorytet bez zmian.

Ustalenia domenowe wiążące powyższe FR-y (fazy 4 i 4.5):

- Opcje głosu: **za / przeciw**. Brak opcji „wstrzymuję się" — przy progu liczonym od
  wszystkich udziałów wstrzymanie się jest nieodróżnialne w skutku od braku głosu.
- Głosowanie **bez terminu końcowego** — trwa, dopóki jeden z progów nie zostanie
  przekroczony. Uchwała **podjęta** przy „za" > 50% wszystkich udziałów; **upada**
  przy „przeciw" > 50% wszystkich udziałów. Głosowanie zakończone = podjęte albo upadłe.
- Głos **ostateczny**, bez możliwości zmiany.
- **Jeden lokal = jeden głosujący.** Rejestr wskazuje jedną osobę reprezentującą lokal;
  dysponuje ona całym udziałem lokalu. Współwłasność nie jest modelowana w v1.
- **Właściciel nie ma konta w v1.** Głosuje z indywidualnego linku otrzymanego e-mailem.
  Konta i logowanie właścicieli przechodzą do v2.
- **Kanał papierowy działa równolegle, ale poza systemem.** Aplikacja nie rejestruje
  głosów oddanych tradycyjnie — licznik obejmuje wyłącznie kanał elektroniczny.

## Non-Functional Requirements

- Powiadomienie o rozpoczętym głosowaniu dociera do skrzynki głównej odbiorcy,
  a nie do folderu spam.
- Dla każdej zakończonej uchwały da się — w dowolnym momencie po jej zakończeniu —
  wykazać, które udziały złożyły się na wynik.
- Właściciel biorący udział w głosowaniu nie poznaje metraży, udziałów, danych
  kontaktowych ani głosów innych właścicieli; widzi treść uchwały i własny głos.

Rozważone i **nieprzyjęte** jako wiążące NFR: użyteczność całej ścieżki głosowania
na ekranie telefonu. Odnotowane, ponieważ ścieżka główna zaczyna się od kliknięcia
linku w wiadomości e-mail, a poczta bywa czytana na telefonie — jeśli założenie
o kanale okaże się trafne, ta właściwość wróci jako kandydat na NFR w kolejnej wersji.

## Business Logic

Aplikacja przelicza metraż lokalu na udział w nieruchomości, waży nim głos właściciela
i rozstrzyga los uchwały w momencie, gdy jedna ze stron przekroczy 50% wszystkich
udziałów w budynku.

Wejściem reguły są dwie rzeczy podawane przez ludzi: lista lokali budynku z metrażem
i przypisanym do każdego lokalu właścicielem oraz pojedyncze głosy „za" albo „przeciw"
oddawane przez właścicieli. Nic poza tym nie zasila rozstrzygnięcia — w szczególności
liczba głosujących osób nie ma znaczenia, znaczenie ma wyłącznie suma udziałów, które
te osoby reprezentują.

Wyjściem jest los uchwały: **podjęta**, gdy udziały „za" przekroczą połowę wszystkich
udziałów w budynku; **upadła**, gdy przekroczą ją udziały „przeciw"; **w toku**
w każdym innym przypadku. Ponieważ próg liczony jest od wszystkich udziałów
w nieruchomości, a nie od udziałów oddanych, milczenie właściciela działa w skutku
jak głos przeciw — i to jest przyczyna, dla której dzisiaj około 85% spraw nie
przechodzi.

Użytkownicy spotykają tę regułę w dwóch różnych miejscach. Administrator widzi ją jako
bieżący stan: ile udziałów już się opowiedziało i ile brakuje do rozstrzygnięcia — co
pozwala mu dobić brakujące głosy celowo, zamiast obchodzić wszystkich. Właściciel
spotyka ją tylko raz i tylko w jednym punkcie: oddając głos, który natychmiast staje
się ostateczny i zostaje doliczony wagą swojego lokalu.

## Access Control

Dwie role: **administrator** i **właściciel**. W MVP nie ma osobnej roli zarządu
wspólnoty ani roli tylko-do-odczytu (księgowa/audytor) — świadomie odrzucone jako koszt
macierzy uprawnień, który nie jest potrzebny, żeby głosowanie zadziałało.

**Administrator.** Konto zakładane przy wdrożeniu; w v1 nie ma rejestracji self-service.
Uwierzytelnianie e-mailem i hasłem. Administrator jest jedyną rolą, która się loguje.

**Właściciel.** Nie ma konta ani hasła w v1. Dostęp do głosowania odbywa się przez
indywidualny link otrzymany e-mailem, powiązany z konkretnym lokalem w rejestrze.
Rejestr jest źródłem prawdy o tym, kto jest właścicielem w danym budynku, więc osoba
spoza rejestru nie otrzyma linku i nie odda głosu — to broni ważności uchwały,
przy czym siła tej ochrony zależy od nierozstrzygniętego pytania o wymogi prawne
(patrz `## Open Questions`). Konsekwencja operacyjna: administrator musi wprowadzić
rejestr, zanim jakiekolwiek głosowanie ruszy — moduł bazowy i moduł głosowania są
w jednym zakresie MVP.

**Zakres budynków.** W v1 zarówno administrator, jak i właściciel są powiązani z jednym
budynkiem; przełącznik kontekstu nie powstaje po żadnej ze stron. Uprawnienia są
wycinane zakresem budynku. Obsługa portfela nieruchomości po stronie administratora
oraz właściciela z lokalami w kilku budynkach przechodzi do v2.

## Non-Goals

Granice zakresu wybrane jawnie w fazie 6:

- **Produkt nie zastępuje kanału papierowego.** Głosowanie tradycyjne działa dalej,
  równolegle i poza systemem. Aplikacja jest kanałem dodatkowym, a jej licznik nie
  jest wynikiem uchwały, tylko wynikiem kanału elektronicznego.
- **Bez dyskusji i komentarzy pod uchwałą.** Właściciel mający obiekcje kontaktuje się
  telefonicznie z zarządcą. Produkt zbiera głosy, nie modeluje debaty.
- **Bez dokumentu i protokołu do pobrania.** Wynik żyje na ekranie administratora;
  aplikacja nie generuje protokołu do obiegu formalnego wspólnoty. Świadomie pozostawia
  to część bólu „dane uwięzione na papierze" nietkniętą.
- **Bez różnicowania progów per typ uchwały.** Jeden próg 50% udziałów dla wszystkich
  spraw. Sprawy wymagające innej większości nie są obsługiwane w v1, a aplikacja
  nie ostrzega, że dana sprawa takiej wymaga.

Granice wynikające z decyzji podjętych w fazach 2–5:

- **Bez kont i logowania właścicieli.** Głos oddawany z indywidualnego linku;
  konta przechodzą do v2.
- **Bez obsługi wielu budynków.** v1 wiąże obie role z jednym budynkiem; portfel
  nieruchomości i właściciel z lokalami w kilku budynkach przechodzą do v2.
- **Bez edycji rejestru.** Rejestr jest statyczny — zmiana właściciela wymaga
  interwencji poza aplikacją. Kontrargument uznany w rundzie Sokratesa i świadomie
  odłożony.
- **Bez modelowania współwłasności lokalu.** Jeden lokal = jeden głosujący
  dysponujący całym udziałem lokalu.
- **Bez rejestrowania głosów oddanych papierowo.** System liczy wyłącznie kanał
  elektroniczny.
- **Bez SMS jako kanału dotarcia.** Wyłącznie e-mail; SMS to rozszerzenie poza MVP.
- **Bez zgłaszania uchwał, usterek i awarii przez mieszkańca.** W v1 właściciel
  wyłącznie głosuje; zgłoszenia to osobny moduł.
- **Bez pozostałych modułów aplikacji** — rachunki, generowanie bilansu, utrzymanie,
  przeglądy, ubezpieczenia, pielęgnacja ogrodu, sprzątanie, koszty. MVP to moduł
  bazowy (nieruchomości i mieszkańcy) plus moduł głosowania.
- **Bez rejestracji self-service administratora.** Konto zakładane przy wdrożeniu.

Non-goale niefunkcjonalne:

- **Bez zobowiązania do użyteczności całej ścieżki na ekranie telefonu.** Rozważone
  w fazie 5 i nieprzyjęte jako wiążące NFR.
- **Bez potwierdzonej zgodności prawnej formy głosowania.** MVP powstaje przed
  rozstrzygnięciem otwartego pytania nr 1; nie deklaruje, że produkowane uchwały
  są formalnie skuteczne.

## Open Questions

1. **Czy uchwała podjęta elektronicznie jest ważna prawnie i jakiej formy wymaga?** —
   Owner: użytkownik (wymaga rozstrzygnięcia prawnego, nie produktowego). Dotyczy
   identyfikacji głosującego, dopuszczalnej formy oddania głosu i trybu indywidualnego
   zbierania głosów. **Waga wzrosła po decyzji z fazy 4.5**: głosowanie odbywa się
   z linku, bez konta i hasła, więc identyfikacja głosującego opiera się wyłącznie
   na posiadaniu linku. Blokujące dla wdrożenia produkcyjnego; nie blokuje budowy MVP.
2. **Ile trwa domknięcie jednej uchwały dzisiaj (dni/tygodnie)?** — Owner: użytkownik.
   Nie podane w fazie 1; potrzebne jako punkt odniesienia dla oceny, o ile produkt
   skraca cykl. Nie blokuje dalszego shapingu.

## Forward: tech-stack

*(Blok informacyjny — nie jest częścią schematu PRD. Do odebrania przez krok wyboru stacku.)*

- Modułowość jest cechą produktu deklarowaną przez użytkownika: obowiązkowy moduł bazowy
  + moduły opcjonalne dobierane przez odbiorcę. Ma to konsekwencje architektoniczne
  (granice modułów, włączanie/wyłączanie per odbiorca), ale wybór mechanizmu należy
  do kroku wyboru stacku, nie do PRD.
- Skalowanie deklarowane jako „dodawanie kolejnych budynków" — wielotenantowość
  lub wieloobiektowość do rozstrzygnięcia downstream.
- Import rejestru z pliku oraz wysyłka poczty transakcyjnej to dwie zewnętrzne
  zależności MVP — do rozstrzygnięcia downstream.
