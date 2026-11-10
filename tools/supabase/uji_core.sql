-- Pengujian fondasi Core: relasi keluarga lintas sekolah, persetujuan foto,
-- privasi guru, blokir anon, dan akses wali yang belum diverifikasi.
\set ON_ERROR_STOP 1
\o /dev/null

-- Data uji saja (dibuat setelah seluruh uji presensi/pegawai/dasbor).
insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-0000000000b1', 'wali1@contoh.test'),
 ('00000000-0000-0000-0000-0000000000b2', 'wali2@contoh.test'),
 ('00000000-0000-0000-0000-0000000000c7', 'guru-b-tanpa-wali@contoh.test');
-- Guru tambahan hanya mengajar VIII-B, tidak berstatus wali kelas VIII-A.
insert into public.pengguna (id, sekolah_id, nama, peran)
 values ('00000000-0000-0000-0000-0000000000c7',
         '10000000-0000-0000-0000-000000000001','Guru B Tanpa Penugasan Wali','guru');
insert into public.mengajar (guru_id, rombel_id, sekolah_id, mapel)
 values ('00000000-0000-0000-0000-0000000000c7',
         '20000000-0000-0000-0000-000000000002',
         '10000000-0000-0000-0000-000000000001','Matematika');

insert into public.siswa (id, sekolah_id, rombel_id, no_absen, nama)
values ('40000000-0000-0000-0000-000000000099',
        '10000000-0000-0000-0000-000000000002',
        '20000000-0000-0000-0000-000000000003', 1, 'Siswa Sekolah Lain');

select set_config('uji.core.s1', (select id::text from public.siswa where rombel_id =
  '20000000-0000-0000-0000-000000000001' and no_absen = 1), false);
select set_config('uji.core.s2', (select id::text from public.siswa where rombel_id =
  '20000000-0000-0000-0000-000000000002' and no_absen = 1), false);

-- Admin sekolah 1: wali terverifikasi, wali menunggu, persetujuan foto.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
insert into public.wali_keluarga (id, sekolah_id, akun_id, nama) values
 ('50000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000b1','Wali Terverifikasi'),
 ('50000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000b2','Wali Belum Diverifikasi');
insert into public.hubungan_siswa_wali (sekolah_id, siswa_id, wali_id, jenis, status, diverifikasi_oleh, diverifikasi_at)
values
 ('10000000-0000-0000-0000-000000000001',current_setting('uji.core.s1')::uuid,
 '50000000-0000-0000-0000-000000000001','ibu','terverifikasi',
 '00000000-0000-0000-0000-0000000000a1',now()),
 ('10000000-0000-0000-0000-000000000001',current_setting('uji.core.s2')::uuid,
 '50000000-0000-0000-0000-000000000002','ayah','menunggu',null,null);
insert into public.persetujuan_foto (siswa_id, sekolah_id, tujuan, status, dicatat_oleh)
values
 (current_setting('uji.core.s1')::uuid, '10000000-0000-0000-0000-000000000001',
  'identifikasi_guru', 'disetujui','00000000-0000-0000-0000-0000000000a1'),
 (current_setting('uji.core.s2')::uuid, '10000000-0000-0000-0000-000000000001',
  'identifikasi_guru', 'ditolak','00000000-0000-0000-0000-0000000000a1');
insert into public.foto_siswa (siswa_id, sekolah_id, storage_path, jenis_berkas, ukuran_byte, diunggah_oleh)
values (current_setting('uji.core.s1')::uuid,'10000000-0000-0000-0000-000000000001',
        'sekolah/10000000-0000-0000-0000-000000000001/s1.webp', 'image/webp', 40000,
        '00000000-0000-0000-0000-0000000000a1');
do $$ begin
 assert (select count(*) from public.foto_siswa) = 1, 'Foto dengan izin dapat dicatat';
 assert (select count(*) from public.audit where aksi = 'foto_persetujuan') = 2, 'Izin foto tercatat dalam audit';
 begin
   insert into public.foto_siswa (siswa_id, sekolah_id, storage_path, jenis_berkas, ukuran_byte)
     values (current_setting('uji.core.s2')::uuid,'10000000-0000-0000-0000-000000000001',
             'sekolah/10000000-0000-0000-0000-000000000001/s2.webp','image/webp',30000);
   raise exception 'GAGAL: admin menambah foto tanpa persetujuan';
 exception when insufficient_privilege then null;
 end;
end $$;
commit;

