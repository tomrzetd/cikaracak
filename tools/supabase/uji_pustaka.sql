-- Uji produksi katalog: multi-tenancy, akses staf pustaka, kode unik, transaksi audit.
\set ON_ERROR_STOP 1
\o /dev/null

-- Operator menambah buku; ISBN sama menghasilkan satu judul tapi dua eksemplar.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$
declare a jsonb; b jsonb; c jsonb;
begin
  assert public.pustaka_petugas(), 'Operator adalah petugas pustaka';
  a := public.pustaka_terima_buku('Atlas Geografi','Tim Ilmu','Penerbit Satu','9786021234567','manual');
  b := public.pustaka_terima_buku('Judul saran berbeda','Tim Ilmu','Penerbit Kedua','9786021234567','ocr');
  assert a->>'judul_id'=b->>'judul_id' and (a->>'kode')<>(b->>'kode'), 'ISBN sama, eksemplar unik';
  assert (a->>'kode') ~ '^CKR[0-9A-F]{12}$', 'Kode CODE39 kompatibel';
  assert (select count(*) from public.pustaka_judul)=1, 'ISBN tidak diduplikasi';
  assert (select judul from public.pustaka_judul where id=(a->>'judul_id')::uuid)='Atlas Geografi', 'OCR tidak boleh overwrite metadata';
  assert (select count(*) from public.pustaka_eksemplar)=2, 'Dua fisik dicatat';
  c := public.pustaka_tambah_eksemplar((a->>'judul_id')::uuid);
  assert (c->>'kode')<>(b->>'kode'), 'Kode copy ketiga unik';
  assert (select count(*) from public.pustaka_eksemplar)=3, 'Copy ketiga tersedia';
  assert exists(select 1 from public.audit where aksi='pustaka_terima'), 'Operasi diaudit';
  begin
    perform public.pustaka_terima_buku('','', '', null, 'manual');
    raise exception 'GAGAL: judul kosong diterima';
  exception when others then if sqlerrm like 'GAGAL%' then raise; end if; end;
end $$;
commit;

-- Guru tanpa mandat tidak dapat membaca metadata atau mendaftarkan buku.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
do $$ begin
  assert not public.pustaka_petugas(), 'Guru bukan pustakawan';
  assert (select count(*) from public.pustaka_judul)=0, 'Katalog tidak terlihat bagi guru';
  assert (select count(*) from public.pustaka_eksemplar)=0, 'Label tidak bocor';
  begin
    perform public.pustaka_terima_buku('Buku guru','','',null,'manual');
    raise exception 'GAGAL: guru menulis katalog';
  exception when insufficient_privilege then null; end;
end $$;
rollback;

-- Pegawai TU dengan tugas pustakawan boleh menerima buku, tetapi tak boleh INSERT langsung.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('uji.tu'), true);
do $$
declare j jsonb;
begin
  assert public.pustaka_petugas(), 'TU aktif punya tugas pustakawan';
  j := public.pustaka_terima_buku('Biologi untuk Pelajar','','Penerbit Tiga',null,'manual');
  assert j->>'judul_baru'='true', 'Judul tanpa ISBN tetap baru';
  assert (select count(*) from public.pustaka_judul)=2, 'Katalog dapat dibaca TU';
  begin
    insert into public.pustaka_judul(sekolah_id,judul,dibuat_oleh)
      values (public.sekolah_saya(),'Akses tak sah',public.saya());
    raise exception 'GAGAL: TU INSERT langsung';
  exception when insufficient_privilege then null; end;
  begin
    perform public.pustaka_tambah_eksemplar('00000000-0000-0000-0000-0000000000aa');
    raise exception 'GAGAL: copy judul sekolah lain';
  exception when invalid_parameter_value then null; end;
end $$;
commit;

-- Akses anon ditolak, termasuk fungsi yang menulis.
begin;
set local role anon;
do $$ begin
  begin
    perform public.pustaka_terima_buku('Buku anon','','',null,'manual');
    raise exception 'GAGAL: anon menjalankan RPC';
  exception when insufficient_privilege then null; end;
  begin
    perform (select count(*) from public.pustaka_judul);
    raise exception 'GAGAL: anon membaca katalog';
  exception when insufficient_privilege then null; end;
end $$;
rollback;

-- Sekolah lain tidak boleh menambah eksemplar ke judul sekolah A.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a4';
do $$ begin
  assert (select count(*) from public.pustaka_judul)=0, 'Isolasi sekolah lain';
  begin
    perform public.pustaka_tambah_eksemplar((select id from public.pustaka_judul limit 1));
    raise exception 'GAGAL: sekolah lain membuat copy';
  exception when insufficient_privilege then null; end;
end $$;
rollback;
\o
\echo 'Uji pustaka katalog, label, akses lintas sekolah lulus.'
