-- Uji pegawai, jabatan, tugas, akun NIP/PegID. Dijalankan setelah uji_rls.sql dan uji_presensi.sql.
\set ON_ERROR_STOP 1
\o /dev/null

-- Pegawai tanpa akun (seperti hasil impor Excel), kepala sekolah, dan TU
insert into public.pengguna (id, sekolah_id, nama, peran, kode_impor) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Bu Wali Tanpa Akun', 'guru', 'excel-1'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Pak Kepala', 'kepsek', 'excel-2'),
  ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'Teh TU', 'tu', null);
do $$ begin
  assert (select akun_id from public.pengguna where id = '30000000-0000-0000-0000-000000000001') is null, 'Pegawai boleh tanpa akun';
  assert (select akun_id from public.pengguna where id = '00000000-0000-0000-0000-0000000000a1') = '00000000-0000-0000-0000-0000000000a1',
    'Cara lama (id = akun) tetap tersambung otomatis';
end $$;

-- ===== Operator: tugas, wali, akun =====
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$ declare r jsonb; begin
  update public.rombel set wali_id = '30000000-0000-0000-0000-000000000001' where id = '20000000-0000-0000-0000-000000000002';
  insert into public.mengajar (guru_id, rombel_id, mapel, sekolah_id)
    values ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'IPA', '10000000-0000-0000-0000-000000000001');
  -- piket HANYA pada hari selain hari ini
  insert into public.tugas (sekolah_id, pengguna_id, jenis, hari)
    select '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'piket', h from generate_series(1, 7) h
    where h <> extract(isodow from (now() at time zone 'Asia/Jakarta'))::int;
  insert into public.tugas (sekolah_id, pengguna_id, jenis) values
    ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', 'keuangan'),
    ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', 'pustakawan');
  begin
    insert into public.tugas (sekolah_id, pengguna_id, jenis) values ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'piket');
    raise exception 'GAGAL: piket tanpa hari diterima';
  exception when check_violation then null;
  end;

  r := public.atur_akun('30000000-0000-0000-0000-000000000001', ' 198001012005012001 ', 'SandiAwal123');
  assert (r ->> 'baru')::boolean and r ->> 'kode' = '198001012005012001', 'Akun baru dibuat: ' || r::text;
  perform public.atur_akun('30000000-0000-0000-0000-000000000002', 'pegid-0002', 'SandiKepala1');
  perform public.atur_akun('30000000-0000-0000-0000-000000000003', 'tu.0003', 'SandiTu12345');
  begin
    perform public.atur_akun('30000000-0000-0000-0000-000000000002', '198001012005012001', 'SandiLain123');
    raise exception 'GAGAL: ID login ganda diterima';
  exception when unique_violation then null;
  end;
  begin
    perform public.atur_akun('30000000-0000-0000-0000-000000000002', 'pegid-0002', 'pendek');
    raise exception 'GAGAL: sandi pendek diterima';
  exception when others then if sqlerrm like 'GAGAL%' then raise; end if;
  end;
  begin
    update public.pengguna set akun_id = '00000000-0000-0000-0000-0000000000a4' where id = '30000000-0000-0000-0000-000000000002';
    raise exception 'GAGAL: operator bisa menyambungkan akun orang lain secara langsung';
  exception when insufficient_privilege then null;
  end;
end $$;
commit;

do $$ declare u record; begin
  select * into u from auth.users where email = '198001012005012001@pegawai.cikaracak.invalid';
  assert u.id is not null and u.encrypted_password = crypt('SandiAwal123', u.encrypted_password), 'Sandi tersimpan sebagai bcrypt';
  assert u.aud = 'authenticated' and u.email_confirmed_at is not null and u.confirmation_token = '', 'Kolom akun lengkap seperti Supabase';
  assert exists (select 1 from auth.identities where user_id = u.id and provider = 'email'), 'Identitas email dibuat';
  assert (select wajib_ganti_sandi from public.pengguna where akun_id = u.id), 'Wajib ganti sandi saat masuk pertama';
  perform set_config('uji.wali', u.id::text, false);
  perform set_config('uji.kepsek', (select akun_id::text from public.pengguna where id = '30000000-0000-0000-0000-000000000002'), false);
  perform set_config('uji.tu', (select akun_id::text from public.pengguna where id = '30000000-0000-0000-0000-000000000003'), false);
end $$;

-- Reset sandi: akun sama, sandi baru
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select public.atur_akun('30000000-0000-0000-0000-000000000001', '198001012005012001', 'SandiBaru456');
commit;
do $$ begin
  assert (select count(*) from auth.users where email like '198001012005012001@%') = 1, 'Reset tidak membuat akun ganda';
  assert (select encrypted_password = crypt('SandiBaru456', encrypted_password) from auth.users where id = current_setting('uji.wali')::uuid), 'Sandi diganti';
