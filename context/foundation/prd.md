---
project: "EstateManager"
version: 4
status: draft
created: 2026-08-01
updated: 2026-08-02
context_type: greenfield
product_type: web-app
target_scale:
  users: large
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 5
  hard_deadline: null
  after_hours_only: true
---

# EstateManager — Product Requirements Document

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

Zakres kryterium: mierzy wyłącznie kanał elektroniczny. Głosy oddane tradycyjnie
działają równolegle i poza systemem (patrz `## Non-Goals`), więc uchwała może zostać
realnie podjęta przy niespełnionym kryterium. Poprzeczka jest zatem świadomie wyższa
niż realny sukces uchwały — jej spełnienie dowodzi, że sam kanał elektroniczny
wystarczył, bez wsparcia zbierania podpisów. Konsekwencja przyjęta świadomie: produkt
nie odpowiada na pytanie „czy uchwała przeszła", tylko na pytanie „czy kanał
elektroniczny wystarczył".

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

- FR-011: Administrator może założyć budynek, podając jego nazwę oraz adres rozbity na dwa pola: miejscowość i ulicę z numerem. Zestaw pól opisujących budynek ma być rozszerzalny — dołożenie kolejnego pola jest zmianą addytywną, a nie przebudową rejestru. Priority: must-have
  > Numer jest wyższy od FR-001, mimo że wymaganie je poprzedza: numeracja FR jest
  > stabilna, a FR-001–FR-010 są cytowane w zamkniętych planach i w roadmapie.
  > Dodane 2026-08-01, gdy `S-01` roadmapy zostało rozbite na założenie budynku
  > (`S-01`) i import lokali (`S-01b`) — wcześniej PRD nie mówił, skąd bierze się
  > sam budynek, i milcząco zakładał, że po prostu istnieje.
  > Socrates: Rozważony kontrargument: „formularz zakładania budynków otwiera
  > wielobudynkowość, którą `## Non-Goals` wyklucza." Rozstrzygnięcie: kontrargument
  > odrzucony — non-goal dotyczy *obsługi* portfela nieruchomości (właściciel z lokalami
  > w kilku budynkach, przełączanie kontekstu, uprawnienia per budynek), a nie sposobu,
  > w jaki powstaje ten jeden budynek. Zakładanie go formularzem zamiast migracją lub
  > seedem nie zobowiązuje reszty produktu do niczego. Non-goal zostaje bez zmian.
  > Zmiana 2026-08-02: adres rozbity z jednego pola na miejscowość i ulicę z numerem —
  > jedno pole tekstowe „adres" jest nieprzeszukiwalne i nieporównywalne, a rozbicie
  > wykonane teraz, na pustej tabeli, jest jedną kolumną więcej; wykonane później
  > byłoby migracją danych z parsowaniem wolnego tekstu.
- FR-001: Administrator może zaimportować z pliku listę lokali z metrażem oraz przypisanych do nich właścicieli. Import celuje w budynek założony wcześniej (FR-011). Priority: must-have
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
  > równoległą.

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

Ustalenia domenowe wiążące powyższe wymagania:

- Opcje głosu: **za / przeciw**. Brak opcji „wstrzymuję się" — przy progu liczonym od
  wszystkich udziałów wstrzymanie się jest nieodróżnialne w skutku od braku głosu.
- Głosowanie **bez terminu końcowego** — trwa, dopóki jeden z progów nie zostanie
  przekroczony. Głosowanie zakończone = podjęte albo upadłe.
- Głos **ostateczny**, bez możliwości zmiany.
- **Jeden lokal = jeden głosujący.** Rejestr wskazuje jedną osobę reprezentującą lokal;
  dysponuje ona całym udziałem lokalu. Współwłasność nie jest modelowana w v1.
- **Właściciel nie ma konta w v1.** Głosuje z indywidualnego linku otrzymanego e-mailem.
- **Kanał papierowy działa równolegle, ale poza systemem.** Aplikacja nie rejestruje
  głosów oddanych tradycyjnie — licznik obejmuje wyłącznie kanał elektroniczny.

## Non-Functional Requirements

- Dla każdej zakończonej uchwały da się — w dowolnym momencie po jej zakończeniu —
  wykazać, które udziały złożyły się na wynik.
- Właściciel biorący udział w głosowaniu nie poznaje metraży, udziałów, danych
  kontaktowych ani głosów innych właścicieli; widzi treść uchwały i własny głos.

Rozważona i **nieprzyjęta** jako wiążąca właściwość: użyteczność całej ścieżki
głosowania na ekranie telefonu. Odnotowane, ponieważ ścieżka główna zaczyna się
od otwarcia wiadomości e-mail, a poczta bywa czytana na telefonie.

