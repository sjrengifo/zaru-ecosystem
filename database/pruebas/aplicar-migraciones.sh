#!/usr/bin/env bash
# Crea una base vacía y aplica, en orden, todas las migraciones de supabase/migrations.
# La conexión se toma de las variables estándar de PostgreSQL (PGHOST, PGPORT, PGUSER, PGPASSWORD).
# Uso: PGHOST=localhost PGUSER=postgres ./database/pruebas/aplicar-migraciones.sh zaru_prueba
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
BASE="${1:-zaru_prueba}"

psql -d postgres -qc "drop database if exists $BASE" -c "create database $BASE"
psql -d "$BASE" -q -v ON_ERROR_STOP=1 -f "$RAIZ/database/pruebas/00_entorno_supabase_minimo.sql"
for archivo in "$RAIZ"/supabase/migrations/*.sql; do
  echo "Aplicando $(basename "$archivo")"
  psql -d "$BASE" -q -v ON_ERROR_STOP=1 -f "$archivo"
done
echo "OK: $(ls "$RAIZ"/supabase/migrations/*.sql | wc -l) migraciones aplicadas en la base $BASE"
