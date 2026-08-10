#!/bin/sh
# Backup diario: pg_dump + tar de uploads, subidos a GCS. Corre por cron en
# la VM (ver prep-backup-cron en el plan de migración, Fase 7). Vive en
# /opt/eike/backup.sh en la VM — este archivo del repo es la fuente de verdad,
# se copia a mano (no hay pipeline de infra todavía, ver README de infra).
set -eu

FECHA=$(date +%Y-%m-%d_%H%M)
DIR=/opt/eike/backups
BUCKET=gs://eike-503422-backups

cd /opt/eike
. ./.env

mkdir -p "$DIR"

echo "[$FECHA] pg_dump..."
docker compose -f compose.prod.yml exec -T db pg_dump -U eike -d eike | gzip > "$DIR/db_$FECHA.sql.gz"

echo "[$FECHA] tar de uploads..."
docker run --rm -v eike_uploads:/uploads -v "$DIR":/backup alpine \
  tar czf "/backup/uploads_$FECHA.tar.gz" -C /uploads .

echo "[$FECHA] subiendo a GCS..."
gcloud storage cp "$DIR/db_$FECHA.sql.gz" "$BUCKET/db/"
gcloud storage cp "$DIR/uploads_$FECHA.tar.gz" "$BUCKET/uploads/"

# No dejar más de 3 copias locales (el bucket ya tiene su propio ciclo de
# vida a 30 días) — la VM tiene 30GB de disco, no hay margen para acumular.
ls -1t "$DIR"/db_*.sql.gz 2>/dev/null | tail -n +4 | xargs -r rm --
ls -1t "$DIR"/uploads_*.tar.gz 2>/dev/null | tail -n +4 | xargs -r rm --

echo "[$FECHA] listo."
