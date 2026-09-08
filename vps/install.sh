#!/bin/bash
# Instalacja konwertera feedu na świeżym serwerze, jako root.
# Przetestowane: Ubuntu 26.04 LTS i Debian 13. Działa na każdym systemie z apt (Ubuntu 22.04+, Debian 12+).
# NIE działa na Fedorze/AlmaLinux/Rocky (dnf) ani FreeBSD - tam trzeba zmienić menedżer pakietów.
#
#   DOMAIN=feed.lidiakalita.pl CERTBOT_EMAIL=twoj@mail.pl bash install.sh
#
# Co robi:
#   1. instaluje python3, nginx, certbot
#   2. kopiuje konwerter do /opt/lidiakalita-feed i uruchamia go raz
#   3. dodaje cron co godzinę (/etc/cron.d/lidiakalita-feed, log w /var/log/lidiakalita-feed.log)
#   4. stawia nginx: https://DOMAIN/products.csv i /products.txt
#   5. jeśli podano CERTBOT_EMAIL i DNS już wskazuje na ten serwer - wystawia certyfikat Let's Encrypt
# Skrypt można uruchamiać wielokrotnie (idempotentny).
set -euo pipefail

DOMAIN="${DOMAIN:?Podaj domenę, np. DOMAIN=feed.lidiakalita.pl bash install.sh}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-}"
FEED_URL="${FEED_URL:-https://esklep.lidiakalita.pl/data/export/feed10001_1f09ee580133fa5e0ddea5b9.xml}"
APP_DIR=/opt/lidiakalita-feed
OUT_DIR=/var/www/feeds/lidiakalita
LOG=/var/log/lidiakalita-feed.log
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

[ "$(id -u)" -eq 0 ] || { echo "uruchom jako root (sudo)"; exit 1; }
[ -f "$HERE/idosell_feed_to_csv.py" ] || { echo "brak $HERE/idosell_feed_to_csv.py obok install.sh"; exit 1; }

echo "== 1/5 pakiety"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q python3 nginx certbot python3-certbot-nginx curl

echo "== 2/5 konwerter + pierwszy przebieg"
mkdir -p "$APP_DIR" "$OUT_DIR"
install -m 755 "$HERE/idosell_feed_to_csv.py" "$APP_DIR/idosell_feed_to_csv.py"
"$APP_DIR/idosell_feed_to_csv.py" --url "$FEED_URL" --out-dir "$OUT_DIR" | tee -a "$LOG"

echo "== 3/5 cron (co godzinę o :17)"
cat > /etc/cron.d/lidiakalita-feed <<CRON
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
17 * * * * root $APP_DIR/idosell_feed_to_csv.py --url "$FEED_URL" --out-dir $OUT_DIR >> $LOG 2>&1
CRON
chmod 644 /etc/cron.d/lidiakalita-feed
cat > /etc/logrotate.d/lidiakalita-feed <<ROT
$LOG {
    monthly
    rotate 6
    compress
    missingok
    notifempty
}
ROT

echo "== 4/5 nginx"
cat > /etc/nginx/sites-available/lidiakalita-feed <<NGX
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

    root $OUT_DIR;
    autoindex off;
    charset utf-8;
    charset_types text/csv text/plain;
    types { text/csv csv; text/plain txt; }
    default_type text/plain;
    add_header Cache-Control "public, max-age=900";

    location = / { return 302 /products.csv; }
    location ~ /\. { deny all; }      # pliki tymczasowe .tmp-* z zapisu atomowego
    location / { try_files \$uri =404; }
}
NGX
mkdir -p /etc/nginx/sites-enabled
ln -sf /etc/nginx/sites-available/lidiakalita-feed /etc/nginx/sites-enabled/lidiakalita-feed
nginx -t
systemctl enable --now nginx
systemctl reload nginx

echo "-- test lokalny"
curl -sS -o /dev/null -w "HTTP %{http_code}  %{content_type}  %{size_download} B\n" -H "Host: $DOMAIN" http://127.0.0.1/products.csv

echo "== 5/5 HTTPS"
if [ -n "$CERTBOT_EMAIL" ]; then
    if certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$CERTBOT_EMAIL" --redirect; then
        echo "certyfikat OK, odnawianie automatyczne (systemd timer certbot.timer)"
    else
        echo "UWAGA: certbot się nie powiódł (zwykle DNS jeszcze nie wskazuje na ten serwer)."
        echo "Gdy rekord A/AAAA dla $DOMAIN będzie aktualny, uruchom:"
        echo "  certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m $CERTBOT_EMAIL --redirect"
    fi
else
    echo "Pominięto certyfikat (brak CERTBOT_EMAIL). Później:"
    echo "  certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m TWOJ@MAIL --redirect"
fi

echo
echo "GOTOWE. Adresy feedu:"
echo "  https://$DOMAIN/products.csv"
echo "  https://$DOMAIN/products.txt"
echo "Log konwersji: $LOG   Cron: /etc/cron.d/lidiakalita-feed"
