-- Uji aturan akses (RLS). Dijalankan oleh tools/supabase/uji.sh setelah semua migrasi.
-- Setiap blok DO memakai ASSERT; bila gagal, psql berhenti dengan pesan yang menjelaskan aturannya.
\set ON_ERROR_STOP 1

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-0000000000a2'),
  ('00000000-0000-0000-0000-0000000000a3'), ('00000000-0000-0000-0000-0000000000a4');
insert into public.sekolah (id, nama, npsn, jenjang) values
  ('10000000-0000-0000-0000-000000000001', 'SMP Contoh 1', '20212345', 'SMP'),
  ('10000000-0000-0000-0000-000000000002', 'SMP Contoh 2', '20212346', 'SMP');
insert into public.pengguna (id, sekolah_id, nama, peran) values
  ('00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001', 'Admin Satu', 'admin'),
  ('00000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-000000000001', 'Guru A', 'guru'),
  ('00000000-0000-0000-0000-0000000000a3', '10000000-0000-0000-0000-000000000001', 'Guru B', 'guru'),
  ('00000000-0000-0000-0000-0000000000a4', '10000000-0000-0000-0000-000000000002', 'Guru C', 'guru');
insert into public.rombel (id, sekolah_id, nama, tingkat, tahun_ajaran) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'VIII-A', 8, '2026/2027'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'VIII-B', 8, '2026/2027'),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', 'VII-A', 7, '2026/2027');
insert into public.siswa (sekolah_id, rombel_id, no_absen, nama)
  select '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', g, 'Siswa A' || g from generate_series(1, 30) g;
insert into public.siswa (sekolah_id, rombel_id, no_absen, nama)
  select '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', g, 'Siswa B' || g from generate_series(1, 28) g;
insert into public.mengajar (guru_id, rombel_id, mapel, sekolah_id) values
  ('00000000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-000000000001', 'IPA', '10000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-0000000000a3', '20000000-0000-0000-0000-000000000002', 'IPA', '10000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-0000000000a4', '20000000-0000-0000-0000-000000000003', 'IPA', '10000000-0000-0000-0000-000000000002');
insert into public.kuis (id, sekolah_id, guru_id, rombel_id, topik, mapel) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-000000000001', 'Pernapasan', 'IPA'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a3', '20000000-0000-0000-0000-000000000002', 'Gaya', 'IPA');
insert into public.soal (kuis_id, nomor, kunci) select '30000000-0000-0000-0000-000000000001', g, 'A' from generate_series(1, 10) g;
insert into public.jawaban (kuis_id, siswa_id, nomor, isian, sumber)
  select '30000000-0000-0000-0000-000000000001', s.id, g, 'A', 'scan'
  from public.siswa s, generate_series(1, 10) g where s.rombel_id = '20000000-0000-0000-0000-000000000001';

-- ===== Guru A =====
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
do $$ begin
  assert (select count(*) from public.kuis) = 1, 'Guru A hanya melihat kuisnya sendiri';
  assert (select count(*) from public.rombel) = 1, 'Guru A hanya melihat rombel yang diajarnya';
  assert (select count(*) from public.siswa) = 30, 'Guru A hanya melihat siswa rombelnya';
  assert (select count(*) from public.jawaban) = 300, 'Guru A melihat jawaban kuisnya';
  assert (select count(*) from public.ref_cp) = 532, 'Data CP terbaca oleh pengguna masuk';
end $$;
-- membuat kuis di rombel yang tidak diajarnya harus ditolak
do $$ begin
  begin
    insert into public.kuis (sekolah_id, guru_id, rombel_id, topik) values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-000000000002', 'Curang');
    raise exception 'GAGAL: Guru A bisa membuat kuis di rombel yang tidak diajarnya';
  exception when insufficient_privilege then null;
  end;
  -- menaikkan peran sendiri menjadi admin harus ditolak
  begin
    update public.pengguna set peran = 'admin' where id = '00000000-0000-0000-0000-0000000000a2';
    raise exception 'GAGAL: Guru A bisa menjadikan dirinya admin';
  exception when insufficient_privilege then null;
  end;
  -- memasukkan jawaban untuk siswa kelas lain ke kuisnya sendiri harus ditolak
  begin
    insert into public.jawaban (kuis_id, siswa_id, nomor, isian)
      select '30000000-0000-0000-0000-000000000001', id, 1, 'A' from public.siswa where rombel_id = '20000000-0000-0000-0000-000000000002' limit 1;
    if found then raise exception 'GAGAL: Guru A bisa menulis jawaban siswa kelas lain'; end if;
  exception when insufficient_privilege then null;
  end;
end $$;
update public.pengguna set nama = 'Guru A Baru' where id = '00000000-0000-0000-0000-0000000000a2';
do $$ begin assert (select nama from public.pengguna where id = auth.uid()) = 'Guru A Baru', 'Guru boleh mengganti namanya'; end $$;
-- kuis baru di rombel sendiri boleh
insert into public.kuis (sekolah_id, guru_id, rombel_id, topik) values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-000000000001', 'Kuis 2');
rollback;

-- ===== Guru B tidak melihat kuis Guru A =====
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
do $$ begin
  assert (select count(*) from public.kuis where id = '30000000-0000-0000-0000-000000000001') = 0, 'Guru B tidak boleh melihat kuis Guru A';
  assert (select count(*) from public.jawaban) = 0, 'Guru B tidak boleh melihat jawaban kuis Guru A';
  assert (select count(*) from public.siswa) = 28, 'Guru B melihat siswa rombelnya saja';
end $$;
rollback;

-- ===== Admin =====
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$ begin
  assert (select count(*) from public.siswa) = 58, 'Admin melihat semua siswa sekolahnya';
  assert (select count(*) from public.kuis) = 0, 'Admin TIDAK boleh membaca kuis guru';
  assert (select count(*) from public.jawaban) = 0, 'Admin TIDAK boleh membaca jawaban siswa';
  assert (select jumlah_kuis from public.rekap_sekolah() where mapel = 'IPA') = 2, 'Rekap sekolah menghitung kuis';
  assert (select jumlah_guru from public.rekap_sekolah() where mapel = 'IPA') = 2, 'Rekap sekolah menghitung guru';
end $$;
insert into public.rombel (sekolah_id, nama, tahun_ajaran) values ('10000000-0000-0000-0000-000000000001', 'IX-A', '2026/2027');
do $$ begin
  begin
    insert into public.rombel (sekolah_id, nama, tahun_ajaran) values ('10000000-0000-0000-0000-000000000002', 'Sekolah lain', '2026/2027');
    raise exception 'GAGAL: admin bisa menulis ke sekolah lain';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

-- ===== Guru sekolah lain dan pengunjung tanpa login =====
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a4';
do $$ begin
  assert (select count(*) from public.siswa) = 0, 'Guru sekolah lain tidak melihat siswa sekolah ini';
  assert (select count(*) from public.pengguna where sekolah_id = '10000000-0000-0000-0000-000000000001') = 0, 'Daftar guru sekolah lain tertutup';
end $$;
rollback;

begin;
set local role anon;
do $$ begin
  begin
    perform count(*) from public.siswa;
    raise exception 'GAGAL: pengunjung tanpa login bisa membaca tabel siswa';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

\echo 'Semua uji RLS lulus.'
