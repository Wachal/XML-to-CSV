#!/bin/zsh
# Dwuklik w Finderze: pobiera feed z IDOSell i zapisuje CSV/TXT na Biurku w folderze lidiakalita-feed.
cd "$(dirname "$0")"
OUT="$HOME/Desktop/lidiakalita-feed"
python3 ./idosell_feed_to_csv.py \
  --url "https://esklep.lidiakalita.pl/data/export/feed10001_1f09ee580133fa5e0ddea5b9.xml" \
  --out-dir "$OUT" && open "$OUT"
echo
echo "Gotowe. Naciśnij Enter, żeby zamknąć."
read
