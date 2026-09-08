#!/usr/bin/env python3
"""
Konwerter feedu produktowego IDOSell (Google Merchant RSS 2.0, XML) do CSV i TSV.

Użycie:
    idosell_feed_to_csv.py --url URL --out-dir /var/www/feeds [--basename products]

Wynik (w --out-dir):
    products.csv   - przecinek, UTF-8, nagłówek w konwencji Google Merchant (id, title, price, ...)
    products.txt   - to samo rozdzielone tabulatorem (TSV)

Zasady:
  * pola wielokrotne: additional_image_link -> rozdzielone przecinkiem, color -> rozdzielone "/"
    (tak jak w specyfikacji Google Merchant dla plików CSV/TSV)
  * białe znaki (w tym nowe linie w opisach) sprowadzone do pojedynczej spacji
  * pusty description (pole wymagane przez ChatGPT) jest uzupełniany zdaniem złożonym z tytułu,
    marki, kategorii, koloru i rozmiaru; wyłączenie: --no-fill-description
  * zapis atomowy: plik tymczasowy + rename; jeśli pobranie lub parsowanie się nie uda,
    poprzednie pliki zostają nietknięte, a skrypt kończy się kodem != 0
  * bez zależności poza biblioteką standardową Pythona 3.8+
"""
import argparse
import csv
import os
import re
import sys
import tempfile
import time
import urllib.request
import xml.etree.ElementTree as ET

G = "{http://base.google.com/ns/1.0}"

# Kolejność kolumn; tagi spoza listy są dopisywane na końcu automatycznie.
KNOWN_COLUMNS = [
    ("id", G + "id"),
    ("item_group_id", G + "item_group_id"),
    ("title", "title"),
    ("description", "description"),
    ("link", "link"),
    ("image_link", G + "image_link"),
    ("additional_image_link", G + "additional_image_link"),
    ("price", G + "price"),
    ("sale_price", G + "sale_price"),
    ("availability", G + "availability"),
    ("condition", G + "condition"),
    ("brand", G + "brand"),
    ("gtin", G + "gtin"),
    ("mpn", G + "mpn"),
    ("color", G + "color"),
    ("size", G + "size"),
    ("product_type", G + "product_type"),
    ("shipping_weight", G + "shipping_weight"),
    ("display_ads_link", G + "display_ads_link"),
    ("adwords_grouping", "adwords_grouping"),
]
MULTI_SEPARATOR = {"additional_image_link": ",", "color": "/"}
DEFAULT_MULTI_SEPARATOR = ","

WS = re.compile(r"\s+")


def log(msg):
    print(time.strftime("%Y-%m-%d %H:%M:%S"), msg, flush=True)


def fetch(url, timeout=90, attempts=3):
    last = None
    for i in range(1, attempts + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "idosell-feed-to-csv/1.0"})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                data = r.read()
            if not data:
                raise RuntimeError("pusta odpowiedź")
            return data
        except Exception as e:  # noqa: BLE001
            last = e
            log(f"pobranie nieudane (próba {i}/{attempts}): {e}")
            time.sleep(5 * i)
    raise RuntimeError(f"nie udało się pobrać feedu: {last}")


def local_name(tag):
    return tag.split("}", 1)[1] if "}" in tag else tag


def clean(text):
    return WS.sub(" ", text or "").strip()


def fallback_description(values):
    """Neutralny opis z danych, które w feedzie są zawsze: tytuł, marka, kategoria, kolor, rozmiar."""
    def first(tag):
        vals = [v for v in values.get(tag, []) if v]
        return vals[0] if vals else ""
    title = first("title")
    brand = first(G + "brand")
    category = first(G + "product_type").split(">")[-1].strip().lower()
    color = "/".join(v for v in values.get(G + "color", []) if v)
    size = first(G + "size")
    parts = [title]
    if brand:
        parts.append(f"marki {brand}")
    if category:
        parts.append(f"z kategorii {category}")
    tail = []
    if color:
        tail.append(f"kolor: {color}")
    if size and size.lower() != "uniwersalny":
        tail.append(f"rozmiar: {size}")
    text = " ".join(parts)
    if tail:
        text += ", " + ", ".join(tail)
    return text + "."