Rozważona i **przeniesiona do v2**: dostarczalność powiadomienia do skrzynki
głównej odbiorcy zamiast do folderu spam. Wymaganie obowiązywało w v1 do
2026-08-01; uznane za zbyt wymagające dla PoC i MVP, ponieważ jego spełnienie
zależy od własnej domeny nadawczej z rekordami uwierzytelniającymi pocztę
i od reputacji nadawcy budowanej w czasie — czyli od rzeczy, których kod
aplikacji nie rozstrzyga. Szczegóły w `## Non-Goals`.

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

**Administrator.** Konta administratorów zakłada się **bezpośrednio w bazie danych,
przez panel Supabase** (Authentication → Users → Add user): osoba prowadząca projekt
wpisuje adres e-mail i hasło, i to jest cała procedura. Aplikacja nie ma ekranu
rejestracji ani żadnej innej ścieżki samodzielnego założenia konta — nie w oknie
wdrożeniowym i nie później. Uwierzytelnianie e-mailem i hasłem;
administrator jest jedyną rolą, która się loguje. Może założyć budynek, importować rejestr, tworzyć
uchwały, uruchamiać głosowania, rozsyłać linki, śledzić bieżący stan i przeglądać
zakończone głosowania. Ustalenie z 2026-08-01; jest to wiążąca wersja decyzji o dostępie
administratora i zastępuje zarówno wcześniejsze „konto zakładane przy wdrożeniu", jak
i rozważaną tego samego dnia stale dostępną rejestrację self-service z potwierdzeniem
adresu e-mail.

**Konto testowe MVP.** W bazie istnieje konto `test@test.com` z hasłem `Test123!`,
założone tą właśnie drogą. Na czas MVP jest to droga wejścia do aplikacji dla wszystkich,
którzy mają ją obejrzeć. **Ekran logowania wyświetla tę informację wprost** — zarówno to,
że konta zakłada się w panelu Supabase, jak i dane konta testowego — żeby osoba próbująca
się zalogować nie szukała nieistniejącej rejestracji.

**Konsekwencja przyjęta świadomie.** Dane konta testowego są jawne na ekranie logowania,
więc każdy, kto zna adres aplikacji, ma pełny dostęp administratora — łącznie z wglądem
w rejestr lokali i dane kontaktowe właścicieli. To jest akceptowalne wyłącznie dla PoC
na danych testowych. Przed wdrożeniem z prawdziwym rejestrem konto testowe musi zniknąć
razem z komunikatem na ekranie logowania; patrz `## Open Questions` nr 3.

**Role w v1 i w v2.** W v1 nie ma modelu ról: **każdy użytkownik istniejący w bazie jest
administratorem** i dostaje pełny zakres uprawnień opisany wyżej. Rozróżnienie ról wchodzi
w v2 — wtedy pojawia się konto zwykłego użytkownika, a podniesienie go do administratora
odbywa się (tak jak samo zakładanie kont w v1) **bezpośrednio w bazie danych**, bez ekranu
zarządzania uprawnieniami po stronie aplikacji. Panel Supabase pozostaje przy tym
narzędziem administracyjnym właściciela projektu, a nie funkcją produktu — nikt spoza
osoby prowadzącej wdrożenie nie dostaje do niego dostępu.

**Właściciel.** Nie ma konta ani hasła w v1. Dostęp do głosowania odbywa się przez
indywidualny link otrzymany e-mailem, powiązany z konkretnym lokalem w rejestrze.
Może wyłącznie odczytać treść uchwały i raz oddać głos. Rejestr jest źródłem prawdy
o tym, kto jest właścicielem w danym budynku, więc osoba spoza rejestru nie otrzyma
linku i nie odda głosu — to broni ważności uchwały, przy czym siła tej ochrony zależy
od nierozstrzygniętego pytania o wymogi prawne (patrz `## Open Questions`).
Konsekwencja operacyjna: administrator musi wprowadzić rejestr, zanim jakiekolwiek
głosowanie ruszy — moduł bazowy i moduł głosowania są w jednym zakresie MVP.

**Zakres budynków.** W v1 zarówno administrator, jak i właściciel są powiązani z jednym
budynkiem; przełącznik kontekstu nie powstaje po żadnej ze stron. Uprawnienia są
wycinane zakresem budynku. Obsługa portfela nieruchomości po stronie administratora
oraz właściciela z lokalami w kilku budynkach przechodzi do wersji późniejszej.

## Non-Goals

Granice zakresu wybrane jawnie:

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

Granice wynikające z decyzji zakresowych:

- **Bez kont i logowania właścicieli.** Głos oddawany z indywidualnego linku.
- **Bez obsługi wielu budynków.** v1 wiąże obie role z jednym budynkiem; portfel
  nieruchomości i właściciel z lokalami w kilku budynkach są poza zakresem.
- **Bez edycji rejestru.** Rejestr jest statyczny — zmiana właściciela wymaga
  interwencji poza aplikacją. Kontrargument uznany i świadomie odłożony.
- **Bez modelowania współwłasności lokalu.** Jeden lokal = jeden głosujący
  dysponujący całym udziałem lokalu.
