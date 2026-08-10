#!/bin/bash
# Fase 9/10 — cutover a eike.com.py con HTTPS real. Correr EN LA VM
# (/opt/eike) recién cuando el DNS de eike.com.py ya resuelva a esta IP
# (verificar antes con: dig +short eike.com.py — tiene que dar 34.56.167.44).
set -euo pipefail
cd /opt/eike

echo "=== 1. Verificando que el DNS ya apunta acá ==="
RESUELVE=$(dig +short eike.com.py A | tail -1)
if [ "$RESUELVE" != "34.56.167.44" ]; then
  echo "El DNS de eike.com.py todavía resuelve a '$RESUELVE', no a esta VM. Abortando."
  echo "(si acaba de cambiarse, puede tardar unos minutos/horas en propagar)"
  exit 1
fi
echo "OK: eike.com.py -> 34.56.167.44"

echo "=== 2. Activando el Caddyfile con el dominio (HTTPS automático) ==="
cp Caddyfile.dominio Caddyfile
docker compose -f compose.prod.yml up -d caddy

echo "=== 3. Esperando que Caddy consiga el certificado (Let's Encrypt) ==="
sleep 15
docker compose -f compose.prod.yml logs caddy --tail 30

echo "=== 4. Activando COOKIE_SECURE y SITE_URL con https:// real ==="
sed -i 's|^SITE_URL=.*|SITE_URL=https://eike.com.py|' .env
sed -i 's|^COOKIE_SECURE=.*|COOKIE_SECURE=true|' .env
grep -q COOKIE_SECURE .env || echo 'COOKIE_SECURE=true' >> .env
docker compose -f compose.prod.yml up -d web

echo "=== 5. Verificación ==="
sleep 3
curl -s -o /dev/null -w "https://eike.com.py -> HTTP %{http_code}\n" https://eike.com.py/
curl -s -o /dev/null -w "http://eike.com.py -> HTTP %{http_code} (debe ser 301/308 a https)\n" http://eike.com.py/

echo "=== listo — falta solo apagar el PHP viejo en el hosting compartido (fuera de esta VM) ==="
