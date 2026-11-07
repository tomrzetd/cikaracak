-- Uji presensi RFID. Dijalankan oleh tools/supabase/uji.sh setelah uji_rls.sql (memakai data contohnya).
\set ON_ERROR_STOP 1
\o /dev/null

-- ===== Vektor uji HMAC bersama (firmware memakai vektor yang sama di tests/firmware) =====
do $$ begin
  assert encode(hmac(convert_to(E'ATESTKEY\n1762480000\nnonce0001\nA1B2C3D4\n0', 'UTF8'),
                     decode('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f', 'hex'), 'sha256'), 'hex')
         = 'c2aabcda63071a3c914a36ba5fdc4fc6cd215e37779ea37d35fa0a5ac0915a03', 'Vektor HMAC tidak cocok';
end $$;

-- ===== Data tambahan =====
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a5', 'piket@contoh.sch.id'),
  ('00000000-0000-0000-0000-0000000000a6', 'guru.baru@contoh.sch.id');
insert into public.pengguna (id, sekolah_id, nama, peran, piket) values
  ('00000000-0000-0000-0000-0000000000a5', '10000000-0000-0000-0000-000000000001', 'Petugas Piket', 'guru', true);
-- Guru B menjadi wali VIII-A (ia tidak mengajar di sana)
update public.rombel set wali_id = '00000000-0000-0000-0000-0000000000a3' where id = '20000000-0000-0000-0000-000000000001';
update public.siswa set panggilan = 'Adit' where rombel_id = '20000000-0000-0000-0000-000000000001' and no_absen = 1;

-- Hari uji: hari kerja terakhir sebelum hari ini (WIB), pasti dalam 7 hari terakhir
select set_config('uji.hari', (select d::date::text from generate_series((now() at time zone 'Asia/Jakarta')::date - 1,
  (now() at time zone 'Asia/Jakarta')::date - 5, interval '-1 day') d where extract(isodow from d) <= 5 limit 1), false);
create or replace function pg_temp.siswa(no int) returns uuid language sql as
$$ select id from public.siswa where rombel_id = '20000000-0000-0000-0000-000000000001' and no_absen = no $$;
select set_config('uji.s1', pg_temp.siswa(1)::text, false), set_config('uji.s2', pg_temp.siswa(2)::text, false),
       set_config('uji.s3', pg_temp.siswa(3)::text, false), set_config('uji.s4', pg_temp.siswa(4)::text, false),
       set_config('uji.s5', pg_temp.siswa(5)::text, false);

-- Alat tiruan: menandatangani permintaan persis seperti firmware
create schema uji;
grant usage on schema uji to anon, authenticated;
create function uji.jam(d date, t time) returns timestamptz language sql immutable as $$ select (d + t) at time zone 'Asia/Jakarta' $$;
create function uji.tap(p_uid text, p_waktu timestamptz, p_nonce text, p_offline boolean default true) returns jsonb
language plpgsql as $$
declare w bigint := case when p_waktu is null then 0 else floor(extract(epoch from p_waktu))::bigint end;
        a text := current_setting('uji.alat');
begin
  return public.catat_tap(a, p_uid, w, p_nonce, p_offline,
    encode(hmac(convert_to(a || E'\n' || w || E'\n' || p_nonce || E'\n' || upper(p_uid) || E'\n' || case when p_offline then '1' else '0' end, 'UTF8'),
                decode(current_setting('uji.kunci'), 'hex'), 'sha256'), 'hex'));
end $$;
grant execute on all functions in schema uji to anon, authenticated;

-- ===== Admin menyiapkan jadwal, alat, kartu =====
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
insert into public.jadwal (sekolah_id, hari, jam_masuk, toleransi_menit, jam_pulang)
  select '10000000-0000-0000-0000-000000000001', h, '07:00', 10, '13:30' from generate_series(1, 5) h;
