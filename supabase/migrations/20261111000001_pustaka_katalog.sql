-- Cikaracak Pustaka P1: katalog sekolah dan identitas tiap eksemplar.
-- Additive. Tidak mengubah siswa, presensi, kuis, atau data demo IndexedDB.
-- Jalankan hanya setelah migrasi 20261110000001_pegawai.sql.
-- Belum mengaktifkan sirkulasi pinjam/kembali: itu membutuhkan ledger/audit terpisah.

create or replace function public.pustaka_petugas() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.saya_admin() or public.tugas_saya('pustakawan'), false)
$$;
revoke all on function public.pustaka_petugas() from public, anon;
grant execute on function public.pustaka_petugas() to authenticated;

-- Verifikasi checksum ISBN-10/13 (termasuk X di digit terakhir ISBN-10).
create or replace function public.pustaka_isbn_sah(p text) returns boolean
language sql immutable set search_path = public as $$
  select case
    when p ~ '^[0-9]{13}$' then
      (select sum(substr(p,i,1)::int * case when i%2=0 then 3 else 1 end)::int % 10 = 0
       from generate_series(1,13) i)
    when p ~ '^[0-9]{9}[0-9X]$' then
      (select sum((case when substr(p,i,1)='X' then 10 else substr(p,i,1)::int end)*(11-i))::int % 11 = 0
       from generate_series(1,10) i)
    else false
  end
$$;

create table public.pustaka_judul (
  id uuid primary key default gen_random_uuid(),
  sekolah_id uuid not null references public.sekolah(id) on delete restrict,
  judul text not null check (length(btrim(judul)) between 2 and 200),
  penulis text not null default '' check (length(penulis) <= 180),
  penerbit text not null default '' check (length(penerbit) <= 160),
  isbn text check (isbn is null or public.pustaka_isbn_sah(isbn)),
  sumber_metadata text not null default 'manual'
    check (sumber_metadata in ('manual','ocr','openlibrary')),
  dibuat_oleh uuid not null references public.pengguna(id) on delete restrict,
  dibuat_at timestamptz not null default now(),
  unique (id, sekolah_id)
);
create unique index pustaka_isbn_sekolah on public.pustaka_judul (sekolah_id, isbn) where isbn is not null;
create index pustaka_judul_cari on public.pustaka_judul (sekolah_id, judul);

create table public.pustaka_eksemplar (
  id uuid primary key default gen_random_uuid(),
  sekolah_id uuid not null,
  judul_id uuid not null,
  -- 15 karakter CODE39; barcode memuat kode inventaris, bukan identitas siswa.
  kode text not null unique check (kode ~ '^CKR[0-9A-F]{12}$'),
  kondisi text not null default 'baik' check (kondisi in ('baik','perlu_perbaikan','rusak')),
  status text not null default 'tersedia' check (status in ('tersedia','dipinjam','hilang')),
  aktif boolean not null default true,
  dibuat_oleh uuid not null references public.pengguna(id) on delete restrict,
  dibuat_at timestamptz not null default now(),
  foreign key (judul_id, sekolah_id) references public.pustaka_judul(id, sekolah_id) on delete restrict
);
create index pustaka_eksemplar_judul on public.pustaka_eksemplar (judul_id);
create index pustaka_eksemplar_sekolah on public.pustaka_eksemplar (sekolah_id, status);

alter table public.pustaka_judul enable row level security;
alter table public.pustaka_eksemplar enable row level security;
revoke all on public.pustaka_judul, public.pustaka_eksemplar from public, anon, authenticated;
grant select on public.pustaka_judul, public.pustaka_eksemplar to authenticated;
-- Tak ada policy INSERT/UPDATE/DELETE langsung; penulisan hanya via RPC dengan validasi sekolah dan penugasan.
create policy pustaka_judul_baca on public.pustaka_judul for select to authenticated
  using (sekolah_id = public.sekolah_saya() and public.pustaka_petugas());
create policy pustaka_eksemplar_baca on public.pustaka_eksemplar for select to authenticated
  using (sekolah_id = public.sekolah_saya() and public.pustaka_petugas());

