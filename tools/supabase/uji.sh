#!/usr/bin/env bash
# Uji migrasi Supabase di PostgreSQL biasa.
#   - Bila PGHOST/PGPORT/PGUSER sudah diatur (mis. layanan postgres di CI), langsung dipakai.
#   - Bila tidak, membuat klaster sementara dengan initdb (butuh paket postgresql).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SEMENTARA=""
if [ -z "${PGHOST:-}" ]; then
  PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)"
  [ -n "$PGBIN" ] || { echo "PostgreSQL tidak ditemukan. Atur PGHOST atau pasang postgresql."; exit 1; }
  SEMENTARA="$(mktemp -d)"
  chmod 777 "$SEMENTARA"
  JALANKAN() { if [ "$(id -u)" = "0" ]; then su -s /bin/sh nobody -c "$*"; else sh -c "$*"; fi; }
  JALANKAN "$PGBIN/initdb -D $SEMENTARA/data -U postgres -A trust >/dev/null"
  JALANKAN "$PGBIN/pg_ctl -D $SEMENTARA/data -o \"-k $SEMENTARA -p 5499 -h ''\" -l $SEMENTARA/log start >/dev/null"
  sleep 2
  export PGHOST="$SEMENTARA" PGPORT=5499 PGUSER=postgres
  trap 'JALANKAN "$PGBIN/pg_ctl -D $SEMENTARA/data stop -m fast >/dev/null"; rm -rf "$SEMENTARA"' EXIT
fi
export PGDATABASE="${PGDATABASE:-postgres}"
export PGOPTIONS="-c client_min_messages=warning"
psql -q -v ON_ERROR_STOP=1 -c "drop database if exists uji_pkk" -c "create database uji_pkk"
export PGDATABASE=uji_pkk
psql -q -v ON_ERROR_STOP=1 -f "$ROOT/tools/supabase/stub_auth.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "migrasi: $(basename "$f")"
  psql -q -v ON_ERROR_STOP=1 -f "$f"
done
# migrasi harus bisa dijalankan dua kali untuk data CP (idempoten)
psql -q -v ON_ERROR_STOP=1 -f "$ROOT/supabase/migrations/20261024000003_ref_cp_2025.sql"
psql -q -v ON_ERROR_STOP=1 -f "$ROOT/tools/supabase/uji_rls.sql"