-- hari ini dijadikan libur agar uji tap online (jam server) hasilnya pasti
insert into public.kalender_libur (sekolah_id, tanggal, keterangan)
  values ('10000000-0000-0000-0000-000000000001', (now() at time zone 'Asia/Jakarta')::date, 'Libur uji');
select set_config('uji.alat', j ->> 'id', false), set_config('uji.kunci', j ->> 'kunci', false)
  from (select public.buat_alat('Gerbang utama') j) x;
do $$ begin
  assert current_setting('uji.alat') ~ '^[A-Z0-9]{8}$', 'ID alat 8 karakter';
  assert length(current_setting('uji.kunci')) = 64, 'Kunci alat 32 byte';
  perform public.daftar_kartu_manual(current_setting('uji.s1')::uuid, 'a1b2 c3d4');         -- huruf kecil & spasi dirapikan
  perform public.daftar_kartu_manual(current_setting('uji.s2')::uuid, '04A1B2C3D4E5F6');    -- UID 7 byte
  begin
    perform public.daftar_kartu_manual(current_setting('uji.s3')::uuid, 'A1B2C3D4');
    raise exception 'GAGAL: satu kartu bisa didaftarkan ke dua siswa';
  exception when unique_violation then null;
  end;
  assert (select count(*) from public.kartu where aktif) = 2, 'Dua kartu aktif';
end $$;
commit;

do $$ begin
  assert not exists (select 1 from public.kartu where uid_hash = convert_to('A1B2C3D4', 'UTF8')), 'UID tidak boleh tersimpan apa adanya';
  assert (select count(*) from public.alat_kunci) = 1, 'Kunci alat tersimpan';
end $$;

