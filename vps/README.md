# Feed produktowy Lidia Kalita: IDOSell XML → CSV/TSV dla ChatGPT

IDOSell wystawia feed wyłącznie jako XML (Google Merchant RSS 2.0):
`https://esklep.lidiakalita.pl/data/export/feed10001_1f09ee580133fa5e0ddea5b9.xml`

Specyfikacja feedu ChatGPT (developers.openai.com/commerce/specs/feed) w wariancie
„Google-compatible” przyjmuje **tylko** `.csv` (przecinek) lub `.txt`/`.tsv` (tabulator),
opcjonalnie spakowane gzipem. XML/RSS jest wprost niewspierany. Stąd ten konwerter.

## Co robi `idosell_feed_to_csv.py`

* pobiera XML (3 próby, timeout 90 s), parsuje wszystkie `<item>`,
* zapisuje `products.csv` i `products.txt` (TSV), UTF-8, nagłówek w nazwach Google Merchant
  (`id, item_group_id, title, description, link, image_link, additional_image_link, price,
  sale_price, availability, condition, brand, gtin, mpn, color, size, product_type,
  shipping_weight, display_ads_link, adwords_grouping`) – nowe pola z IDOSell dopisują się same na końcu,
* wiele zdjęć → jedna kolumna rozdzielona przecinkiem, wiele kolorów → `/` (konwencja Google),
* nowe linie w opisach zamienia na spacje,
* pusty `description` (w feedzie ma go 300 z 497 grup produktowych!) zastępuje zdaniem
  z tytułu, marki, kategorii, koloru i rozmiaru – ChatGPT odrzuca wiersze bez opisu.
  Wyłączenie: `--no-fill-description`. Docelowo warto uzupełnić opisy w IDOSell
  albo sprawdzić, czy szablon feedu `feed10001` mapuje `description` na właściwe pole (opis krótki vs długi),
* zapis atomowy: przy błędzie pobrania/parsowania stare pliki zostają, skrypt zwraca kod 1.

Wymagania: Python 3.8+, bez dodatkowych pakietów. Czas działania: ~0,5 s.

## Wariant A (zalecany): własny świeży VPS, jedno polecenie

Wystarczy najmniejszy VPS (1 vCPU, 1 GB RAM). Wybierz czystą dystrybucję z apt:
przetestowane Ubuntu 26.04 LTS (zalecane) i Debian 13; działa też Ubuntu 22.04/24.04 i Debian 12.
Fedora, AlmaLinux, Rocky i FreeBSD wymagałyby przeróbki instalatora.
konwersja trwa pół sekundy raz na godzinę. Przed instalacją ustaw w DNS rekord A
dla wybranej domeny (np. `feed.lidiakalita.pl`) na IP serwera, żeby od razu dostać HTTPS.

```bash
# na laptopie: wgraj pliki
scp idosell_feed_to_csv.py install.sh root@IP_SERWERA:/root/

# na serwerze
ssh root@IP_SERWERA
DOMAIN=feed.lidiakalita.pl CERTBOT_EMAIL=twoj@mail.pl bash /root/install.sh
```

`install.sh` instaluje python3/nginx/certbot, kopiuje konwerter do `/opt/lidiakalita-feed`,
robi pierwszy przebieg, dodaje cron co godzinę (`/etc/cron.d/lidiakalita-feed`),
logrotate, stawia nginx pod `https://DOMAIN/products.csv` i `/products.txt` i wystawia
certyfikat Let's Encrypt (odnawiany automatycznie). Gdy DNS jeszcze nie działa,
certbot się nie uda, a skrypt wypisze polecenie do ponownego uruchomienia. Skrypt można
odpalać wielokrotnie.

Sprawdzenie po instalacji:

```bash
curl -I https://feed.lidiakalita.pl/products.csv     # 200, text/csv, świeży Last-Modified
tail -n 5 /var/log/lidiakalita-feed.log              # jedna linia OK na godzinę
```

Zmiana adresu feedu IDOSell lub domeny: edytuj `/etc/cron.d/lidiakalita-feed`
i `/etc/nginx/sites-available/lidiakalita-feed`, albo uruchom `install.sh` ponownie z nowymi zmiennymi.

### Ręczne wdrożenie na serwerze, na którym już jest nginx

```bash
sudo mkdir -p /opt/lidiakalita-feed /var/www/feeds/lidiakalita
sudo cp idosell_feed_to_csv.py /opt/lidiakalita-feed/
sudo chmod +x /opt/lidiakalita-feed/idosell_feed_to_csv.py
sudo /opt/lidiakalita-feed/idosell_feed_to_csv.py \
  --url "https://esklep.lidiakalita.pl/data/export/feed10001_1f09ee580133fa5e0ddea5b9.xml" \
  --out-dir /var/www/feeds/lidiakalita
```

Cron (co godzinę; IDOSell odświeża feed co 4 h, więc opóźnienie ≤ 1 h):

```
17 * * * * root /opt/lidiakalita-feed/idosell_feed_to_csv.py --url "https://esklep.lidiakalita.pl/data/export/feed10001_1f09ee580133fa5e0ddea5b9.xml" --out-dir /var/www/feeds/lidiakalita >> /var/log/lidiakalita-feed.log 2>&1
```

nginx, blok wewnątrz istniejącego `server { ... }` z HTTPS (`^~`, żeby regexowe lokacje
`\.(png|jpg|...)$` nie przechwyciły ścieżki; `deny` chroni pliki tymczasowe `.tmp-*`):

```nginx
location ^~ /feeds/lidiakalita/ {
    alias /var/www/feeds/lidiakalita/;
    types { text/csv csv; text/plain txt; }
    default_type text/plain;
    charset utf-8;
    charset_types text/csv text/plain;
    add_header Cache-Control "public, max-age=900";
    autoindex off;
    location ~ /\. { deny all; }
}
```

## Push do OpenAI przez SFTP (oficjalna droga dla merchantów)

Według przewodnika file-upload (developers.openai.com/commerce/specs/file-upload/overview)
merchant **wypycha** feed na SFTP OpenAI (host i klucz dostajesz przy onboardingu),
pod stałą nazwą pliku, nadpisując go przy każdej aktualizacji; zalecany format `csv.gz`.
Dopisz do crona po konwersji:

```
20 * * * * root cd /var/www/feeds/lidiakalita && gzip -kf products.csv && sftp -i /root/.ssh/openai_feed -b <(echo "put products.csv.gz products.csv.gz") SFTP_USER@SFTP_HOST >> /var/log/lidiakalita-feed.log 2>&1
```

Jeśli w Twoim onboardingu OpenAI podał pole „feed URL” zamiast SFTP, wystarczy adres z wariantu A.

## Wariant B: bez serwera – GitHub Actions + raw.githubusercontent.com

Repo publiczne (feed i tak jest publiczny) z plikiem `.github/workflows/feed.yml`
(w tym katalogu). Akcja co godzinę uruchamia konwerter i commituje `feed/products.csv`,
dostępny pod `https://raw.githubusercontent.com/ORG/REPO/main/feed/products.csv`.
Minusy: cron GitHuba potrafi spóźnić się o kilkadziesiąt minut, a historia repo rośnie
o ~1,6 MB skompresowanego diffu tygodniowo–miesięcznie (git deduplikuje niezmienione wiersze, więc w praktyce dużo mniej).
