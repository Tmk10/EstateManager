# Stack technologiczny EstateManager — przewodnik

Dokument wprowadzający: czym jest każda technologia w tym projekcie, co daje, co kosztuje i dlaczego znalazła się właśnie tutaj. Decyzje i ich uzasadnienia pochodzą z [`tech-stack.md`](../foundation/tech-stack.md), [`infrastructure.md`](../foundation/infrastructure.md) i [`deployment.md`](../changes/deployment/deployment.md); wersje — z `package.json`.

Kontekst produktu, do którego odwołują się uzasadnienia: aplikacja do głosowania nad uchwałami wspólnoty mieszkaniowej, ważonego udziałami. Solo developer, ~5 tygodni po godzinach, priorytet: minimalizacja kosztów.

| Technologia | Wersja | Rola w projekcie |
|---|---|---|
| TypeScript | 5.9 | Język całego kodu, kontrakty na granicach |
| Astro | 6.3.1 | Meta-framework, SSR (`output: "server"`) |
| React | 19.2 | Wyspy interaktywności (formularze auth) |
| Tailwind CSS | 4.2 | Warstwa stylów |
| Supabase | JS 2.99 / SSR 0.10 | Postgres + Auth + Storage |
| Cloudflare Workers | adapter 13.5 | Runtime produkcyjny |
| Wrangler | 4.90 | CLI do deploymentu i operacji |
| ESLint | 9.29 | Lint type-aware |
| Prettier | 3.8 | Formatowanie |
| Husky + lint-staged | 9.1 / 16.3 | Bramka pre-commit |
| GitHub Actions | — | CI + auto-deploy na merge do `main` |

---

## Warstwa aplikacji

### TypeScript 5.9

Nadbudowa JavaScriptu o statyczne typy. Konfiguracja rozszerza `astro/tsconfig.json` w wariancie `strict`, z aliasem `@/*` na `./src/*`.

**+** Błędy kontraktowe łapane przed uruchomieniem; autouzupełnianie i bezpieczny refaktor; agenci AI radzą sobie wyraźnie lepiej z kodem typowanym.
**−** Narzut składniowy; walka z typami bibliotek zewnętrznych; typy znikają w runtime — dane z zewnątrz i tak trzeba walidować.
**→ Dlaczego tutaj:** reguła progowa uchwały to arytmetyka na udziałach, więc — jak ujmuje to `tech-stack.md` — jawne kontrakty TypeScript i Zod na granicy systemu *są* całą historią danych. Nie ma tu ORM-a ani warstwy domenowej, która by je zastąpiła.

### Astro 6.3.1

Meta-framework z **architekturą wysp**: komponenty renderują się do statycznego HTML, a JavaScript trafia do przeglądarki tylko dla tych fragmentów, które faktycznie są interaktywne. Tu pracuje w trybie `output: "server"` — pełny SSR z API routes.

**+** Domyślnie zero JS na stronę — najlepszy możliwy wynik dla stron czytanych raz; API routes, middleware i strony w jednym frameworku; wolny wybór biblioteki UI (React, Vue, Svelte lub nic).
**−** Mniejszy ekosystem niż Next.js; przejście 6→7 jest sprzężone z majorem adaptera; model wysp wymaga świadomego myślenia o tym, co jest serwerowe, a co klienckie.
**→ Dlaczego tutaj:** produkt ma dokładnie dwie powierzchnie — panel administratora i tokenizowaną stronę, którą właściciel otwiera raz z linku w mailu. Obie to strony renderowane serwerowo plus API routes; nie ma tu aplikacji klienckiej do zbudowania. Wyspy pasują do tego kształtu idealnie.

Wersja 6 (marzec 2026) przebudowała dev server na Vite Environment API. To nie jest kosmetyka: w połączeniu z `@cloudflare/vite-plugin` `astro dev` uruchamia **prawdziwy runtime workerd** lokalnie, co eliminuje sporą klasę błędów „działa u mnie, pada na produkcji".

### React 19.2

Biblioteka UI, tu w roli wysp — nie fundamentu aplikacji. Ładowana wyłącznie w komponentach z `src/components/auth/` (formularze logowania i rejestracji).

**+** Największy ekosystem i baza wiedzy; React Compiler (pilnowany przez `eslint-plugin-react-compiler`) zdejmuje ręczną memoizację; naturalny wybór do formularzy z walidacją.
**−** Wysyłany do przeglądarki bundle to realny koszt; łatwo bezrefleksyjnie rozlać go na cały interfejs i stracić przewagę wysp.
**→ Dlaczego tutaj:** interaktywności jest w MVP dokładnie tyle, co w formularzach uwierzytelniania. Reszta — import rejestru, tworzenie uchwały, licznik udziałów — to formularze i tabele renderowane serwerowo. To modelowy przykład wysp w praktyce: React jest w projekcie, ale nie na stronie głosowania.