-- ===== Alat mengirim tap (tanpa login, kunci anon) =====
begin;
set local role anon;
do $$
declare r jsonb; d date := current_setting('uji.hari')::date; a text := current_setting('uji.alat');
begin
  r := uji.tap('A1B2C3D4', uji.jam(d, '06:50'), 'n0000001');
  assert r ->> 'hasil' = 'hadir' and r ->> 'nama' = 'Adit' and r ->> 'jam' = '06:50', 'Tap pagi = hadir: ' || r::text;
  r := uji.tap('A1B2C3D4', uji.jam(d, '06:50'), 'n0000001');
  assert r ->> 'hasil' = 'hadir' and (r ->> 'ulang')::boolean, 'Kirim ulang nonce yang sama tidak dihitung dua kali: ' || r::text;
  r := uji.tap('A1B2C3D4', uji.jam(d, '07:05'), 'n0000002');
  assert r ->> 'hasil' = 'sudah', 'Tap kedua dalam 30 menit = sudah: ' || r::text;
  r := uji.tap('04A1B2C3D4E5F6', uji.jam(d, '07:25'), 'n0000003');
  assert r ->> 'hasil' = 'terlambat' and (r ->> 'terlambat_menit')::int = 25, 'Lewat toleransi = terlambat 25 menit: ' || r::text;
  r := uji.tap('04a1b2c3d4e5f6', uji.jam(d, '10:00'), 'n0000004');
  assert r ->> 'hasil' = 'pulang_awal', 'Keluar sebelum jam pulang = pulang_awal: ' || r::text;
  r := uji.tap('A1B2C3D4', uji.jam(d, '13:40'), 'n0000005');
  assert r ->> 'hasil' = 'pulang', 'Setelah jam pulang = pulang: ' || r::text;
  r := uji.tap('DEADBEEF', uji.jam(d, '07:00'), 'n0000006');
  assert r ->> 'hasil' = 'tidak_dikenal' and not r ? 'nama', 'Kartu asing: ' || r::text;
  r := uji.tap('A1B2C3D4', now() - interval '8 days', 'n0000007');
  assert r ->> 'hasil' = 'kedaluwarsa', 'Antrean offline lebih dari 7 hari ditolak: ' || r::text;
  r := uji.tap('A1B2C3D4', now() + interval '1 hour', 'n0000008', false);
  assert r ->> 'hasil' = 'waktu_salah', 'Jam alat di masa depan ditolak: ' || r::text;
  r := uji.tap('A1B2C3D4', null, 'n0000009', false);
  assert r ->> 'hasil' = 'libur', 'Tap pada hari libur: ' || r::text;

  -- tanda tangan palsu, alat palsu, format salah
  r := public.catat_tap(a, 'A1B2C3D4', 1762480000, 'n0000010', true, repeat('0', 64));
  assert r ->> 'hasil' = 'tanda_salah', 'Tanda palsu ditolak';
  r := public.catat_tap('ZZZZZZZZ', 'A1B2C3D4', 1762480000, 'n0000011', true, repeat('a', 64));
  assert r ->> 'hasil' = 'tanda_salah', 'Alat tak terdaftar ditolak';
  r := public.catat_tap(a, 'XYZ', 1762480000, 'n0000012', true, repeat('a', 64));
  assert r ->> 'hasil' = 'format_salah', 'UID tidak sah ditolak';
  -- mengubah UID pada permintaan yang sah membatalkan tanda tangan
  r := public.catat_tap(a, 'DEADBEEF', 1762480000, 'nonce0001', false,
         encode(hmac(convert_to(a || E'\n1762480000\nnonce0001\nA1B2C3D4\n0', 'UTF8'), decode(current_setting('uji.kunci'), 'hex'), 'sha256'), 'hex'));
  assert r ->> 'hasil' = 'tanda_salah', 'UID yang diganti terdeteksi';

  -- laporan kesehatan alat
  r := public.lapor_alat(a, floor(extract(epoch from now()))::bigint, '0.1.0', 3,
         encode(hmac(convert_to(a || E'\n' || floor(extract(epoch from now()))::bigint || E'\n0.1.0\n3', 'UTF8'),
                     decode(current_setting('uji.kunci'), 'hex'), 'sha256'), 'hex'));
  assert r ->> 'hasil' = 'ok' and r ->> 'alat' = 'Gerbang utama', 'Laporan alat diterima: ' || r::text;

  -- tanpa login tidak bisa membaca apa pun dan tidak bisa memanggil fungsi admin
  begin
    if (select count(*) from public.presensi) + (select count(*) from public.kartu) + (select count(*) from public.tap)
       + (select count(*) from public.alat) + (select count(*) from public.audit) > 0 then
      raise exception 'GAGAL: anon bisa membaca data presensi';
    end if;
  exception when insufficient_privilege then null;
  end;
  begin
    perform count(*) from public.alat_kunci;
    raise exception 'GAGAL: anon bisa membuka tabel kunci alat';
  exception when insufficient_privilege then null;
  end;
  begin
    perform count(*) from public.rahasia;
    raise exception 'GAGAL: anon bisa membuka tabel rahasia';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.buat_alat('Alat palsu');
    raise exception 'GAGAL: anon bisa membuat alat';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.presensi_kelas('20000000-0000-0000-0000-000000000001');
    raise exception 'GAGAL: anon bisa membaca presensi kelas';
  exception when insufficient_privilege then null;
  end;
end $$;
commit;

do $$ declare p public.presensi; begin
  select * into p from public.presensi where siswa_id = current_setting('uji.s1')::uuid;
  assert p.masuk_at = uji.jam(current_setting('uji.hari')::date, '06:50') and p.pulang_at = uji.jam(current_setting('uji.hari')::date, '13:40'),
    'Jam masuk & pulang siswa 1 tersimpan';
  assert (select terlambat_menit from public.presensi where siswa_id = current_setting('uji.s2')::uuid) = 25, 'Menit terlambat tersimpan';
  assert (select count(*) from public.tap where alat_id = current_setting('uji.alat')) = 9, 'Setiap tap bertanda sah tercatat sekali';
end $$;

