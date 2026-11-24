#!/usr/bin/env bash
# Regenera database/schema.sql desde una base PostgreSQL con TODAS las migraciones aplicadas.
# La fuente de verdad sigue siendo supabase/migrations/ (ADR-02): este archivo es solo referencia.
#
# Uso:
#   DATABASE_URL='postgresql://usuario:clave@host:5432/base' database/pruebas/regenerar-esquema.sh
#
# También funciona con las variables estándar de PostgreSQL en lugar de DATABASE_URL:
#   PGHOST=localhost PGUSER=postgres PGDATABASE=zaru_prueba database/pruebas/regenerar-esquema.sh
set -euo pipefail

RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
DESTINO="$RAIZ/database/schema.sql"

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "Falta pg_dump. Instale el cliente de PostgreSQL (pg_dump 17 para igualar Supabase)." >&2
  exit 1
fi

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

# --no-password evita que pg_dump espere una contraseña en una tarea no interactiva.
# La URL se pasa como parámetro; nunca se imprime ni se guarda en el archivo generado.
if [[ -n "${DATABASE_URL:-}" ]]; then
  pg_dump --dbname="$DATABASE_URL" --no-password \
    --schema-only --no-owner --no-privileges \
    --schema=public --schema=privado > "$TMP"
else
  pg_dump --no-password \
    --schema-only --no-owner --no-privileges \
    --schema=public --schema=privado > "$TMP"
fi

{
  echo '-- Esquema de referencia de ZARU Ecosystem (solo lectura).'
  echo '-- Generado desde una base con todas las migraciones aplicadas; NO se edita a mano (ADR-02).'
  echo '-- Para regenerarlo: database/pruebas/regenerar-esquema.sh con DATABASE_URL o variables PG*.'
  echo '-- Fuente de verdad: supabase/migrations/.'
  echo ''
  cat "$TMP"
} > "$DESTINO"

echo "OK: $DESTINO regenerado ($(wc -l < "$DESTINO") líneas)."
