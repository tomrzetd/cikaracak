-- Cikaracak — skema Fase 2 (satu sekolah, banyak guru).
-- Prinsip: data minimal (nama + nomor absen), tanpa NIK/NISN/alamat/foto di server.
-- Semua tabel memuat sekolah_id; aturan akses ada di migrasi RLS berikutnya.

create extension if not exists pgcrypto;

create table public.sekolah (
  id uuid primary key default gen_random_uuid(),
  nama text not null check (length(nama) between 2 and 120),
  npsn text unique check (npsn ~ '^[0-9A-Z]{8}$'),
  jenjang text not null check (jenjang in ('SD','SMP','SMA','SMK','SLB','lainnya')),
  dibuat_at timestamptz not null default now()
);

create table public.pengguna (
  id uuid primary key references auth.users(id) on delete cascade,
  sekolah_id uuid not null references public.sekolah(id) on delete cascade,
  nama text not null check (length(nama) between 1 and 80),
  peran text not null default 'guru' check (peran in ('guru','admin')),
  aktif boolean not null default true,
  dibuat_at timestamptz not null default now()
);
create index on public.pengguna (sekolah_id);

create table public.rombel (
  id uuid primary key default gen_random_uuid(),
  sekolah_id uuid not null references public.sekolah(id) on delete cascade,
  nama text not null check (length(nama) between 1 and 40),
  tingkat smallint check (tingkat between 1 and 13),
  tahun_ajaran text not null check (tahun_ajaran ~ '^\d{4}/\d{4}$'),
  unique (sekolah_id, nama, tahun_ajaran)
);

create table public.siswa (
  id uuid primary key default gen_random_uuid(),
  sekolah_id uuid not null references public.sekolah(id) on delete cascade,
  rombel_id uuid not null references public.rombel(id) on delete cascade,
  no_absen smallint not null check (no_absen between 1 and 99),
  nama text not null check (length(nama) between 1 and 80),
  aktif boolean not null default true,
  unique (rombel_id, no_absen)
);
create index on public.siswa (rombel_id);

create table public.mengajar (
  guru_id uuid not null references public.pengguna(id) on delete cascade,
  rombel_id uuid not null references public.rombel(id) on delete cascade,
  mapel text not null,
  sekolah_id uuid not null references public.sekolah(id) on delete cascade,
  primary key (guru_id, rombel_id, mapel)
);
create index on public.mengajar (rombel_id);

-- Bank konsep/TP bersama per sekolah (guru bisa memakai konsep rekan bila dibagikan)
create table public.konsep (
  id uuid primary key default gen_random_uuid(),
  sekolah_id uuid not null references public.sekolah(id) on delete cascade,
  pembuat_id uuid not null references public.pengguna(id) on delete cascade,
  mapel text not null,
  fase char(1) check (fase in ('A','B','C','D','E','F')),
  topik text,
  nama text not null,
  tp text,
  cp_id text,                 -- rujukan ke ref_cp (lihat migrasi data CP)
  dibagikan boolean not null default false,
  dibuat_at timestamptz not null default now()
);

create table public.kuis (
  id uuid primary key default gen_random_uuid(),
  sekolah_id uuid not null references public.sekolah(id) on delete cascade,
  guru_id uuid not null references public.pengguna(id) on delete cascade,
  rombel_id uuid not null references public.rombel(id) on delete cascade,
  topik text not null,
  mapel text,
  fase char(1) check (fase in ('A','B','C','D','E','F')),
  tanggal date not null default current_date,
  batas jsonb not null default '{"ulang":60,"kktp":75,"siswa":50}',
  dibuat_at timestamptz not null default now(),
  diubah_at timestamptz not null default now()
);
create index on public.kuis (guru_id, rombel_id);

create table public.kuis_konsep (
  id uuid primary key default gen_random_uuid(),
  kuis_id uuid not null references public.kuis(id) on delete cascade,
  urutan smallint not null,
  nama text not null,
  tp text,
  cp_id text,
  unique (kuis_id, urutan)
);

create table public.soal (
  kuis_id uuid not null references public.kuis(id) on delete cascade,
  nomor smallint not null check (nomor between 1 and 40),
  jenis text not null default 'pg' check (jenis in ('pg','bs')),
  opsi smallint not null default 4 check (opsi between 2 and 5),
  kunci text check (kunci in ('A','B','C','D','E','S')),
  kuis_konsep_id uuid references public.kuis_konsep(id) on delete set null,
  primary key (kuis_id, nomor)
);

-- Satu baris per siswa per soal. isian: huruf pilihan, '1'/'0' (penilaian manual), atau teks Google Form.
create table public.jawaban (
  kuis_id uuid not null references public.kuis(id) on delete cascade,
  siswa_id uuid not null references public.siswa(id) on delete cascade,
  nomor smallint not null,
  isian text,
  sumber text not null default 'manual' check (sumber in ('scan','form','manual')),
  diperiksa boolean not null default false,
  diubah_at timestamptz not null default now(),
  primary key (kuis_id, siswa_id, nomor)
);

create table public.tindakan (
  kuis_id uuid primary key references public.kuis(id) on delete cascade,
  dijalankan text check (dijalankan in ('Ya','Sebagian','Tidak')),
  catatan text check (length(catatan) <= 1000),
  diubah_at timestamptz not null default now()
);

-- sekolah_id kuis harus sama dengan sekolah rombelnya
create or replace function public.cek_sekolah_kuis() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.sekolah_id is distinct from (select sekolah_id from public.rombel where id = new.rombel_id) then
    raise exception 'sekolah_id kuis tidak sesuai rombel';
  end if;
  new.diubah_at := now();
  return new;
end $$;
create trigger kuis_cek_sekolah before insert or update on public.kuis for each row execute function public.cek_sekolah_kuis();