def parse(data, fill_description=True):
    root = ET.fromstring(data)
    items = root.findall("./channel/item")
    if not items:
        raise RuntimeError("w feedzie nie ma żadnego <item> - odmawiam nadpisania starych plików")

    known_tags = {tag for _, tag in KNOWN_COLUMNS}
    extra_tags = sorted({ch.tag for it in items for ch in it if ch.tag not in known_tags})
    columns = KNOWN_COLUMNS + [(local_name(t), t) for t in extra_tags]
    if extra_tags:
        log("nowe pola w feedzie dopisane na końcu: " + ", ".join(local_name(t) for t in extra_tags))

    rows = []
    filled = 0
    for it in items:
        values = {}
        for ch in it:
            values.setdefault(ch.tag, []).append(clean(ch.text))
        if fill_description and not any(values.get("description", [])):
            values["description"] = [fallback_description(values)]
            filled += 1
        row = []
        for name, tag in columns:
            vals = [v for v in values.get(tag, []) if v]
            row.append(MULTI_SEPARATOR.get(name, DEFAULT_MULTI_SEPARATOR).join(vals))
        rows.append(row)
    if filled:
        log(f"uzupełniono pusty description w {filled} wierszach (tytuł+marka+kategoria+kolor+rozmiar)")
    return [name for name, _ in columns], rows


def write_atomic(path, header, rows, delimiter):
    directory = os.path.dirname(os.path.abspath(path))
    fd, tmp = tempfile.mkstemp(prefix=".tmp-", dir=directory)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="") as f:
            w = csv.writer(f, delimiter=delimiter, quoting=csv.QUOTE_MINIMAL, lineterminator="\n")
            w.writerow(header)
            w.writerows(rows)
        os.chmod(tmp, 0o644)
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--url", required=True, help="adres feedu XML z IDOSell")
    ap.add_argument("--out-dir", required=True, help="katalog wyjściowy (np. /var/www/feeds)")
    ap.add_argument("--basename", default="products", help="nazwa plików bez rozszerzenia (domyślnie products)")
    ap.add_argument("--keep-xml", action="store_true", help="zachowaj też pobrany XML w katalogu wyjściowym")
    ap.add_argument("--no-fill-description", action="store_true",
                    help="nie uzupełniaj pustych opisów (domyślnie uzupełniane, bo ChatGPT wymaga niepustego description)")
    args = ap.parse_args()

    os.makedirs(args.out_dir, exist_ok=True)
    started = time.time()
    data = fetch(args.url)
    header, rows = parse(data, fill_description=not args.no_fill_description)

    csv_path = os.path.join(args.out_dir, args.basename + ".csv")
    tsv_path = os.path.join(args.out_dir, args.basename + ".txt")
    write_atomic(csv_path, header, rows, ",")
    write_atomic(tsv_path, header, rows, "\t")
    if args.keep_xml:
        write_xml = os.path.join(args.out_dir, args.basename + ".xml")
        fd, tmp = tempfile.mkstemp(prefix=".tmp-", dir=args.out_dir)
        with os.fdopen(fd, "wb") as f:
            f.write(data)
        os.chmod(tmp, 0o644)
        os.replace(tmp, write_xml)

    in_stock = sum(1 for r in rows if r[header.index("availability")] == "in stock")
    log(
        f"OK: {len(rows)} wierszy ({in_stock} in stock), {len(header)} kolumn, "
        f"{os.path.getsize(csv_path)//1024} KB csv, {time.time()-started:.1f}s -> {csv_path}"
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # noqa: BLE001
        log(f"BŁĄD: {e}")
        sys.exit(1)