-- ===== Daftar kartu lewat alat (petugas piket) =====
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a5';
select public.mulai_daftar_kartu(current_setting('uji.alat'), current_setting('uji.s3')::uuid);
commit;
begin;
set local role anon;
do $$ declare r jsonb; begin
  r := uji.tap('CAFEBABE', null, 'n0000020', true);
  assert r ->> 'hasil' = 'tidak_dikenal', 'Tap dari antrean offline tidak dipakai untuk mendaftar: ' || r::text;
  r := uji.tap('CAFEBABE', null, 'n0000021', false);
  assert r ->> 'hasil' = 'terdaftar' and r ->> 'nama' = 'Siswa', 'Kartu berikutnya terdaftar untuk siswa 3: ' || r::text;
  r := uji.tap('CAFEBABE', null, 'n0000022', false);
  assert r ->> 'hasil' = 'libur', 'Kartu baru langsung dikenali: ' || r::text;
end $$;
commit;
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a5';
select public.mulai_daftar_kartu(current_setting('uji.alat'), current_setting('uji.s4')::uuid);
commit;
begin;
set local role anon;
do $$ declare r jsonb; begin
  r := uji.tap('A1B2C3D4', null, 'n0000023', false);
  assert r ->> 'hasil' = 'kartu_terpakai', 'Kartu milik siswa lain tidak bisa dipindah lewat mode daftar: ' || r::text;
end $$;
commit;

-- ===== Guru A (mengajar VIII-A, bukan wali) =====
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
do $$ declare d date := current_setting('uji.hari')::date; begin
  assert (select count(*) from public.presensi_kelas('20000000-0000-0000-0000-000000000001', d)) = 30, 'Daftar hadir satu kelas';
  assert (select keadaan from public.presensi_kelas('20000000-0000-0000-0000-000000000001', d) where no_absen = 1) = 'hadir', 'Siswa 1 hadir';
  assert (select keadaan from public.presensi_kelas('20000000-0000-0000-0000-000000000001', d) where no_absen = 2) = 'terlambat', 'Siswa 2 terlambat';
  assert (select keadaan from public.presensi_kelas('20000000-0000-0000-0000-000000000001', d) where no_absen = 5) = 'belum', 'Tanpa tap = belum tercatat, bukan alpa';
  assert (select punya_kartu from public.presensi_kelas('20000000-0000-0000-0000-000000000001', d) where no_absen = 3), 'Siswa 3 punya kartu';
  assert (select count(*) from public.presensi) = 2, 'Guru A melihat presensi kelasnya';
  begin
    perform * from public.presensi_kelas('20000000-0000-0000-0000-000000000002', d);
    raise exception 'GAGAL: Guru A melihat presensi kelas yang tidak diajarnya';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.ubah_presensi(current_setting('uji.s4')::uuid, d, 'A', 'Tanpa keterangan');
    raise exception 'GAGAL: guru yang bukan wali bisa mengubah presensi';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.buat_alat('Alat guru');
    raise exception 'GAGAL: guru bisa membuat alat';
  exception when insufficient_privilege then null;
  end;
  assert (select count(*) from public.alat) = 0 and (select count(*) from public.kartu) = 0, 'Guru biasa tidak melihat alat & kartu';
end $$;
rollback;

-- ===== Guru B (wali VIII-A) =====
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
do $$ declare d date := current_setting('uji.hari')::date; begin
  assert (select count(*) from public.siswa) = 58, 'Wali melihat siswa perwaliannya + kelas yang diajarnya';
  perform public.ubah_presensi(current_setting('uji.s4')::uuid, d, 'S', 'Demam, surat dari orang tua');
  assert (select keadaan from public.presensi_kelas('20000000-0000-0000-0000-000000000001', d) where no_absen = 4) = 'sakit', 'Wali mengisi Sakit';
  begin
    perform public.ubah_presensi(current_setting('uji.s5')::uuid, d, 'A', null);
    raise exception 'GAGAL: Alpa tanpa alasan diterima';
  exception when others then
    if sqlerrm like 'GAGAL%' then raise; end if;
  end;
  begin
    perform public.ubah_presensi(current_setting('uji.s4')::uuid, current_date + 30, 'I', 'Acara keluarga');
    raise exception 'GAGAL: presensi hari depan bisa diisi';
  exception when others then
    if sqlerrm like 'GAGAL%' then raise; end if;
  end;
  begin
    update public.pengguna set piket = true where id = auth.uid();
    raise exception 'GAGAL: guru bisa menjadikan dirinya petugas piket';
  exception when insufficient_privilege then null;
  end;