- **Bez rejestrowania głosów oddanych papierowo.** System liczy wyłącznie kanał
  elektroniczny.
- **Bez SMS jako kanału dotarcia.** Wyłącznie e-mail.
- **Bez zgłaszania uchwał, usterek i awarii przez mieszkańca.** W v1 właściciel
  wyłącznie głosuje; zgłoszenia to osobny moduł.
- **Bez pozostałych modułów aplikacji** — rachunki, generowanie bilansu, utrzymanie,
  przeglądy, ubezpieczenia, pielęgnacja ogrodu, sprzątanie, koszty. MVP to moduł
  bazowy (nieruchomości i mieszkańcy) plus moduł głosowania.
- **Bez samodzielnej rejestracji administratora.** Aplikacja nie ma ekranu rejestracji
  ani odzyskiwania hasła; konta zakłada się w panelu Supabase
  (`## Access Control`). Znika przez to cała ścieżka rejestracja → potwierdzenie
  adresu e-mail → logowanie: potwierdzanie adresu przestaje być wymaganiem
  produktowym v1, bo nie ma czego potwierdzać.
- **Bez modelu ról i ekranu zarządzania uprawnieniami.** W v1 każdy użytkownik
  istniejący w bazie jest administratorem. Role wchodzą w v2 i będą zmieniane
  bezpośrednio w bazie danych, a nie z poziomu aplikacji.
- **Bez ukrywania danych konta testowego.** W MVP ekran logowania jawnie podaje
  `test@test.com` / `Test123!`. Świadomy wybór na rzecz dostępności PoC do obejrzenia;
  konsekwencja opisana w `## Access Control`, wyjście z tego stanu śledzone
  jako pytanie nr 3.

Non-goale niefunkcjonalne:

- **Bez zobowiązania do użyteczności całej ścieżki na ekranie telefonu.** Rozważone
  i nieprzyjęte jako wiążąca właściwość.
- **Bez zobowiązania do dostarczalności powiadomień poza folder spam.** Przeniesione
  do v2 dnia 2026-08-01. MVP wysyła powiadomienia z domeny testowej dostawcy poczty
  i **nie deklaruje**, że trafiają do skrzynki głównej odbiorcy. Konsekwencja przyjęta
  świadomie: część właścicieli nie zobaczy linku, więc frekwencja udziałowa zmierzona
  w PoC jest dolnym oszacowaniem — nie wolno jej czytać jako sufitu możliwości kanału
  elektronicznego. Kryterium sukcesu pozostaje bez zmian, ale jego niespełnienie
  w PoC nie obala tezy produktu, dopóki dostarczalność nie zostanie zaadresowana.
  Do v2 należy: własna domena nadawcza, rekordy SPF/DKIM/DMARC, rozłożenie wysyłki
  w czasie i obsługa odbić (`context/foundation/infrastructure.md` §G12).
- **Bez potwierdzonej zgodności prawnej formy głosowania.** MVP powstaje przed
  rozstrzygnięciem otwartego pytania nr 1; nie deklaruje, że produkowane uchwały
  są formalnie skuteczne.

## Open Questions

1. **Czy uchwała podjęta elektronicznie jest ważna prawnie i jakiej formy wymaga?** —
   Owner: użytkownik (wymaga rozstrzygnięcia prawnego, nie produktowego). Dotyczy
   identyfikacji głosującego, dopuszczalnej formy oddania głosu i trybu indywidualnego
   zbierania głosów. Waga podniesiona przez decyzję o głosowaniu bez konta i hasła:
   identyfikacja głosującego opiera się wyłącznie na posiadaniu indywidualnego linku.
   Blokujące dla wdrożenia produkcyjnego; nie blokuje budowy MVP.
2. **Ile trwa domknięcie jednej uchwały dzisiaj (dni/tygodnie)?** — Owner: użytkownik.
   Potrzebne jako punkt odniesienia dla oceny, o ile produkt skraca cykl.
   Nie blokuje budowy MVP.
3. **Jak wygląda dostęp administratora po zakończeniu PoC, gdy znika konto testowe?** —
   Owner: użytkownik. Otwarte od 2026-08-01, wraz z decyzją o zakładaniu kont
   w panelu Supabase i o jawnym koncie testowym `test@test.com` / `Test123!`
   (`## Access Control`). Ochrona rejestru lokali i danych kontaktowych właścicieli
   sprowadza się dziś do nieujawniania adresu aplikacji, bo dane logowania są jawne.
   Narzędzie jest rozstrzygnięte — panel Supabase. Otwarte zostaje: kto ma do niego
   dostęp, jak prawdziwy administrator dostaje swoje pierwsze hasło (kanałem poza
   aplikacją) i co się dzieje, gdy je zapomni — skoro aplikacja nie ma resetu hasła,
   jedynym wyjściem jest ręczna zmiana w panelu.
   Blokujące dla wdrożenia z prawdziwym rejestrem; nie blokuje budowy MVP
   ani PoC na danych testowych.
