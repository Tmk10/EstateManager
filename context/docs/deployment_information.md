# Deployment EstateManagera — wyjaśnienie dla nietechnicznych

Dokument wprowadzający: co to znaczy „wdrożyć aplikację", jakie klocki się na to składają i co dzieje się po naciśnięciu `git push`. Szczegóły techniczne, dziennik wdrożeń i lista rzeczy do zrobienia: [`deployment.md`](../changes/deployment/deployment.md).

## Cztery klocki

| Klocek | Co robi | Analogia |
|---|---|---|
| **GitHub** | Przechowuje kod i jego historię | Magazyn z rejestrem zmian |
| **GitHub Actions** | Automat, który po każdej zmianie sprawdza kod i wysyła go dalej | Kontrola jakości na taśmie |
| **Cloudflare Workers** | Serwery, na których aplikacja faktycznie działa | Sklep, do którego wchodzą użytkownicy |
| **Supabase** | Baza danych i logowanie | Kartoteka na zapleczu |

Aplikacja mieszka w Cloudflare, dane w Supabase — to dwie osobne usługi, które łączą się przez sieć. Cloudflare musi znać adres i klucz do Supabase, żeby cokolwiek działało.

## Co się dzieje po `git push`

To jest cały deployment. Trwa około minuty i nie wymaga niczego poza wysłaniem zmiany do GitHuba.

```
git push  →  GitHub  →  GitHub Actions:
                          1. npm ci        pobierz dokładnie te biblioteki, co zawsze
                          2. astro sync    wygeneruj pliki pomocnicze
                          3. lint          sprawdź, czy kod nie ma błędów
                          4. build         zbuduj wersję produkcyjną
                          5. deploy        wyślij do Cloudflare
                       →  nowa wersja na żywo
```

**Kolejność jest tu najważniejsza.** Kroki 3 i 4 są bramką: jeśli którykolwiek się wywali, krok 5 **w ogóle nie startuje** i na produkcji zostaje poprzednia, działająca wersja. Zepsuty kod nie ma jak trafić do użytkowników.

Zastrzeżenie: to, że bramka *przepuszcza* dobry kod, jest sprawdzone. To, że *zatrzymuje* zły — jeszcze nie. Wymaga to celowego wysłania popsutego commita i zobaczenia, że deploy się nie odbył.

## Co zostało ustawione raz, na początku

Tych rzeczy nie powtarza się przy każdym wdrożeniu. Warto jednak wiedzieć, że istnieją — bo jeśli coś przestanie działać, przyczyna jest zwykle tutaj.

1. **Nazwa.** Projekt nazywa się `estate-manager`. Ta nazwa jest jednocześnie adresem: <https://estate-manager.estate-manager.workers.dev>. Zmiana nazwy nie przenosi aplikacji — tworzy drugą, obok.
2. **Sekrety w Cloudflare.** Adres i klucz do Supabase są wgrane bezpośrednio do Cloudflare, nie do kodu. Są *tylko do zapisu* — można je nadpisać, ale nigdy odczytać. Nie ma ich w repozytorium, więc publiczny kod niczego nie zdradza.
3. **Sekrety w GitHubie.** Osobny komplet, żeby automat mógł zbudować aplikację i zalogować się do Cloudflare.
4. **Projekt Supabase we Frankfurcie.** Region wybrano świadomie (dane w UE) i **nie da się go później zmienić** — tylko założyć projekt od nowa.
5. **Klucz `anon`, nigdy `service_role`.** Ten drugi omija wszystkie zabezpieczenia bazy. W aplikacji, której główną obietnicą jest „dane właścicieli nie wychodzą poza budynek", byłby to poważny błąd.

## Jak sprawdzić, czy działa

```
https://estate-manager.estate-manager.workers.dev/api/health
```

| Odpowiedź | Znaczenie |
|---|---|
| `{"status":"ok"}` | Aplikacja żyje i widzi bazę danych |
| `misconfigured` | Brakuje sekretów — nie zostały wgrane |
| `degraded` | Sekrety są, ale baza nie odpowiada (np. klucz wygasł) |

Ten adres istnieje z konkretnego powodu. Bez niego aplikacja może wdrożyć się „na zielono", a mimo to nie działać — bo brak klucza do bazy nie zatrzymuje budowania, tylko po cichu wyłącza logowanie. To sprawdzenie zamienia cichą awarię w głośną. **Zajrzyj tu najpierw, gdy coś się dzieje.**

## Jak cofnąć nieudane wdrożenie

Cloudflare trzyma poprzednie wersje. Powrót do wcześniejszej to dwie komendy:

```bash
npx wrangler versions list      # pokaż wersje
npx wrangler rollback <id>      # wróć do wybranej
```

**Uwaga:** cofa się wyłącznie *kod*. Zmiany w strukturze bazy danych nie są tym objęte — dziś to nieistotne, bo bazy jeszcze nie ma, ale stanie się istotne przy pierwszej prawdziwej tabeli.

## Czego jeszcze brakuje

- **Site URL w Supabase nie jest ustawiony.** Linki potwierdzające w mailach rejestracyjnych prowadzą pod zły adres. Do zrobienia w panelu Supabase — kod tego nie załatwi.
- **Pełna ścieżka użytkownika nigdy nie została przejechana na produkcji**: rejestracja → mail → potwierdzenie → logowanie. Blokuje to punkt powyżej.
- **Nie ma środowiska testowego.** Każde wdrożenie idzie od razu na produkcję. Akceptowalne, dopóki nie ma prawdziwych danych.
