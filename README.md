# XML-to-CSV

Feed produktowy sklepu [Lidia Kalita](https://esklep.lidiakalita.pl) z IDOSell wychodzi
wyłącznie jako XML (Google Merchant RSS 2.0). ChatGPT przyjmuje tylko `.csv` albo `.txt`/`.tsv`,
a XML i RSS są wprost niewspierane. To repozytorium konwertuje jedno na drugie.

Feed źródłowy odświeża się co 4 godziny, więc konwersja musi działać sama, bez ręcznego eksportu.

## Dwa sposoby uruchomienia

**Aplikacja Next.js (korzeń repozytorium)** — wdrożenie na Vercela, bez serwera i bez crona.
Pliki powstają na żądanie i są buforowane na krawędzi.

**Skrypty w katalogu [`vps/`](vps/)** — konwerter w Pythonie plus instalator, który stawia
wszystko na własnym serwerze: cron co godzinę, nginx i certyfikat HTTPS.

Obie ścieżki dają **identyczny co do bajtu** wynik. Sprawdzone na tym samym pliku XML,
dla CSV i dla TSV.

## Adresy po wdrożeniu na Vercela

| Adres | Co zwraca |
|---|---|
| `/` | strona statusu: czy feed żyje, ile ma wariantów, kiedy sprawdzono |
| `/products.csv` | plik rozdzielany przecinkiem, otwiera się w oknie przeglądarki |
| `/products.txt` | plik rozdzielany tabulatorem (TSV), również w oknie |
| `/products.csv?dl=1` | to samo, ale wymusza pobranie na dysk |

Adres `/products.csv` jest tym, który podaje się w ChatGPT.

Oba adresy zwracają treść jako `text/plain`, dzięki czemu widać ją po kliknięciu w przeglądarce.
Typ `text/csv`, formalnie właściwy dla CSV, zmusza przeglądarki do pobierania pliku na dysk,
a konsumenci feedu i tak rozpoznają format po rozszerzeniu w adresie. Gdy potrzebny jest
właściwy typ MIME i pobranie, wystarczy dopisać `?dl=1`.

Cron nie jest potrzebny. Odpowiedź żyje godzinę na krawędzi Vercela (`s-maxage=3600`),
a po wygaśnięciu Vercel oddaje starą kopię i odświeża ją w tle (`stale-while-revalidate`).
IDOSell dostaje najwyżej jedno zapytanie na godzinę na region.

## Odświeżanie: co się dzieje samo

Nic nie trzeba uruchamiać ręcznie. Świeżość zapewniają dwa niezależne mechanizmy:

1. **Bufor na krawędzi.** Plik żyje godzinę (`CACHE_SECONDS`, domyślnie 3600).
   Pierwsze żądanie po tym czasie dostaje jeszcze starą kopię, a nowa powstaje w tle.
   Feed IDOSell odświeża się co 4 godziny, więc opóźnienie nie przekracza godziny.
2. **Codzienny cron Vercela** (`vercel.json`). Raz na dobę o 5:00 UTC, czyli 7:00 czasu polskiego,
   Vercel sam odpytuje `/products.csv` i `/products.txt`. Dzięki temu świeży plik czeka gotowy
   nawet wtedy, gdy przez całą dobę nikt pod te adresy nie zajrzy.

Chcąc odświeżać dokładnie raz dziennie zamiast co godzinę, ustaw `CACHE_SECONDS` na `86400`.
Wtedy jedynym momentem odświeżenia zostaje poranny cron.

> Plan Hobby dopuszcza dwa zadania cron uruchamiane raz dziennie i to jest dokładnie ten układ.
> Na planie Pro można zejść do pojedynczych minut.

## Wdrożenie

Z GitHuba (zalecane, każdy push to nowy deploy):

1. vercel.com → Add New → Project → wybierz to repozytorium → Deploy.
2. Vercel sam rozpozna Next.js. Żadna konfiguracja nie jest potrzebna.

Z laptopa, bez repozytorium:

```bash
npx vercel --prod
```

Lokalnie:

```bash
npm install && npm run dev
```

Własna domena (np. `feed.lidiakalita.pl`): Project → Settings → Domains → Add,
a w DNS rekord CNAME na `cname.vercel-dns.com`. Certyfikat HTTPS Vercel wystawia sam.

## Zmienne środowiskowe

Wszystkie opcjonalne. Adres feedu jest wpisany w `lib/feed.ts`, więc aplikacja działa bez ustawiania czegokolwiek.

| Zmienna | Domyślnie | Znaczenie |
|---|---|---|
| `FEED_URL` | adres feedu z `lib/feed.ts` | inny feed albo nowy klucz eksportu z IDOSell |
| `CACHE_SECONDS` | `3600` | jak długo krawędź Vercela trzyma plik |
| `FILL_DESCRIPTION` | `1` | `0` wyłącza uzupełnianie pustych opisów |

## Co robi konwersja

* Kolumny w nazewnictwie Google Merchant: `id`, `item_group_id`, `title`, `description`, `link`,
  `image_link`, `additional_image_link`, `price`, `sale_price`, `availability`, `condition`,
  `brand`, `gtin`, `mpn`, `color`, `size`, `product_type`, `shipping_weight`,
  `display_ads_link`, `adwords_grouping`. Nowe pola z IDOSell dopisują się na końcu automatycznie.
* Wiele zdjęć trafia do jednej kolumny rozdzielonej przecinkiem, wiele kolorów ukośnikiem,
  zgodnie z konwencją Google dla plików CSV.
* Nowe linie w opisach zamieniane są na spacje.
* **Pusty `description` jest uzupełniany** zdaniem z tytułu, marki, kategorii, koloru i rozmiaru.
  To pole wymagane przez ChatGPT, a w feedzie brakuje go w ponad połowie grup produktowych.
  Docelowo warto uzupełnić opisy w IDOSell albo sprawdzić, na co szablon `feed10001` mapuje opis.

## Sprawdzenie po wdrożeniu

```bash
curl -I https://TWOJ-PROJEKT.vercel.app/products.csv
```

Przydatne nagłówki w odpowiedzi:

* `X-Feed-Items` — liczba wariantów w pliku
* `X-Feed-Filled-Descriptions` — ile opisów uzupełniono automatycznie
* `X-Feed-Generated` — kiedy plik powstał
* `x-vercel-cache: HIT / MISS / STALE` — czy poszedł z bufora krawędzi

## Na co uważać

* **Plan Vercela.** Hobby jest wyłącznie do użytku niekomercyjnego, a feed sklepu takim
  użytkiem nie jest, więc formalnie potrzebny jest plan Pro. Sam ruch feedu mieści się
  w każdym planie z ogromnym zapasem.
* **Limit 4,5 MB na odpowiedź funkcji.** CSV waży ~1,6 MB, a klientom akceptującym gzip
  (ChatGPT, przeglądarki, `curl --compressed`) trasa oddaje ~140 KB. Zapas jest ponad 20-krotny.
* **Awaria IDOSell.** Trasy zwracają 502 z `Cache-Control: no-store`, a strona statusu
  pokazuje czerwony znacznik z treścią błędu.
* **SFTP do OpenAI.** Vercel nie ma stałego procesu ani SFTP. Jeśli OpenAI wymaga wypychania
  pliku na swój SFTP, czyli oficjalnej drogi dla merchantów, potrzebny jest wariant z `vps/`.

## Układ plików

```
app/
  layout.tsx             szkielet strony
  page.tsx               strona statusu
  globals.css            style, jasny i ciemny motyw
  products.csv/route.ts  trasa CSV
  products.txt/route.ts  trasa TSV
lib/
  feed.ts                pobranie XML-a i konwersja, rdzeń bez zależności od Next.js
  serve.ts               budowa odpowiedzi HTTP: gzip, nagłówki, bufor, obsługa błędu
vercel.json              codzienny cron odświeżający oba pliki
vps/
  install.sh             instalator na świeży serwer: cron, nginx, HTTPS
  idosell_feed_to_csv.py konwerter w Pythonie, tylko biblioteka standardowa
  konwertuj.command      uruchomienie dwuklikiem na macOS
  README.md              instrukcja wariantu serwerowego
```
