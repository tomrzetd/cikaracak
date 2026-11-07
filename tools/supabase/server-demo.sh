#!/usr/bin/env bash
# "Supabase mini" di komputer sendiri: PostgreSQL + PostgREST + gerbang login tiruan, berisi data demo
# SMPN 2 Jalaksana (siswa fiktif). Untuk uji otomatis dan untuk mencoba halaman Presensi tanpa akun Supabase.
#
#   POSTGREST=/jalur/postgrest bash tools/supabase/server-demo.sh              # jalan sampai Ctrl+C
#   POSTGREST=/jalur/postgrest bash tools/supabase/server-demo.sh python3 tests/e2e/uji_presensi.py
#
# PostgREST: unduh berkas statis dari https://github.com/PostgREST/postgrest/releases (v12.2.3).
# Bila PGHOST/PGPORT/PGUSER sudah diatur (mis. layanan postgres di CI), basis data itu yang dipakai.
# Akun demo: operator@contoh.sch.id / demo12345 (admin), wali@contoh.sch.id / demo12345 (wali VIII-A).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PGRST_BIN="${POSTGREST:-postgrest}"
command -v "$PGRST_BIN" >/dev/null || { echo "PostgREST tidak ditemukan. Atur POSTGREST=/jalur/postgrest"; exit 1; }
export RAHASIA="rahasia-uji-cikaracak-minimal-32-karakter"
PORT_PGRST="${PORT_PGRST:-3000}"
PORT_GERBANG="${PORT_GERBANG:-54321}"
SEMENTARA="$(mktemp -d)"; chmod 777 "$SEMENTARA"
PID=()
bersih() {
  for p in "${PID[@]:-}"; do [ -n "$p" ] && kill "$p" 2>/dev/null || true; done
  [ -n "${PGBIN:-}" ] && JALANKAN "$PGBIN/pg_ctl -D $SEMENTARA/data stop -m fast >/dev/null" || true
  rm -rf "$SEMENTARA"
}
trap bersih EXIT

if [ -z "${PGHOST:-}" ]; then
  PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)"
  [ -n "$PGBIN" ] || { echo "PostgreSQL tidak ditemukan. Atur PGHOST atau pasang postgresql."; exit 1; }
  JALANKAN() { if [ "$(id -u)" = "0" ]; then su -s /bin/sh nobody -c "$*"; else sh -c "$*"; fi; }
  JALANKAN "$PGBIN/initdb -D $SEMENTARA/data -U postgres -A trust >/dev/null"
  JALANKAN "$PGBIN/pg_ctl -D $SEMENTARA/data -o \"-k $SEMENTARA -p 5498 -h 127.0.0.1\" -l $SEMENTARA/log start >/dev/null"
  sleep 2
  export PGHOST=127.0.0.1 PGPORT=5498 PGUSER=postgres
fi
export PGOPTIONS="-c client_min_messages=warning"
PSQL="psql -q -v ON_ERROR_STOP=1"
$PSQL -d postgres -c "drop database if exists cikaracak_demo" -c "create database cikaracak_demo"
export PGDATABASE=cikaracak_demo
$PSQL -f "$ROOT/tools/supabase/stub_auth.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do $PSQL -f "$f"; done
$PSQL <<'SQL'
do $$ begin create role authenticator login password 'sandi-authenticator' noinherit; exception when duplicate_object then null; end $$;
grant anon, authenticated to authenticator;
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000d001', 'operator@contoh.sch.id'),
  ('00000000-0000-4000-8000-00000000d002', 'wali@contoh.sch.id')
  on conflict do nothing;
SQL
$PSQL -f "$ROOT/supabase/demo.sql" >/dev/null
$PSQL <<'SQL'
insert into pengguna (id, sekolah_id, nama, peran)
  select '00000000-0000-4000-8000-00000000d002', id, 'Bu Wali', 'guru' from sekolah where nama = 'SMPN 2 Jalaksana'
  on conflict do nothing;
update rombel set wali_id = '00000000-0000-4000-8000-00000000d002' where nama = 'VIII-A';
SQL

PGRST_DB_URI="postgres://authenticator:sandi-authenticator@${PGHOST}:${PGPORT}/cikaracak_demo" \
PGRST_DB_SCHEMAS=public PGRST_DB_ANON_ROLE=anon PGRST_JWT_SECRET="$RAHASIA" PGRST_SERVER_PORT="$PORT_PGRST" \
PGRST_SERVER_HOST=127.0.0.1 PGRST_LOG_LEVEL=warn "$PGRST_BIN" >"$SEMENTARA/pgrst.log" 2>&1 &
PID+=($!)
AKUN='[{"email":"operator@contoh.sch.id","sandi":"demo12345","id":"00000000-0000-4000-8000-00000000d001"},
       {"email":"wali@contoh.sch.id","sandi":"demo12345","id":"00000000-0000-4000-8000-00000000d002"}]' \
PGRST="http://127.0.0.1:$PORT_PGRST" node "$ROOT/tools/supabase/gerbang.mjs" "$PORT_GERBANG" >"$SEMENTARA/gerbang.log" 2>&1 &
PID+=($!)
for i in $(seq 1 50); do
  curl -sf "http://127.0.0.1:$PORT_PGRST/" >/dev/null 2>&1 && grep -q ANON= "$SEMENTARA/gerbang.log" 2>/dev/null && break
  sleep 0.2
done
curl -sf "http://127.0.0.1:$PORT_PGRST/" >/dev/null || { echo "PostgREST gagal jalan:"; cat "$SEMENTARA/pgrst.log"; exit 1; }
export SERVER_URL="http://127.0.0.1:$PORT_GERBANG"
export ANON_KEY="$(grep -o 'ANON=.*' "$SEMENTARA/gerbang.log" | cut -d= -f2)"
export DEMO_ALAT="$($PSQL -At -c "select a.id || ' ' || encode(k.kunci, 'hex') from alat a join alat_kunci k on k.alat_id = a.id limit 1")"

if [ $# -gt 0 ]; then
  "$@"
else
  echo "Supabase mini siap."
  echo "  Alamat server : $SERVER_URL"
  echo "  Kunci anon    : $ANON_KEY"
  echo "  Akun          : operator@contoh.sch.id / demo12345  (admin)"
  echo "                  wali@contoh.sch.id / demo12345      (wali VIII-A)"
  echo "  Alat demo     : $DEMO_ALAT"
  echo "Buka aplikasi (node tools/serve.js), halaman Presensi, isi alamat & kunci di atas. Ctrl+C untuk berhenti."
  wait
fi
