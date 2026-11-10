-- Cikaracak Core / fondasi identitas, keluarga, dan foto siswa (FASE A).
-- ADDITIVE: jangan mengubah UUID siswa, presensi, kuis, kartu, atau data offline.
-- Tidak membuat akses parent ke siswa/presensi/keuangan. Portal orang tua baru dibuka
-- setelah RPC khusus + pengujian keamanan (FASE B).
--
-- foto_siswa menyimpan METADATA SAJA, bukan berkas foto.
-- Bucket Supabase Storage harus dibuat PRIVATE pada fase integrasi upload terpisah.

-- Kunci komposit untuk menolak relasi lintas sekolah di level foreign key.
-- Constraint tambahan ini tidak mengganti primary key UUID yang sudah dipakai.
create unique index if not exists siswa_id_sekolah_core_idx on public.siswa (id, sekolah_id);
create unique index if not exists pengguna_id_sekolah_core_idx on public.pengguna (id, sekolah_id);

-- Satu baris per wali per sekolah; satu akun boleh menjadi wali di beberapa sekolah.
-- Nomor HP, NIK, alamat, dan informasi keluarga lain TIDAK dikumpulkan di fase ini.
create table public.wali_keluarga (
  id uuid primary key default gen_random_uuid(),
  sekolah_id uuid not null references public.sekolah(id) on delete cascade,
  akun_id uuid references auth.users(id) on delete set null,
  nama text not null check (length(trim(nama)) between 1 and 100),
  aktif boolean not null default true,
  dibuat_at timestamptz not null default now(),
  unique (id, sekolah_id),
  unique (sekolah_id, akun_id)
);
create index wali_keluarga_sekolah_idx on public.wali_keluarga (sekolah_id);

-- Hubungan siswa ↔ wali harus diverifikasi oleh operator berwenang.
-- Hubungan dengan status menunggu/dicabut TIDAK memberikan akses ke data anak.
create table public.hubungan_siswa_wali (
  id uuid primary key default gen_random_uuid(),
  sekolah_id uuid not null references public.sekolah(id) on delete cascade,
  siswa_id uuid not null,
  wali_id uuid not null,
  jenis text not null check (jenis in ('ayah', 'ibu', 'wali_lain')),
  status text not null default 'menunggu' check (status in ('menunggu', 'terverifikasi', 'dicabut')),
  diverifikasi_oleh uuid,
  diverifikasi_at timestamptz,
  dibuat_at timestamptz not null default now(),
  unique (siswa_id, wali_id),
  foreign key (siswa_id, sekolah_id) references public.siswa(id, sekolah_id) on delete cascade,
  foreign key (wali_id, sekolah_id) references public.wali_keluarga(id, sekolah_id) on delete cascade,
  foreign key (diverifikasi_oleh, sekolah_id) references public.pengguna(id, sekolah_id) on delete set null (diverifikasi_oleh),
  check (status <> 'terverifikasi' or (diverifikasi_oleh is not null and diverifikasi_at is not null))
);
create index hubungan_wali_idx on public.hubungan_siswa_wali (wali_id, status);
create index hubungan_siswa_idx on public.hubungan_siswa_wali (siswa_id, status);

-- Persetujuan foto per siswa dan per tujuan; default TIDAK ADA persetujuan.
-- Persetujuan di sekolah harus didokumentasikan di luar sistem sesuai kebijakan sekolah.
create table public.persetujuan_foto (
  siswa_id uuid not null,
  sekolah_id uuid not null references public.sekolah(id) on delete cascade,
  tujuan text not null check (tujuan in ('identifikasi_guru', 'profil_keluarga')),
  status text not null check (status in ('disetujui', 'ditolak', 'dicabut')),
  dicatat_oleh uuid,
  dicatat_at timestamptz not null default now(),
  catatan text check (length(catatan) <= 300),
  primary key (siswa_id, tujuan),
  foreign key (siswa_id, sekolah_id) references public.siswa(id, sekolah_id) on delete cascade,
  foreign key (dicatat_oleh, sekolah_id) references public.pengguna(id, sekolah_id) on delete set null (dicatat_oleh)
);
create index persetujuan_foto_sekolah_idx on public.persetujuan_foto (sekolah_id);

-- Path foto harus berada dalam bucket PRIVATE dan tidak boleh diberikan sebagai URL publik.
-- Tabel metadata ini boleh diisi hanya sesudah persetujuan identifikasi_guru aktif.
create table public.foto_siswa (
  siswa_id uuid primary key,
  sekolah_id uuid not null references public.sekolah(id) on delete cascade,
  storage_path text not null unique check (length(storage_path) between 8 and 360),
  jenis_berkas text not null check (jenis_berkas in ('image/jpeg', 'image/webp')),
  ukuran_byte integer not null check (ukuran_byte between 1 and 2097152),
  versi integer not null default 1 check (versi >= 1),
  diunggah_oleh uuid,
  diubah_at timestamptz not null default now(),
  foreign key (siswa_id, sekolah_id) references public.siswa(id, sekolah_id) on delete cascade,
  foreign key (diunggah_oleh, sekolah_id) references public.pengguna(id, sekolah_id) on delete set null (diunggah_oleh)
);
create index foto_siswa_sekolah_idx on public.foto_siswa (sekolah_id);