### Tailwind CSS 4.2

Framework CSS utility-first. Wersja 4 to napisany w Rust silnik **Oxide** (kilkukrotnie szybsze buildy pełne, ponad stukrotnie inkrementalne) i konfiguracja CSS-first — motyw definiuje się dyrektywą `@theme` w CSS, a nie w `tailwind.config.js`. Podpięty jako plugin Vite (`@tailwindcss/vite`), nie przez PostCSS.

**+** Brak przełączania się między plikami i wymyślania nazw klas; usuwanie kodu nie zostawia martwego CSS; `prettier-plugin-tailwindcss` sortuje klasy automatycznie, więc diffy są stabilne.
**−** Nieczytelne, długie ciągi klas w znacznikach; v4 wprowadziła zmiany łamiące względem v3, więc starsze poradniki wprowadzają w błąd.
**→ Dlaczego tutaj:** przyszedł ze starterem i nie ma powodu tego ruszać. Przy interfejsie złożonym z formularzy i tabel narzut nauki jest zerowy, a brak osobnych plików CSS to jeden element mniej w projekcie utrzymywanym po godzinach.

---

## Dane i uwierzytelnianie

### Supabase (`supabase-js` 2.99, `@supabase/ssr` 0.10)

Hostowana platforma wokół Postgresa: baza, uwierzytelnianie, storage plików i automatyczne REST API nad schematem (PostgREST). Dostęp z aplikacji idzie po HTTP, nie po natywnym protokole Postgresa.

**+** Zwykły Postgres, bez vendor lock-inu na poziomie danych — można wyeksportować i przenieść; auth e-mail/hasło działa od ręki; Row Level Security pozwala trzymać reguły dostępu w bazie; storage plików obsługuje import rejestru; region EU (Frankfurt) do wybrania przy zakładaniu projektu.
**−** Region jest **niezmienny po utworzeniu projektu**; PostgREST nie wyraża prawdziwych transakcji wielozapytaniowych — złożona logika musi zejść do funkcji Postgresa wołanych przez RPC; pula połączeń na małej instancji potrafi się wyczerpać przy skokach ruchu.
**→ Dlaczego tutaj:** dostarcza Postgresa, logowanie administratora i storage na import rejestru w jednej usłudze — a to jest komplet potrzeb backendowych MVP. Wybór regionu EU jest przy tym jedyną odpowiedzią, jaką ten stack ma na pytanie o RODO (patrz sekcja o sprzeciwie).

`@supabase/ssr` obsługuje sesję przez ciasteczka po stronie serwera zamiast w przeglądarce — to wariant wymagany przy SSR. Cały dostęp jest zamknięty w `src/lib/supabase.ts`, a `src/middleware.ts` rozwiązuje użytkownika przy każdym żądaniu. **To nie jest przypadek** — to celowo cienki moduł bez importów specyficznych dla Cloudflare, żeby ewentualna migracja pozostała tania.

---

## Runtime i deployment

### Cloudflare Workers / workerd (`@astrojs/cloudflare` 13.5.0)

Serverless na brzegu sieci. Kod nie działa na Node.js, tylko na **workerd** — runtime zbudowanym wokół standardów webowych (`fetch`, Web Streams, Web Crypto), z częściową zgodnością z Node przez flagę `nodejs_compat`.

**+** Darmowy plan to 100 tys. żądań **dziennie**, płatny kosztuje 5 $/mies.; brak systemu operacyjnego, kontenera i Dockerfile'a do utrzymania; pełna pętla operacyjna z terminala; `wrangler rollback` cofa wdrożenie w sekundy, bo to zmiana routingu, nie przebudowa; Cron Triggers dostępne nawet na darmowym planie.
**−** **workerd to nie Node — i tę różnicę trzeba znać, zanim napisze się kod:**
- `net` i `tls` to zaślepki rzucające wyjątkiem → SMTP jest strukturalnie niemożliwy, mailer **musi** być dostawcą z HTTP API (Resend, Postmark, SES API);
- parsery XLSX/CSV oparte na `fs`, strumieniach Node lub `worker_threads` nie zadziałają — potrzebny jest parser czysto pamięciowy na `ArrayBuffer`;
- limit **10 ms CPU na wywołanie** na darmowym planie (30 s na płatnym), i — co najgorsze — **nie da się go odtworzyć lokalnie**; przekroczenie to błąd 1102 wyłącznie na produkcji;
- brak połączeń TCP: każde zapytanie do Supabase to subrequest Workera, limitowany na wywołanie;
- retencja logów: 3 dni (Free) / 7 dni (Paid);
- adapter 14.x wymaga Astro 7 — wyjście z platformy to sprzężony major bump dwóch pakietów.

