-- Uji dasbor sekolah dan kelas demo. Dijalankan setelah uji_pegawai.sql.
\set ON_ERROR_STOP 1
\o /dev/null
-- jadwal setiap hari agar uji tidak bergantung pada hari dijalankan
insert into public.jadwal (sekolah_id, hari, jam_masuk, toleransi_menit, jam_pulang)
  select '10000000-0000-0000-0000-000000000001', h, '07:00', 10, '13:30' from generate_series(6, 7) h on conflict do nothing;
delete from public.kalender_libur;

begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$ declare j jsonb; d jsonb; n int; begin
  j := public.buat_kelas_demo(24, 10);
  assert (j ->> 'siswa')::int = 24 and (j ->> 'hari_sekolah')::int = 10, 'Kelas demo dibuat: ' || j::text;
  begin
    perform public.buat_kelas_demo(24, 10);
    raise exception 'GAGAL: kelas demo ganda';
  exception when unique_violation then null;
  end;
  select count(*) into n from public.presensi pr join public.siswa si on si.id = pr.siswa_id join public.rombel r on r.id = si.rombel_id where r.demo;
  assert n between 150 and 240, 'Riwayat demo tersimulasi: ' || n;
  assert (select count(*) from public.presensi pr join public.siswa si on si.id = pr.siswa_id join public.rombel r on r.id = si.rombel_id
          where r.demo and pr.terlambat_menit > 0) > 0, 'Ada siswa demo yang terlambat';

  d := public.dasbor_sekolah(14, true);
  assert (d ->> 'siswa')::int = 24 and jsonb_array_length(d -> 'harian') >= 10, 'Dasbor demo: ' || left(d::text, 200);
  assert (select sum((x ->> 'hadir')::int + (x ->> 'terlambat')::int + (x ->> 'izin_sakit')::int + (x ->> 'tidak_tercatat')::int)
          from jsonb_array_elements(d -> 'harian') x) = 24 * jsonb_array_length(d -> 'harian'), 'Jumlah per hari = jumlah siswa';
  assert jsonb_array_length(d -> 'kedatangan') > 3, 'Sebaran jam datang terisi';
  assert not exists (select 1 from jsonb_array_elements(d -> 'kedatangan') x where x ->> 'jam' < '05:00' or x ->> 'jam' > '12:00'), 'Jam datang 05.00-12.00';
  d := public.dasbor_sekolah(14, false);
  assert (d ->> 'siswa')::int = 58, 'Dasbor sekolah tidak tercampur kelas demo';
end $$;
commit;

-- kartu uji demo dikenali alat
do $$ begin
  assert exists (select 1 from public.kartu k join public.siswa si on si.id = k.siswa_id
                 where k.uid_hash = public._hash_uid('DE000001') and si.panggilan = 'Adit'), 'Kartu uji DE000001 milik Adit (demo)';
end $$;

-- guru biasa & TU tidak bisa membuka dasbor sekolah / membuat demo
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
do $$ begin
  begin perform public.dasbor_sekolah(); raise exception 'GAGAL: guru membuka dasbor sekolah';
  exception when insufficient_privilege then null; end;
  begin perform public.buat_kelas_demo(); raise exception 'GAGAL: guru membuat kelas demo';
  exception when insufficient_privilege then null; end;
end $$;
rollback;

begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$ begin
  assert public.hapus_kelas_demo() = 1, 'Kelas demo dihapus';
  assert not exists (select 1 from public.rombel where demo), 'Tidak ada sisa kelas demo';
  assert not exists (select 1 from public.siswa where nama like '%(demo)'), 'Siswa demo ikut terhapus';
end $$;
commit;
\o
\echo 'Semua uji dasbor & demo lulus.'