end $$;

-- ===== Masuk sebagai wali (akun baru) =====
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('uji.wali'), true);
do $$ begin
  assert public.saya() = '30000000-0000-0000-0000-000000000001', 'Akun tersambung ke data pegawai';
  assert public.saya_wali('20000000-0000-0000-0000-000000000002'), 'Langsung menjadi wali kelas yang ditetapkan sebelum punya akun';
  assert public.saya_mengajar('20000000-0000-0000-0000-000000000002'), 'Penugasan mengajar ikut tersambung';
  assert not public.saya_piket(), 'Piket tidak berlaku di luar harinya';
  assert (select count(*) from public.presensi_kelas('20000000-0000-0000-0000-000000000002')) = 28, 'Wali melihat kelasnya';
  begin
    perform * from public.presensi_kelas('20000000-0000-0000-0000-000000000001');
    raise exception 'GAGAL: wali melihat kelas lain di luar hari piketnya';
  exception when insufficient_privilege then null;
  end;
  perform public.sandi_sudah_diganti();
  assert not (select wajib_ganti_sandi from public.pengguna where id = public.saya()), 'Tanda wajib ganti sandi hilang';
  begin
    update public.pengguna set peran = 'admin' where id = public.saya();
    raise exception 'GAGAL: guru menaikkan jabatannya sendiri';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.atur_akun(public.saya(), 'ganti', 'SandiSaya123');
    raise exception 'GAGAL: guru membuat akun';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

-- piket hari ini: tambahkan hari ini, lalu wali melihat semua kelas
insert into public.tugas (sekolah_id, pengguna_id, jenis, hari)
  values ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'piket', extract(isodow from (now() at time zone 'Asia/Jakarta'))::int);
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('uji.wali'), true);
do $$ begin
  assert public.saya_piket(), 'Piket berlaku pada harinya';
  assert (select count(*) from public.presensi_kelas('20000000-0000-0000-0000-000000000001')) = 30, 'Piket hari ini melihat semua kelas';
  assert (select count(*) from public.siswa) = 58, 'Piket hari ini melihat semua siswa';
end $$;
rollback;

-- ===== Kepala sekolah: lihat semua, tidak mengubah =====
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('uji.kepsek'), true);
do $$ begin
  assert public.saya_lihat_semua() and not public.saya_piket(), 'Kepala sekolah melihat semua, bukan petugas piket';
  assert (select count(*) from public.presensi_kelas('20000000-0000-0000-0000-000000000001')) = 30, 'Kepala sekolah melihat kelas mana pun';
  assert (select count(*) from public.rekap_bulan('20000000-0000-0000-0000-000000000001', current_date)) = 30, 'Kepala sekolah melihat rekap';
  begin
    perform public.ubah_presensi((select id from public.siswa where rombel_id = '20000000-0000-0000-0000-000000000001' and no_absen = 9),
                                 current_date - 1, 'A', 'Uji');
    raise exception 'GAGAL: kepala sekolah mengubah presensi';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.mulai_daftar_kartu((select id from public.alat limit 1), (select id from public.siswa limit 1));
    raise exception 'GAGAL: kepala sekolah mendaftarkan kartu';
  exception when insufficient_privilege then null;
  end;
  assert (select count(*) from public.kuis) = 0, 'Kepala sekolah tidak membaca kuis guru';
end $$;
rollback;

-- ===== TU: tidak membuka presensi =====
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('uji.tu'), true);
do $$ begin
  assert public.tugas_saya('keuangan') and public.tugas_saya('pustakawan'), 'Tugas TU terbaca';
  assert (select count(*) from public.siswa) = 0 and (select count(*) from public.presensi) = 0, 'TU tidak melihat siswa/presensi';
  begin
    perform * from public.presensi_kelas('20000000-0000-0000-0000-000000000001');
    raise exception 'GAGAL: TU membaca presensi';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

-- Pegawai nonaktif kehilangan akses walaupun akunnya masih ada
update public.pengguna set aktif = false where id = '30000000-0000-0000-0000-000000000002';
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('uji.kepsek'), true);
do $$ begin
  assert public.saya() is null and public.sekolah_saya() is null, 'Pegawai nonaktif tidak punya akses';
  assert (select count(*) from public.rombel) = 0, 'Pegawai nonaktif tidak melihat data';
end $$;
rollback;

\o
\echo 'Semua uji pegawai lulus.'