-- FK komposit menolak relasi lintas sekolah bahkan bila bypass RLS (mis. job terprivileg).
do $$ begin
 begin
   insert into public.hubungan_siswa_wali (sekolah_id, siswa_id, wali_id, jenis)
   values ('10000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000099',
      '50000000-0000-0000-0000-000000000001','ibu');
   raise exception 'GAGAL: hubungan wali lintas sekolah diterima';
 exception when foreign_key_violation then null;
 end;
end $$;

-- Satu akun keluarga boleh terdaftar pada dua sekolah tetapi relasinya tidak tercampur.
insert into public.wali_keluarga (id, sekolah_id, akun_id, nama)
values ('50000000-0000-0000-0000-000000000003',
        '10000000-0000-0000-0000-000000000002',
        '00000000-0000-0000-0000-0000000000b1','Wali di sekolah lain');

-- Orang tua terverifikasi hanya melihat relasinya, BUKAN seluruh tabel siswa.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
do $$ declare n integer; begin
 assert (select count(*) from public.wali_keluarga) = 2, 'Wali melihat profilnya pada dua sekolah';
 assert (select count(*) from public.hubungan_siswa_wali) = 1, 'Wali melihat relasi terverifikasi saja';
 assert (select count(*) from public.siswa) = 0, 'Wali belum boleh SELECT tabel siswa';
 assert (select count(*) from public.presensi) = 0, 'Wali belum boleh SELECT tabel presensi';
 assert (select count(*) from public.foto_siswa) = 0, 'Wali belum boleh SELECT metadata foto';
 assert (select count(*) from public.kuis) = 0, 'Wali belum boleh SELECT kuis guru';
 update public.hubungan_siswa_wali set status = 'dicabut' where wali_id = '50000000-0000-0000-0000-000000000001';
 get diagnostics n = row_count;
 assert n = 0, 'Wali tidak boleh mengubah relasi sendiri';
end $$;
rollback;

-- Wali belum diverifikasi tidak boleh melihat hubungan siswa.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
do $$ begin
 assert (select count(*) from public.wali_keluarga) = 1, 'Wali boleh melihat profilnya sendiri';
 assert (select count(*) from public.hubungan_siswa_wali) = 0, 'Wali belum terverifikasi tidak melihat relasi';
 assert (select count(*) from public.siswa) = 0, 'Wali belum terverifikasi tidak bisa membaca siswa';
end $$;
rollback;

-- Guru hanya melihat foto+izin anak pada kelas yang diajar.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
do $$ begin
 assert (select count(*) from public.foto_siswa) = 1, 'Guru A melihat metadata foto kelasnya';
 assert (select count(*) from public.persetujuan_foto) = 1, 'Guru A melihat izin kelasnya';
 assert (select count(*) from public.wali_keluarga) = 0, 'Guru A tidak membuka daftar wali keluarga';
 assert (select count(*) from public.hubungan_siswa_wali) = 0, 'Guru A tidak membuka relasi wali';
end $$;
rollback;
-- Guru a3 sebenarnya wali VIII-A (ditetapkan uji_presensi.sql): akses sah karena tugas wali.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
do $$ begin
 assert (select count(*) from public.foto_siswa) = 1, 'Wali kelas VIII-A dapat melihat foto kelas binaan';
 assert (select count(*) from public.persetujuan_foto) = 2, 'Wali VIII-A + guru VIII-B melihat izin kedua kelas';
end $$;
rollback;

-- Guru a5 hanya mengajar VIII-B dan TIDAK punya tugas wali VIII-A.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c7';
do $$ begin
 assert (select count(*) from public.foto_siswa) = 0, 'Guru tanpa penugasan kelas A tidak melihat foto kelas A';
 assert (select count(*) from public.persetujuan_foto) = 1, 'Guru B hanya melihat izin kelas B';
end $$;
rollback;

-- Setelah persetujuan dicabut, foto lama tetap di tabel tetapi tidak dapat dibaca guru.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
update public.persetujuan_foto set status = 'dicabut', dicatat_at = now(), dicatat_oleh = public.saya()
 where siswa_id = current_setting('uji.core.s1')::uuid and tujuan = 'identifikasi_guru';
commit;
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
do $$ begin
 assert (select count(*) from public.foto_siswa) = 0, 'Izin dicabut: foto tak terlihat';
end $$;
rollback;

begin;
set local role anon;
do $$ begin
 begin
   perform count(*) from public.wali_keluarga;
   raise exception 'GAGAL: anon membaca tabel wali';
 exception when insufficient_privilege then null; end;
 begin
   perform count(*) from public.foto_siswa;
   raise exception 'GAGAL: anon membaca foto';
 exception when insufficient_privilege then null; end;
end $$;
rollback;

\o
\echo 'Semua uji Cikaracak Core lulus (RLS, pemisahan sekolah, wali dan foto).'