end $$;
commit;

begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
do $$ declare d date := current_setting('uji.hari')::date; r record; begin
  select * into r from public.rekap_bulan('20000000-0000-0000-0000-000000000001', d) where no_absen = 2;
  assert r.hadir >= 1 and r.terlambat = 1 and r.menit_terlambat = 25, 'Rekap: terlambat dihitung';
  select * into r from public.rekap_bulan('20000000-0000-0000-0000-000000000001', d) where no_absen = 4;
  assert r.sakit = 1 and r.alpa = 0, 'Rekap: sakit dihitung, tidak ada alpa otomatis';
  assert r.hari_sekolah = r.hadir + r.sakit + r.izin + r.alpa + r.belum, 'Rekap: jumlah hari konsisten';
  assert exists (select 1 from public.peringatan_kelas('20000000-0000-0000-0000-000000000001') where no_absen = 5 and alasan like '%tidak tercatat%'),
    'Siswa yang berhari-hari tidak tercatat muncul di daftar perlu disapa';
end $$;
rollback;

-- ===== Petugas piket, guru sekolah lain, admin =====
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a5';
do $$ begin
  assert (select count(*) from public.alat) = 1, 'Piket melihat alat sekolahnya';
  assert (select count(*) from public.presensi_kelas('20000000-0000-0000-0000-000000000002')) = 28, 'Piket melihat semua kelas';
  begin
    perform public.ubah_presensi(current_setting('uji.s4')::uuid, current_setting('uji.hari')::date, 'H', null);
    raise exception 'GAGAL: petugas piket bisa mengubah presensi';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a4';
do $$ begin
  assert (select count(*) from public.presensi) + (select count(*) from public.jadwal) + (select count(*) from public.alat) = 0,
    'Sekolah lain tidak melihat apa pun';
  begin
    perform * from public.presensi_kelas('20000000-0000-0000-0000-000000000001');
    raise exception 'GAGAL: guru sekolah lain bisa membaca presensi';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$ declare r jsonb; begin
  assert (select count(*) from public.audit where aksi = 'presensi_ubah') = 1, 'Perubahan presensi tercatat di audit';
  assert (select count(*) from public.tap) >= 12, 'Admin melihat log tap';
  perform public.undang_pengguna('GURU.BARU@contoh.sch.id', 'Guru Baru');
  assert exists (select 1 from public.pengguna where id = '00000000-0000-0000-0000-0000000000a6'), 'Admin mengundang guru lewat email';
  begin
    perform public.undang_pengguna('tidak.ada@contoh.sch.id', 'Siapa');
    raise exception 'GAGAL: undangan ke email tanpa akun diterima';
  exception when no_data_found then null;
  end;
  begin
    update public.alat set sekolah_id = '10000000-0000-0000-0000-000000000002';
    raise exception 'GAGAL: admin bisa memindahkan alat ke sekolah lain';
  exception when insufficient_privilege then null;
  end;
  r := public.ganti_kunci_alat(current_setting('uji.alat'));
  assert r ->> 'kunci' <> current_setting('uji.kunci'), 'Kunci baru berbeda';
end $$;
commit;

-- kunci lama tidak berlaku lagi
begin;
set local role anon;
do $$ begin
  assert uji.tap('A1B2C3D4', null, 'n0000030', false) ->> 'hasil' = 'tanda_salah', 'Kunci lama ditolak setelah diganti';
end $$;
commit;

drop schema uji cascade;
\echo 'Semua uji presensi lulus.'
