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
psql -q -v ON_ERROR_STOP=1 -f "$ROOT/tools/supabase/uji_presensi.sql"
psql -q -v ON_ERROR_STOP=1 -f "$ROOT/tools/supabase/uji_pegawai.sql"

# Uji naik versi: migrasi pegawai dijalankan di atas data lama, seperti proyek Supabase yang sudah berjalan
# (operator dari demo.sql dengan kolom piket lama, kelas, siswa, penugasan mengajar, kuis).
export PGDATABASE=postgres
psql -q -v ON_ERROR_STOP=1 -c "drop database if exists uji_naik" -c "create database uji_naik"
export PGDATABASE=uji_naik
psql -q -v ON_ERROR_STOP=1 -f "$ROOT/tools/supabase/stub_auth.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  case "$(basename "$f")" in 20261110*|20261024000003*) continue;; esac
  psql -q -v ON_ERROR_STOP=1 -f "$f"
done
psql -q -v ON_ERROR_STOP=1 <<'SQL'
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000aaaa', 'operator@lama.test');
insert into sekolah (id, nama, jenjang) values ('10000000-0000-0000-0000-00000000aaaa', 'Sekolah Lama', 'SMP');
insert into pengguna (id, sekolah_id, nama, peran, piket) values ('00000000-0000-0000-0000-00000000aaaa', '10000000-0000-0000-0000-00000000aaaa', 'Operator', 'admin', true);
insert into rombel (id, sekolah_id, nama, tingkat, tahun_ajaran) values ('20000000-0000-0000-0000-00000000aaaa', '10000000-0000-0000-0000-00000000aaaa', '7A', 7, '2026/2027');
insert into siswa (sekolah_id, rombel_id, no_absen, nama) values ('10000000-0000-0000-0000-00000000aaaa', '20000000-0000-0000-0000-00000000aaaa', 1, 'Siswa Lama');
insert into mengajar (guru_id, rombel_id, mapel, sekolah_id) values ('00000000-0000-0000-0000-00000000aaaa', '20000000-0000-0000-0000-00000000aaaa', 'IPA', '10000000-0000-0000-0000-00000000aaaa');
insert into kuis (sekolah_id, guru_id, rombel_id, topik) values ('10000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-00000000aaaa', '20000000-0000-0000-0000-00000000aaaa', 'Kuis lama');
SQL
psql -q -v ON_ERROR_STOP=1 -f "$ROOT/supabase/migrations/20261110000001_pegawai.sql"
psql -q -v ON_ERROR_STOP=1 <<'SQL'
\o /dev/null
do $$ begin
  assert (select akun_id from pengguna where id = '00000000-0000-0000-0000-00000000aaaa') = '00000000-0000-0000-0000-00000000aaaa', 'Akun lama tersambung';
  assert (select count(*) from tugas where jenis = 'piket') = 5, 'Piket lama menjadi tugas Senin-Jumat';
end $$;
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000aaaa';
do $$ begin
  assert public.saya_admin() and public.sekolah_saya() = '10000000-0000-0000-0000-00000000aaaa', 'Operator lama tetap admin';
  assert (select count(*) from kuis) = 1 and (select count(*) from siswa) = 1, 'Kuis dan siswa lama tetap terbaca';
end $$;
rollback;
SQL
psql -q -v ON_ERROR_STOP=1 -f "$ROOT/supabase/demo.sql" >/dev/null 2>&1 && echo "GAGAL: demo.sql seharusnya menolak email yang tidak ada" && exit 1
echo "Uji naik versi lulus."