create or replace function public.pustaka_terima_buku(
  p_judul text, p_penulis text default '', p_penerbit text default '',
  p_isbn text default null, p_sumber text default 'manual'
) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  s uuid := public.sekolah_saya();
  actor uuid := public.saya();
  v_judul text := btrim(coalesce(p_judul,''));
  v_penulis text := btrim(coalesce(p_penulis,''));
  v_penerbit text := btrim(coalesce(p_penerbit,''));
  v_isbn text := nullif(regexp_replace(upper(coalesce(p_isbn,'')), '[^0-9X]', '', 'g'), '');
  v_id uuid;
  v_copy uuid := gen_random_uuid();
  v_kode text;
  v_baru boolean := false;
begin
  if s is null or actor is null or not public.pustaka_petugas() then
    raise exception 'Hanya petugas perpustakaan aktif yang dapat menerima buku' using errcode = '42501';
  end if;
  if length(v_judul) not between 2 and 200 or length(v_penulis) > 180 or length(v_penerbit) > 160 then
    raise exception 'Judul atau metadata buku tidak sah';
  end if;
  if v_isbn is not null and not public.pustaka_isbn_sah(v_isbn) then raise exception 'Checksum ISBN tidak valid'; end if;
  if p_sumber not in ('manual','ocr','openlibrary') then raise exception 'Sumber metadata tidak sah'; end if;

  -- Satu sekolah memiliki satu record judul untuk ISBN yang sama. Metadata lama tidak tertimpa hasil OCR.
  if v_isbn is not null then
    insert into public.pustaka_judul (sekolah_id, judul, penulis, penerbit, isbn, sumber_metadata, dibuat_oleh)
    values (s, v_judul, v_penulis, v_penerbit, v_isbn, p_sumber, actor)
    on conflict (sekolah_id, isbn) where isbn is not null do nothing
    returning id into v_id;
    v_baru := v_id is not null;
    if v_id is null then select id into v_id from public.pustaka_judul where sekolah_id=s and isbn=v_isbn; end if;
  else
    insert into public.pustaka_judul (sekolah_id, judul, penulis, penerbit, isbn, sumber_metadata, dibuat_oleh)
    values (s, v_judul, v_penulis, v_penerbit, null, p_sumber, actor)
    returning id into v_id;
    v_baru := true;
  end if;
  if v_id is null then raise exception 'Gagal mencari atau menambahkan judul'; end if;
  v_kode := 'CKR' || upper(substr(replace(v_copy::text,'-',''),1,12));
  insert into public.pustaka_eksemplar (id, sekolah_id, judul_id, kode, dibuat_oleh)
    values (v_copy,s,v_id,v_kode,actor);
  perform public._catat_audit(s,'pustaka_terima',jsonb_build_object('judul_id',v_id,'eksemplar_id',v_copy,'kode',v_kode));
  return jsonb_build_object('judul_id',v_id,'eksemplar_id',v_copy,'kode',v_kode,'judul_baru',v_baru);
end $$;

create or replace function public.pustaka_tambah_eksemplar(p_judul uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  s uuid := public.sekolah_saya();
  actor uuid := public.saya();
  v_id uuid := gen_random_uuid();
  v_kode text := 'CKR' || upper(substr(replace(v_id::text,'-',''),1,12));
begin
  if s is null or actor is null or not public.pustaka_petugas() then
    raise exception 'Hanya petugas perpustakaan aktif yang dapat menambah eksemplar' using errcode = '42501';
  end if;
  if not exists (select 1 from public.pustaka_judul where id=p_judul and sekolah_id=s) then
    raise exception 'Judul tidak tersedia di sekolah ini' using errcode = '22023';
  end if;
  insert into public.pustaka_eksemplar (id,sekolah_id,judul_id,kode,dibuat_oleh)
    values (v_id,s,p_judul,v_kode,actor);
  perform public._catat_audit(s,'pustaka_eksemplar_tambah',jsonb_build_object('judul_id',p_judul,'eksemplar_id',v_id,'kode',v_kode));
  return jsonb_build_object('judul_id',p_judul,'eksemplar_id',v_id,'kode',v_kode);
end $$;

revoke all on function public.pustaka_terima_buku(text,text,text,text,text),
  public.pustaka_tambah_eksemplar(uuid) from public, anon;
grant execute on function public.pustaka_terima_buku(text,text,text,text,text),
  public.pustaka_tambah_eksemplar(uuid) to authenticated;