-- Semua tabel baru wajib RLS; tidak ada hak langsung bagi anon.
alter table public.wali_keluarga enable row level security;
alter table public.hubungan_siswa_wali enable row level security;
alter table public.persetujuan_foto enable row level security;
alter table public.foto_siswa enable row level security;

revoke all on public.wali_keluarga, public.hubungan_siswa_wali,
  public.persetujuan_foto, public.foto_siswa from public, anon, authenticated;
grant select on public.wali_keluarga, public.hubungan_siswa_wali,
  public.persetujuan_foto, public.foto_siswa to authenticated;
-- Semua tulis hanya operator sekolah pada tahap ini (tetap dibatasi RLS).
grant insert, update, delete on public.wali_keluarga, public.hubungan_siswa_wali,
  public.persetujuan_foto, public.foto_siswa to authenticated;

-- Orang tua boleh membaca profil mereka sendiri setelah akun dikaitkan,
-- tetapi TIDAK otomatis boleh membaca profil siswa atau tabel presensi.
create policy wali_keluarga_baca on public.wali_keluarga for select to authenticated
  using ((sekolah_id = public.sekolah_saya() and public.saya_admin())
         or (akun_id = auth.uid() and aktif));
create policy wali_keluarga_admin on public.wali_keluarga for all to authenticated
  using (sekolah_id = public.sekolah_saya() and public.saya_admin())
  with check (sekolah_id = public.sekolah_saya() and public.saya_admin());

create policy hubungan_wali_baca on public.hubungan_siswa_wali for select to authenticated
  using ((sekolah_id = public.sekolah_saya() and public.saya_admin())
      or (status = 'terverifikasi' and exists (
        select 1 from public.wali_keluarga w
        where w.id = wali_id and w.sekolah_id = hubungan_siswa_wali.sekolah_id
          and w.akun_id = auth.uid() and w.aktif)));
create policy hubungan_wali_admin on public.hubungan_siswa_wali for all to authenticated
  using (sekolah_id = public.sekolah_saya() and public.saya_admin())
  with check (sekolah_id = public.sekolah_saya() and public.saya_admin());

-- Guru hanya melihat status izin siswa yang benar-benar diajar / dibina.
create policy izin_foto_baca on public.persetujuan_foto for select to authenticated
  using (sekolah_id = public.sekolah_saya() and exists (
    select 1 from public.siswa si where si.id = persetujuan_foto.siswa_id
      and si.sekolah_id = persetujuan_foto.sekolah_id
      and (public.saya_admin() or public.saya_wali(si.rombel_id)
           or public.saya_mengajar(si.rombel_id))));
create policy izin_foto_admin on public.persetujuan_foto for all to authenticated
  using (sekolah_id = public.sekolah_saya() and public.saya_admin())
  with check (sekolah_id = public.sekolah_saya() and public.saya_admin());

-- Mencabut izin membuat metadata foto tidak terbaca oleh guru seketika.
-- Storage tetap HARUS private; izin metadata tidak menggantikan kebijakan Storage.
create policy foto_siswa_baca on public.foto_siswa for select to authenticated
  using (sekolah_id = public.sekolah_saya()
    and exists (select 1 from public.persetujuan_foto pf
      where pf.siswa_id = foto_siswa.siswa_id and pf.sekolah_id = foto_siswa.sekolah_id
        and pf.tujuan = 'identifikasi_guru' and pf.status = 'disetujui')
    and exists (select 1 from public.siswa si where si.id = foto_siswa.siswa_id
      and si.sekolah_id = foto_siswa.sekolah_id
      and (public.saya_admin() or public.saya_wali(si.rombel_id)
           or public.saya_mengajar(si.rombel_id))));
create policy foto_siswa_admin on public.foto_siswa for all to authenticated
  using (sekolah_id = public.sekolah_saya() and public.saya_admin())
  with check (sekolah_id = public.sekolah_saya() and public.saya_admin()
    and exists (select 1 from public.persetujuan_foto pf
      where pf.siswa_id = foto_siswa.siswa_id and pf.sekolah_id = foto_siswa.sekolah_id
        and pf.tujuan = 'identifikasi_guru' and pf.status = 'disetujui'));

-- Perubahan izin tercatat pada audit sekolah yang sudah ada.
create or replace function public._audit_persetujuan_foto() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public._catat_audit(new.sekolah_id, 'foto_persetujuan',
    jsonb_build_object('siswa_id', new.siswa_id, 'tujuan', new.tujuan,
      'status_lama', case when tg_op = 'UPDATE' then old.status else null end,
      'status_baru', new.status));
  return new;
end $$;
create trigger persetujuan_foto_audit
  after insert or update of status on public.persetujuan_foto
  for each row execute function public._audit_persetujuan_foto();
revoke all on function public._audit_persetujuan_foto() from public, anon, authenticated;

-- Belum ada hak orang tua terhadap kuis, presensi, foto, atau keuangan.
-- Fase berikutnya: RPC terverifikasi untuk membaca ringkasan anak, bukan SELECT tabel mentah.