**→ Dlaczego tutaj:** minimalizacja kosztów była zadeklarowana jako ograniczenie numer jeden, a Workers jako jedyny kandydat z sześciu badanych zmieścił się w widełkach 0–5 $/mies., zaliczając komplet pięciu kryteriów „przyjazności agentom". Profil ruchu (`users: large, qps: low`) oznacza, że 5 $ płaci się za zapas CPU, nie za liczbę żądań.

> **Praktyczna konsekwencja dla codziennej pracy:** lokalnie uruchamiaj wyłącznie `npm run dev`. Adapter v13 podnosi prawdziwy workerd przez `@cloudflare/vite-plugin`, więc `wrangler pages dev` (legacy, dla wycofywanego Cloudflare Pages) i opcja `platformProxy` są nieaktualne — poradniki, które je pokazują, dotyczą poprzedniej generacji.

### Wrangler 4.90

Oficjalne CLI Cloudflare. Konfiguracja projektu leży w `wrangler.jsonc` — to jednocześnie kontrakt deploymentu: nazwa Workera (staje się hostname'em `*.workers.dev`), `compatibility_date`, flagi i statyczne assety.

**+** Kompletny cykl z terminala: `deploy`, `versions upload` (podgląd bez ruchu produkcyjnego), `rollback`, `tail` (logi na żywo), `secret put`; sekrety są **write-only** — nie da się ich odczytać, co eliminuje wyciek przez historię powłoki.
**−** Write-only działa w obie strony: zgubiony klucz trzeba **rotować**, nie odzyskać; `rollback` cofa **tylko kod** — migracje Supabase zostają tam, gdzie były; URL-e podglądowe są **domyślnie publiczne**.
**→ Dlaczego tutaj:** wymuszone przez wybór platformy, ale to też powód jej wyboru — pierwszorzędny `rollback` w CLI miał wśród kandydatów tylko Cloudflare i Vercel.

---

## Jakość i automatyzacja

### ESLint 9.29 (flat config)

Linter w nowym formacie konfiguracji, złożony z `typescript-eslint` w wariantach `strictTypeChecked` + `stylisticTypeChecked` oraz pluginów dla Astro, React, React Hooks, React Compiler i dostępności (`jsx-a11y`).

**+** Reguły **type-aware** — analiza korzysta z informacji o typach, więc łapie rzeczy niedostępne dla czystej analizy składni (nieobsłużone promisy, niemożliwe porównania); `jsx-a11y` pilnuje dostępności, co przy formularzach ma realne znaczenie.
**−** Tryb type-aware jest wolniejszy niż zwykły lint; przed `npm run lint` konieczne jest `npx astro sync` (generuje `.astro/types.d.ts`), inaczej lint po prostu się wywala.
**→ Dlaczego tutaj:** to najtańsza forma code review dostępna dla dewelopera pracującego solo — nikt inny nie przeczyta tego kodu przed wdrożeniem.

### Prettier 3.8

Formater. `printWidth: 120`, podwójne cudzysłowy, przecinki końcowe wszędzie, plus pluginy do Astro i sortowania klas Tailwind. Zintegrowany z ESLintem przez `eslint-plugin-prettier`.

**+** Koniec dyskusji o formatowaniu; sortowanie klas Tailwind czyni diffy przewidywalnymi.
**−** Znikoma konfigurowalność (to zresztą cel); w połączeniu z ESLintem bywa wolniejszy niż osobne uruchomienie.
**→ Dlaczego tutaj:** przyszedł ze starterem. Realna korzyść w tym projekcie jest inna niż zwykle: agent AI generujący kod trafia w spójny styl bez dodatkowych instrukcji w regułach.

### Husky 9.1 + lint-staged 16.3

Hook `pre-commit` (`.husky/pre-commit`) uruchamia `lint-staged`, które puszcza `eslint --fix` na zmienionych plikach `.ts/.tsx/.astro` i `prettier --write` na `.json/.css/.md`.

**+** Sprzężenie zwrotne w sekundy, nie w minutach oczekiwania na CI; działa tylko na plikach objętych commitem, więc jest szybkie.
**−** Da się ominąć przez `--no-verify`; przy dużym commicie potrafi zauważalnie opóźnić zapis.
**→ Dlaczego tutaj:** to **pętla wewnętrzna** — łapie błąd zanim jeszcze powstanie commit. Pętla zewnętrzna (CI) łapie to samo dziesięć minut później.

### GitHub Actions

`ci.yml` uruchamia na push i PR do `main`: `npm ci → npx astro sync → npm run lint → npm run build` na Node 22. `deploy.yml` powtarza tę samą sekwencję na push do `main` i dokłada na końcu `wrangler-action` (patrz `deployment.md`, krok D14).

**+** `npm ci` instaluje dokładnie to, co w lockfile, więc wdrażany artefakt jest tym, który CI zweryfikowało; sekwencja `lint → build → deploy` w jednym jobie **jest** bramką — nieudany krok przerywa job i deploy nigdy nie startuje.
**−** Branch protection świadomie odroczono (`deployment.md`, D15), więc czerwony build **nie blokuje** merge'a; wymagane statusy w GitHubie działają wyłącznie na pull requestach, a repo jest jednoosobowe z pushami bezpośrednio na `main`.
**→ Dlaczego tutaj:** `tech-stack.md` zapisuje `ci_default_flow: auto-deploy-on-merge`, a merge do `main` został uznany za ten „ludzki akt", którego wymaga macierz zatwierdzeń — żaden agent nie wdraża na produkcję samodzielnie.

---

## Decyzja kontestowana: dlaczego Cloudflare Workers ma zapisany sprzeciw

`infrastructure.md` ma status `recommended-with-recorded-dissent`. Rekomendacja **obowiązuje**, ale jej marża to około 5 $/mies. przewagi nad zwykłym hostem node'owym — na tyle wąsko, że kilka zwyczajnych zdarzeń w projekcie ją odwraca. Zapisano to celowo: jeśli ten deployment się nie uda, to są powody, dla których się nie uda.

Cztery najpoważniejsze zarzuty: **(D1/D2)** workerd to najbardziej nietypowy runtime z sześciu rozważanych, przy zadeklarowanym braku wcześniejszej znajomości — a trzy nietrywialne funkcje backendu (import rejestru, mailing, przypomnienia) zderzają się z jego ograniczeniami; **(D4)** lokalizacja obliczeń Workera jest nieokreślona, a jej ograniczenie wymaga planu Enterprise — to słaba odpowiedź dla prawnika wspólnoty na pytanie, gdzie przetwarzane są dane właścicieli; **(D5)** retencja logów 3–7 dni w produkcie, którego cechą definiującą jest audytowalność głosowania; **(D7)** najmniejsza przenośność ze wszystkich ocenianych opcji.

Droga wyjścia jest udokumentowana i tańsza, niż się wydaje: **Render + `@astrojs/node` 10.1.4**, który wymaga `astro ^6.3.0` — czyli **bez** podnoszenia frameworka. Stąd stała instrukcja projektowa, najważniejszy strukturalny wniosek z całej analizy:

> Dostęp do Supabase, wysyłkę maili i parsowanie plików trzymaj za cienkimi modułami bez importów specyficznych dla workerd.

`src/lib/supabase.ts` już to spełnia. Pełna lista wyzwalaczy do ponownego otwarcia decyzji (T1–T7) i rejestr ryzyk są w [`infrastructure.md`](../foundation/infrastructure.md).

---

## Czego świadomie nie ma

- **Testów** — brak skryptu `test` w `package.json`. Jawnie odnotowane jako otwarte ryzyko (G14).
- **ORM-a** — dostęp do bazy idzie bezpośrednio przez `supabase-js`; logika progowa uchwały ma docelowo trafić do funkcji Postgresa, nie do warstwy aplikacji.
- **Historii migracji** — `supabase/` zawiera dziś tylko `config.toml`. Ryzyko G14: dopóki migracji nie ma, `wrangler rollback` przestaje być użytecznym narzędziem w momencie, w którym pojawi się realny schemat.
- **Środowiska staging** — otwarte ryzyko G15.
- **Dostawcy poczty transakcyjnej** — wybór ograniczony przez platformę (wyłącznie HTTP API, SMTP odpada) i celowo odłożony do implementacji.

> **Uwaga historyczna:** `tech-stack.md` zapisywał kiedyś `deployment_target: cloudflare-pages`. Wpis poprawiono na `cloudflare-workers` w kroku A3 w [`deployment.md`](../changes/deployment/deployment.md) — Cloudflare Pages jest w trybie utrzymaniowym, a `wrangler.jsonc` w repo od początku używał poprawnej ścieżki Workers Static Assets. Obowiązującym celem są **Cloudflare Workers**.
