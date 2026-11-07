-- Cikaracak Hadir — presensi siswa dengan kartu RFID.
--
-- Prinsip:
--  • UID kartu tidak pernah disimpan apa adanya. Server menyimpan HMAC-SHA256(UID, pepper) dengan pepper
--    rahasia di tabel `rahasia`. Bocornya tabel kartu tidak membocorkan UID.
--  • Alat (ESP32) tidak punya akun. Setiap permintaan ditandatangani dengan kunci alat:
--      tanda = hex(HMAC-SHA256(kunci, alat \n waktu \n nonce \n UID \n offline))
--    lalu dikirim ke fungsi catat_tap() memakai kunci anon. Nonce unik per alat, sehingga
--    pengiriman ulang (misalnya karena sinyal putus) tidak tercatat dua kali.
--  • Tidak ada tap berarti "belum tercatat", bukan Alpa. Sakit/Izin/Alpa diisi wali kelas beserta alasan,
--    dan setiap perubahan dicatat di tabel audit.
--  • Tabel hanya bisa dibaca sesuai peran (RLS). Semua penulisan presensi lewat fungsi.

create extension if not exists pgcrypto;

-- ===== Kolom tambahan pada tabel yang sudah ada =====
alter table public.sekolah add column if not exists zona text not null default 'Asia/Jakarta'
  check (zona in ('Asia/Jakarta','Asia/Makassar','Asia/Jayapura'));
alter table public.pengguna add column if not exists piket boolean not null default false;
alter table public.rombel add column if not exists wali_id uuid references public.pengguna(id) on delete set null;
alter table public.siswa add column if not exists panggilan text check (length(panggilan) between 1 and 20);

-- ===== Tabel =====
create table public.rahasia (
  nama text primary key,
  nilai bytea not null
);
insert into public.rahasia (nama, nilai) values ('pepper_kartu', gen_random_bytes(32)) on conflict do nothing;

create table public.alat (
  id text primary key check (id ~ '^[A-Z0-9]{8}$'),
  sekolah_id uuid not null references public.sekolah(id) on delete cascade,
  nama text not null check (length(nama) between 1 and 40),
  titik text not null default 'gerbang' check (titik in ('gerbang','kantin','perpustakaan')),
  aktif boolean not null default true,
  versi text,
  antrean integer,
  terakhir_kontak timestamptz,
  dibuat_at timestamptz not null default now()
);
create index on public.alat (sekolah_id);

create table public.alat_kunci (
  alat_id text primary key references public.alat(id) on delete cascade,
  kunci bytea not null check (length(kunci) = 32),
  diganti_at timestamptz not null default now()
);

create table public.kartu (
  id uuid primary key default gen_random_uuid(),
  sekolah_id uuid not null references public.sekolah(id) on delete cascade,
  uid_hash bytea not null,
  siswa_id uuid not null references public.siswa(id) on delete cascade,
  aktif boolean not null default true,
  dibuat_at timestamptz not null default now(),
  unique (sekolah_id, uid_hash)
);
create unique index kartu_satu_aktif on public.kartu (siswa_id) where aktif;

create table public.jadwal (
  sekolah_id uuid not null references public.sekolah(id) on delete cascade,
  hari smallint not null check (hari between 1 and 7),          -- ISO: 1 Senin … 7 Minggu
  jam_masuk time not null,
  toleransi_menit smallint not null default 0 check (toleransi_menit between 0 and 120),
  jam_pulang time not null,
  primary key (sekolah_id, hari),
  check (jam_pulang > jam_masuk)
);

create table public.kalender_libur (
  sekolah_id uuid not null references public.sekolah(id) on delete cascade,
  tanggal date not null,
  keterangan text not null check (length(keterangan) between 1 and 80),
  primary key (sekolah_id, tanggal)
);

create table public.presensi (
  siswa_id uuid not null references public.siswa(id) on delete cascade,
  tanggal date not null,
  sekolah_id uuid not null references public.sekolah(id) on delete cascade,
  masuk_at timestamptz,
  pulang_at timestamptz,
  terlambat_menit smallint not null default 0,
  status char(1) check (status in ('H','S','I','A')),   -- diisi manual oleh wali; null = mengikuti tap
  alasan text check (length(alasan) <= 200),
  diubah_oleh uuid references public.pengguna(id) on delete set null,
  diubah_at timestamptz not null default now(),
  primary key (siswa_id, tanggal)
);
create index on public.presensi (sekolah_id, tanggal);

create table public.tap (
  id bigserial primary key,
  sekolah_id uuid not null references public.sekolah(id) on delete cascade,
  alat_id text not null references public.alat(id) on delete cascade,
  nonce text not null,
  waktu timestamptz not null,
  diterima_at timestamptz not null default now(),
  offline boolean not null default false,
  kartu_id uuid references public.kartu(id) on delete set null,
  siswa_id uuid references public.siswa(id) on delete set null,
  hasil text not null default 'proses',
  jawaban jsonb,
  unique (alat_id, nonce)
);
create index on public.tap (sekolah_id, waktu);

create table public.pendaftaran_kartu (
  alat_id text primary key references public.alat(id) on delete cascade,
  sekolah_id uuid not null references public.sekolah(id) on delete cascade,
  siswa_id uuid not null references public.siswa(id) on delete cascade,
  oleh uuid references public.pengguna(id) on delete set null,
  berakhir_at timestamptz not null
);

create table public.audit (
  id bigserial primary key,
  sekolah_id uuid not null references public.sekolah(id) on delete cascade,
  pengguna_id uuid references public.pengguna(id) on delete set null,
  aksi text not null,
  data jsonb,
  at timestamptz not null default now()
);
create index on public.audit (sekolah_id, at);

-- ===== Fungsi bantu peran =====
create or replace function public.saya_piket() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.pengguna where id = auth.uid() and aktif and (piket or peran = 'admin')) $$;

create or replace function public.piket_saya() returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce((select piket from public.pengguna where id = auth.uid()), false) $$;

create or replace function public.saya_wali(r uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.rombel ro join public.pengguna p on p.id = ro.wali_id
                  where ro.id = r and p.id = auth.uid() and p.aktif) $$;

-- Siapa boleh melihat presensi satu rombel: admin/piket sekolah itu, wali kelas, guru yang mengajar.
create or replace function public.boleh_lihat_presensi(r uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.rombel where id = r and sekolah_id = public.sekolah_saya()
                 and (public.saya_piket() or public.saya_wali(r) or public.saya_mengajar(r)))
$$;

create or replace function public._rombel_siswa(s uuid) returns uuid
language sql stable security definer set search_path = public as
$$ select rombel_id from public.siswa where id = s $$;

create or replace function public._catat_audit(p_sekolah uuid, p_aksi text, p_data jsonb) returns void
language sql security definer set search_path = public as
$$ insert into public.audit (sekolah_id, pengguna_id, aksi, data) values (p_sekolah, auth.uid(), p_aksi, p_data) $$;

create or replace function public._wajib_admin() returns uuid
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.saya_admin() then
    raise exception 'Hanya admin sekolah' using errcode = 'insufficient_privilege';
  end if;
  return public.sekolah_saya();
end $$;

create or replace function public._hash_uid(p_uid text) returns bytea
language sql stable security definer set search_path = public, extensions as
$$ select hmac(convert_to(upper(p_uid), 'UTF8'), (select nilai from public.rahasia where nama = 'pepper_kartu'), 'sha256') $$;

create or replace function public._nama_tampil(s public.siswa) returns text
language sql immutable as
$$ select coalesce(nullif(s.panggilan, ''), split_part(s.nama, ' ', 1)) $$;

-- Mengembalikan alat bila tanda tangan cocok, atau baris kosong bila tidak.
create or replace function public._alat_sah(p_alat text, p_pesan text, p_tanda text) returns public.alat
language plpgsql stable security definer set search_path = public, extensions as $$
declare a public.alat; k bytea;
begin
  if p_tanda is null or p_tanda !~ '^[0-9a-f]{64}$' then return null; end if;
  select * into a from public.alat where id = p_alat;
  if not found then return null; end if;
  select kunci into k from public.alat_kunci where alat_id = p_alat;
  if k is null or encode(hmac(convert_to(p_pesan, 'UTF8'), k, 'sha256'), 'hex') <> p_tanda then return null; end if;
  return a;
end $$;

-- ===== Penerima tap dari alat (dipanggil dengan kunci anon) =====
-- Hasil: hadir, terlambat, sudah, pulang, pulang_awal, terdaftar, kartu_terpakai, tidak_dikenal,
--        libur, nonaktif, kedaluwarsa, waktu_salah, tanda_salah, format_salah.
create or replace function public.catat_tap(p_alat text, p_uid text, p_waktu bigint, p_nonce text, p_offline boolean, p_tanda text)
returns jsonb language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  a public.alat;
  v_uid text := upper(coalesce(p_uid, ''));
  v_tap bigint; v_lama jsonb;
  v_waktu timestamptz; v_zona text; v_tgl date; v_jam time;
  v_hash bytea; v_kartu public.kartu; v_siswa public.siswa; v_daftar public.pendaftaran_kartu;
  j public.jadwal; p public.presensi;
  v_hasil text; v_terlambat int := 0; v_terakhir timestamptz; v_balas jsonb;
begin
  if p_alat is null or p_alat !~ '^[A-Z0-9]{8}$'
     or v_uid !~ '^([0-9A-F]{8}|[0-9A-F]{14}|[0-9A-F]{20})$'
     or p_nonce is null or p_nonce !~ '^[A-Za-z0-9]{8,32}$'
     or p_waktu is null or p_waktu < 0 or p_offline is null then
    return jsonb_build_object('hasil', 'format_salah');
  end if;

  a := public._alat_sah(p_alat,
         p_alat || E'\n' || p_waktu || E'\n' || p_nonce || E'\n' || v_uid || E'\n' || case when p_offline then '1' else '0' end,
         p_tanda);
  if a.id is null then return jsonb_build_object('hasil', 'tanda_salah'); end if;

  -- Kirim ulang dengan nonce yang sama: kembalikan jawaban yang sudah ada.
  v_waktu := case when p_waktu = 0 then now() else to_timestamp(p_waktu) end;
  insert into public.tap (sekolah_id, alat_id, nonce, waktu, offline)
    values (a.sekolah_id, a.id, p_nonce, v_waktu, p_offline)
    on conflict (alat_id, nonce) do nothing returning id into v_tap;
  if v_tap is null then
    select jawaban into v_lama from public.tap where alat_id = a.id and nonce = p_nonce;
    return coalesce(v_lama, jsonb_build_object('hasil', 'sudah')) || jsonb_build_object('ulang', true);
  end if;
  update public.alat set terakhir_kontak = now() where id = a.id;

  select zona into v_zona from public.sekolah where id = a.sekolah_id;

  if not a.aktif then
    v_hasil := 'nonaktif';
  elsif v_waktu > now() + interval '5 minutes' then
    v_hasil := 'waktu_salah';
  elsif v_waktu < now() - interval '7 days' then
    v_hasil := 'kedaluwarsa';
  else
    -- Alat mengaku online tetapi jamnya tertinggal jauh: pakai jam server.
    if not p_offline and v_waktu < now() - interval '10 minutes' then v_waktu := now(); end if;
    v_tgl := (v_waktu at time zone v_zona)::date;
    v_jam := (v_waktu at time zone v_zona)::time;
    v_hash := public._hash_uid(v_uid);

    -- Mode daftar kartu (hanya untuk tap online)
    if not p_offline then
      select * into v_daftar from public.pendaftaran_kartu where alat_id = a.id and berakhir_at > now() for update;
    end if;
    if v_daftar.alat_id is not null then
      select * into v_siswa from public.siswa where id = v_daftar.siswa_id;
      if exists (select 1 from public.kartu where sekolah_id = a.sekolah_id and uid_hash = v_hash and aktif and siswa_id <> v_daftar.siswa_id) then
        v_hasil := 'kartu_terpakai';
      else
        update public.kartu set aktif = false where siswa_id = v_daftar.siswa_id and aktif and uid_hash <> v_hash;
        insert into public.kartu (sekolah_id, uid_hash, siswa_id) values (a.sekolah_id, v_hash, v_daftar.siswa_id)
          on conflict (sekolah_id, uid_hash) do update set siswa_id = excluded.siswa_id, aktif = true, dibuat_at = now()
          returning * into v_kartu;
        v_hasil := 'terdaftar';
        insert into public.audit (sekolah_id, pengguna_id, aksi, data)
          values (a.sekolah_id, v_daftar.oleh, 'kartu_daftar', jsonb_build_object('siswa', v_siswa.id, 'alat', a.id));
      end if;
      delete from public.pendaftaran_kartu where alat_id = a.id;
    else
      select * into v_kartu from public.kartu where sekolah_id = a.sekolah_id and uid_hash = v_hash and aktif;
      if v_kartu.id is null then
        v_hasil := 'tidak_dikenal';
      else
        select * into v_siswa from public.siswa where id = v_kartu.siswa_id;
        if not v_siswa.aktif then
          v_hasil := 'tidak_dikenal';
          v_siswa := null;
        else
          select * into j from public.jadwal where sekolah_id = a.sekolah_id and hari = extract(isodow from v_tgl);
          if j.sekolah_id is null or exists (select 1 from public.kalender_libur where sekolah_id = a.sekolah_id and tanggal = v_tgl) then
            v_hasil := 'libur';
          else
            insert into public.presensi (siswa_id, tanggal, sekolah_id) values (v_siswa.id, v_tgl, a.sekolah_id) on conflict do nothing;
            select * into p from public.presensi where siswa_id = v_siswa.id and tanggal = v_tgl for update;
            v_terakhir := greatest(p.masuk_at, p.pulang_at);
            if v_jam > j.jam_masuk + make_interval(mins => j.toleransi_menit) then
              v_terlambat := floor(extract(epoch from (v_jam - j.jam_masuk)) / 60);
            end if;

            if v_terakhir is null then
              if v_jam < j.jam_pulang then
                update public.presensi set masuk_at = v_waktu, terlambat_menit = v_terlambat, diubah_at = now()
                  where siswa_id = v_siswa.id and tanggal = v_tgl;
                v_hasil := case when v_terlambat > 0 then 'terlambat' else 'hadir' end;
              else
                update public.presensi set pulang_at = v_waktu, diubah_at = now() where siswa_id = v_siswa.id and tanggal = v_tgl;
                v_hasil := 'pulang';
              end if;
              v_terlambat := case when v_hasil = 'terlambat' then v_terlambat else 0 end;
            elsif abs(extract(epoch from (v_waktu - v_terakhir))) < 1800 then
              v_hasil := 'sudah';
              v_terlambat := 0;
            elsif p.masuk_at is not null and v_waktu < p.masuk_at then
              -- tap lama dari antrean offline datang belakangan: itulah jam masuk sebenarnya
              update public.presensi set masuk_at = v_waktu, terlambat_menit = v_terlambat,
                     pulang_at = coalesce(pulang_at, p.masuk_at), diubah_at = now()
                where siswa_id = v_siswa.id and tanggal = v_tgl;
              v_hasil := case when v_terlambat > 0 then 'terlambat' else 'hadir' end;
            else
              update public.presensi set pulang_at = greatest(coalesce(pulang_at, v_waktu), v_waktu), diubah_at = now()
                where siswa_id = v_siswa.id and tanggal = v_tgl;
              v_hasil := case when v_jam >= j.jam_pulang then 'pulang' else 'pulang_awal' end;
              v_terlambat := 0;
            end if;
          end if;
        end if;
      end if;
    end if;
  end if;

  v_balas := jsonb_build_object('hasil', v_hasil,
                                'jam', to_char(v_waktu at time zone coalesce(v_zona, 'Asia/Jakarta'), 'HH24:MI'));
  if v_siswa.id is not null then v_balas := v_balas || jsonb_build_object('nama', public._nama_tampil(v_siswa)); end if;
  if v_hasil = 'terlambat' then v_balas := v_balas || jsonb_build_object('terlambat_menit', v_terlambat); end if;

  update public.tap set waktu = v_waktu, hasil = v_hasil, jawaban = v_balas, kartu_id = v_kartu.id, siswa_id = v_siswa.id
    where id = v_tap;
  return v_balas;
end $$;

-- Laporan kesehatan alat (tiap beberapa menit). tanda = HMAC(kunci, alat \n waktu \n versi \n antrean)
create or replace function public.lapor_alat(p_alat text, p_waktu bigint, p_versi text, p_antrean integer, p_tanda text)
returns jsonb language plpgsql volatile security definer set search_path = public, extensions as $$
declare a public.alat; v_sekolah text;
begin
  if p_alat is null or p_alat !~ '^[A-Z0-9]{8}$' or p_waktu is null or p_versi is null or p_versi !~ '^[0-9A-Za-z._-]{1,20}$'
     or p_antrean is null or p_antrean < 0 then
    return jsonb_build_object('hasil', 'format_salah');
  end if;
  a := public._alat_sah(p_alat, p_alat || E'\n' || p_waktu || E'\n' || p_versi || E'\n' || p_antrean, p_tanda);
  if a.id is null then return jsonb_build_object('hasil', 'tanda_salah'); end if;
  if abs(extract(epoch from now()) - p_waktu) > 300 then
    return jsonb_build_object('hasil', 'waktu_salah', 'waktu_server', floor(extract(epoch from now()))::bigint);
  end if;
  update public.alat set terakhir_kontak = now(), versi = p_versi, antrean = p_antrean where id = a.id;
  select nama into v_sekolah from public.sekolah where id = a.sekolah_id;
  return jsonb_build_object('hasil', case when a.aktif then 'ok' else 'nonaktif' end,
                            'waktu_server', floor(extract(epoch from now()))::bigint,
                            'alat', a.nama, 'sekolah', v_sekolah);
end $$;

-- ===== Fungsi untuk admin =====
create or replace function public._id_alat_baru() returns text
language plpgsql volatile security definer set search_path = public, extensions as $$
declare huruf constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; b bytea; v text;
begin
  loop
    b := gen_random_bytes(8); v := '';
    for i in 0..7 loop v := v || substr(huruf, (get_byte(b, i) % 32) + 1, 1); end loop;
    exit when not exists (select 1 from public.alat where id = v);
  end loop;
  return v;
end $$;

-- Mengembalikan kunci alat SEKALI. Kunci tidak bisa dibaca lagi; bila hilang, ganti kunci.
create or replace function public.buat_alat(p_nama text, p_titik text default 'gerbang') returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare s uuid := public._wajib_admin(); v_id text := public._id_alat_baru(); k bytea := gen_random_bytes(32);
begin
  insert into public.alat (id, sekolah_id, nama, titik) values (v_id, s, p_nama, p_titik);
  insert into public.alat_kunci (alat_id, kunci) values (v_id, k);
  perform public._catat_audit(s, 'alat_buat', jsonb_build_object('alat', v_id, 'nama', p_nama));
  return jsonb_build_object('id', v_id, 'kunci', encode(k, 'hex'));
end $$;

create or replace function public.ganti_kunci_alat(p_alat text) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare s uuid := public._wajib_admin(); k bytea := gen_random_bytes(32);
begin
  if not exists (select 1 from public.alat where id = p_alat and sekolah_id = s) then
    raise exception 'Alat tidak ditemukan' using errcode = 'no_data_found';
  end if;
  update public.alat_kunci set kunci = k, diganti_at = now() where alat_id = p_alat;
  perform public._catat_audit(s, 'alat_ganti_kunci', jsonb_build_object('alat', p_alat));
  return jsonb_build_object('id', p_alat, 'kunci', encode(k, 'hex'));
end $$;

-- Kartu berikutnya yang ditempel pada alat ini dalam 60 detik akan menjadi kartu siswa tersebut.
create or replace function public.mulai_daftar_kartu(p_alat text, p_siswa uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare s uuid := public.sekolah_saya(); v_akhir timestamptz := now() + interval '60 seconds';
begin
  if not public.saya_piket() then raise exception 'Hanya admin atau petugas piket' using errcode = 'insufficient_privilege'; end if;
  if not exists (select 1 from public.alat where id = p_alat and sekolah_id = s and aktif)
     or not exists (select 1 from public.siswa where id = p_siswa and sekolah_id = s and aktif) then
    raise exception 'Alat atau siswa tidak ditemukan' using errcode = 'no_data_found';
  end if;
  insert into public.pendaftaran_kartu (alat_id, sekolah_id, siswa_id, oleh, berakhir_at)
    values (p_alat, s, p_siswa, auth.uid(), v_akhir)
    on conflict (alat_id) do update set siswa_id = excluded.siswa_id, oleh = excluded.oleh, berakhir_at = excluded.berakhir_at;
  return jsonb_build_object('alat', p_alat, 'berakhir_at', v_akhir);
end $$;

-- Mendaftarkan kartu dengan mengetik UID (misalnya dari firmware uji kartu).
create or replace function public.daftar_kartu_manual(p_siswa uuid, p_uid text) returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare s uuid := public._wajib_admin(); v_uid text := upper(replace(coalesce(p_uid, ''), ' ', '')); h bytea; v_id uuid;
begin
  if v_uid !~ '^([0-9A-F]{8}|[0-9A-F]{14}|[0-9A-F]{20})$' then raise exception 'UID harus 8, 14, atau 20 digit heksadesimal'; end if;
  if not exists (select 1 from public.siswa where id = p_siswa and sekolah_id = s) then
    raise exception 'Siswa tidak ditemukan' using errcode = 'no_data_found';
  end if;
  h := public._hash_uid(v_uid);
  if exists (select 1 from public.kartu where sekolah_id = s and uid_hash = h and aktif and siswa_id <> p_siswa) then
    raise exception 'Kartu ini sudah dipakai siswa lain' using errcode = 'unique_violation';
  end if;
  update public.kartu set aktif = false where siswa_id = p_siswa and aktif and uid_hash <> h;
  insert into public.kartu (sekolah_id, uid_hash, siswa_id) values (s, h, p_siswa)
    on conflict (sekolah_id, uid_hash) do update set siswa_id = excluded.siswa_id, aktif = true, dibuat_at = now()
    returning id into v_id;
  perform public._catat_audit(s, 'kartu_daftar', jsonb_build_object('siswa', p_siswa, 'cara', 'manual'));
  return v_id;
end $$;

-- Menambahkan guru yang sudah membuat akun (email) ke sekolah admin.
create or replace function public.undang_pengguna(p_email text, p_nama text, p_peran text default 'guru', p_piket boolean default false)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare s uuid := public._wajib_admin(); v_id uuid;
begin
  select id into v_id from auth.users where lower(email) = lower(trim(p_email));
  if v_id is null then raise exception 'Belum ada akun dengan email itu. Minta guru mendaftar dulu.' using errcode = 'no_data_found'; end if;
  if exists (select 1 from public.pengguna where id = v_id and sekolah_id <> s) then
    raise exception 'Akun itu terdaftar di sekolah lain' using errcode = 'insufficient_privilege';
  end if;
  insert into public.pengguna (id, sekolah_id, nama, peran, piket) values (v_id, s, p_nama, p_peran, p_piket)
    on conflict (id) do update set nama = excluded.nama, peran = excluded.peran, piket = excluded.piket, aktif = true;
  perform public._catat_audit(s, 'pengguna_undang', jsonb_build_object('pengguna', v_id, 'peran', p_peran, 'piket', p_piket));
  return v_id;
end $$;

-- ===== Membaca dan mengubah presensi =====
create or replace function public._hari_ini(s uuid) returns date
language sql stable security definer set search_path = public as
$$ select (now() at time zone (select zona from public.sekolah where id = s))::date $$;

create or replace function public._hari_sekolah(s uuid, d date) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.jadwal where sekolah_id = s and hari = extract(isodow from d))
     and not exists (select 1 from public.kalender_libur where sekolah_id = s and tanggal = d)
$$;

-- Kode keadaan satu hari: hadir, terlambat, sakit, izin, alpa, belum (tidak ada tap & belum diisi), libur.
create or replace function public._keadaan(p public.presensi, hari_sekolah boolean) returns text
language sql immutable as $$
  select case p.status when 'S' then 'sakit' when 'I' then 'izin' when 'A' then 'alpa' when 'H' then 'hadir'
    else case when p.masuk_at is not null and p.terlambat_menit > 0 then 'terlambat'
              when p.masuk_at is not null or p.pulang_at is not null then 'hadir'
              when hari_sekolah then 'belum' else 'libur' end end
$$;

create or replace function public.presensi_kelas(p_rombel uuid, p_tanggal date default null)
returns table (siswa_id uuid, no_absen smallint, nama text, punya_kartu boolean, masuk_at timestamptz, pulang_at timestamptz,
               terlambat_menit smallint, status char(1), alasan text, keadaan text)
language plpgsql stable security definer set search_path = public as $$
declare s uuid := public.sekolah_saya(); d date; hs boolean;
begin
  if not public.boleh_lihat_presensi(p_rombel) then
    raise exception 'Tidak berhak melihat presensi rombel ini' using errcode = 'insufficient_privilege';
  end if;
  d := coalesce(p_tanggal, public._hari_ini(s));
  hs := public._hari_sekolah(s, d);
  return query
    select si.id, si.no_absen, si.nama,
           exists (select 1 from public.kartu k where k.siswa_id = si.id and k.aktif),
           pr.masuk_at, pr.pulang_at, coalesce(pr.terlambat_menit, 0::smallint), pr.status, pr.alasan,
           public._keadaan(coalesce(pr, row(si.id, d, s, null, null, 0, null, null, null, now())::public.presensi), hs)
    from public.siswa si
    left join public.presensi pr on pr.siswa_id = si.id and pr.tanggal = d
    where si.rombel_id = p_rombel and si.aktif
    order by si.no_absen;
end $$;

-- Wali kelas (atau admin) mengisi H/S/I/A. p_status null = kembali mengikuti tap.
create or replace function public.ubah_presensi(p_siswa uuid, p_tanggal date, p_status char(1), p_alasan text default null)
returns void language plpgsql volatile security definer set search_path = public as $$
declare si public.siswa; lama public.presensi;
begin
  select * into si from public.siswa where id = p_siswa and sekolah_id = public.sekolah_saya();
  if si.id is null or not (public.saya_admin() or public.saya_wali(si.rombel_id)) then
    raise exception 'Hanya wali kelas atau admin yang boleh mengubah presensi' using errcode = 'insufficient_privilege';
  end if;
  if p_status is not null and p_status not in ('H','S','I','A') then raise exception 'Status harus H, S, I, atau A'; end if;
  if p_status in ('S','I','A') and length(trim(coalesce(p_alasan, ''))) < 3 then raise exception 'Alasan wajib diisi'; end if;
  if p_tanggal > public._hari_ini(si.sekolah_id) then raise exception 'Tidak bisa mengisi presensi hari yang akan datang'; end if;
  select * into lama from public.presensi where siswa_id = p_siswa and tanggal = p_tanggal;
  insert into public.presensi (siswa_id, tanggal, sekolah_id, status, alasan, diubah_oleh)
    values (p_siswa, p_tanggal, si.sekolah_id, p_status, nullif(trim(p_alasan), ''), auth.uid())
    on conflict (siswa_id, tanggal) do update
      set status = excluded.status, alasan = excluded.alasan, diubah_oleh = excluded.diubah_oleh, diubah_at = now();
  perform public._catat_audit(si.sekolah_id, 'presensi_ubah',
    jsonb_build_object('siswa', p_siswa, 'tanggal', p_tanggal, 'dari', lama.status, 'ke', p_status, 'alasan', p_alasan));
end $$;

create or replace function public._rekap(p_rombel uuid, dari date, sampai date)
returns table (siswa_id uuid, no_absen smallint, nama text, hari_sekolah int, hadir int, terlambat int, menit_terlambat int,
               sakit int, izin int, alpa int, belum int)
language sql stable security definer set search_path = public as $$
  with r as (select sekolah_id from public.rombel where id = p_rombel),
  hari as (
    select d::date as tgl from r, generate_series(dari, least(sampai, public._hari_ini(r.sekolah_id)), interval '1 day') d
    where public._hari_sekolah(r.sekolah_id, d::date)
  ),
  k as (
    select si.id, si.no_absen, si.nama, coalesce(pr.terlambat_menit, 0) as menit,
           public._keadaan(coalesce(pr, row(si.id, h.tgl, si.sekolah_id, null, null, 0, null, null, null, now())::public.presensi), true) as kd
    from public.siswa si cross join hari h
    left join public.presensi pr on pr.siswa_id = si.id and pr.tanggal = h.tgl
    where si.rombel_id = p_rombel and si.aktif
  )
  select si.id, si.no_absen, si.nama, count(k.kd)::int,
         count(*) filter (where k.kd in ('hadir','terlambat'))::int,
         count(*) filter (where k.kd = 'terlambat')::int,
         coalesce(sum(k.menit) filter (where k.kd = 'terlambat'), 0)::int,
         count(*) filter (where k.kd = 'sakit')::int,
         count(*) filter (where k.kd = 'izin')::int,
         count(*) filter (where k.kd = 'alpa')::int,
         count(*) filter (where k.kd = 'belum')::int
  from public.siswa si left join k on k.id = si.id
  where si.rombel_id = p_rombel and si.aktif
  group by si.id, si.no_absen, si.nama order by si.no_absen
$$;

-- Rekap satu bulan (p_bulan: tanggal berapa pun di bulan itu). hadir sudah termasuk terlambat.
create or replace function public.rekap_bulan(p_rombel uuid, p_bulan date)
returns table (siswa_id uuid, no_absen smallint, nama text, hari_sekolah int, hadir int, terlambat int, menit_terlambat int,
               sakit int, izin int, alpa int, belum int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.boleh_lihat_presensi(p_rombel) then
    raise exception 'Tidak berhak melihat presensi rombel ini' using errcode = 'insufficient_privilege';
  end if;
  return query select * from public._rekap(p_rombel, date_trunc('month', p_bulan)::date,
                                           (date_trunc('month', p_bulan) + interval '1 month - 1 day')::date);
end $$;

-- "Perlu disapa": siswa yang sering terlambat atau sering tidak tercatat dalam p_hari terakhir.
-- Tujuannya menyapa dan bertanya, bukan menghukum.
create or replace function public.peringatan_kelas(p_rombel uuid, p_hari int default 30)
returns table (siswa_id uuid, no_absen smallint, nama text, terlambat int, alpa int, belum int, alasan text)
language plpgsql stable security definer set search_path = public as $$
declare hari_ini date;
begin
  if not public.boleh_lihat_presensi(p_rombel) then
    raise exception 'Tidak berhak melihat presensi rombel ini' using errcode = 'insufficient_privilege';
  end if;
  hari_ini := public._hari_ini((select sekolah_id from public.rombel where id = p_rombel));
  return query
    select x.siswa_id, x.no_absen, x.nama, x.terlambat, x.alpa, x.belum,
           concat_ws('; ', case when x.terlambat >= 3 then x.terlambat || ' kali terlambat' end,
                           case when x.alpa + x.belum >= 3 then (x.alpa + x.belum) || ' hari tidak tercatat/alpa' end)
    from public._rekap(p_rombel, hari_ini - greatest(p_hari, 1) + 1, hari_ini) x
    where x.terlambat >= 3 or x.alpa + x.belum >= 3
    order by x.alpa + x.belum + x.terlambat desc, x.no_absen;
end $$;

-- ===== Aturan akses (RLS) =====
alter table public.rahasia enable row level security;        -- tanpa kebijakan: tidak terbaca siapa pun
alter table public.alat_kunci enable row level security;     -- tanpa kebijakan: tidak terbaca siapa pun
alter table public.alat enable row level security;
alter table public.kartu enable row level security;
alter table public.jadwal enable row level security;
alter table public.kalender_libur enable row level security;
alter table public.presensi enable row level security;
alter table public.tap enable row level security;
alter table public.pendaftaran_kartu enable row level security;
alter table public.audit enable row level security;

revoke all on public.rahasia, public.alat_kunci from public, anon, authenticated;

create policy alat_baca on public.alat for select to authenticated using (sekolah_id = public.sekolah_saya() and public.saya_piket());
create policy alat_ubah on public.alat for update to authenticated
  using (sekolah_id = public.sekolah_saya() and public.saya_admin()) with check (sekolah_id = public.sekolah_saya());
create policy alat_hapus on public.alat for delete to authenticated using (sekolah_id = public.sekolah_saya() and public.saya_admin());
revoke insert, update on public.alat from anon, authenticated;
grant update (nama, titik, aktif) on public.alat to authenticated;

create policy kartu_baca on public.kartu for select to authenticated using (sekolah_id = public.sekolah_saya() and public.saya_piket());
create policy kartu_ubah on public.kartu for update to authenticated
  using (sekolah_id = public.sekolah_saya() and public.saya_admin()) with check (sekolah_id = public.sekolah_saya());
create policy kartu_hapus on public.kartu for delete to authenticated using (sekolah_id = public.sekolah_saya() and public.saya_admin());
revoke insert, update on public.kartu from anon, authenticated;
grant update (aktif) on public.kartu to authenticated;

create policy jadwal_baca on public.jadwal for select to authenticated using (sekolah_id = public.sekolah_saya());
create policy jadwal_admin on public.jadwal for all to authenticated
  using (sekolah_id = public.sekolah_saya() and public.saya_admin()) with check (sekolah_id = public.sekolah_saya() and public.saya_admin());
create policy libur_baca on public.kalender_libur for select to authenticated using (sekolah_id = public.sekolah_saya());
create policy libur_admin on public.kalender_libur for all to authenticated
  using (sekolah_id = public.sekolah_saya() and public.saya_admin()) with check (sekolah_id = public.sekolah_saya() and public.saya_admin());

create policy presensi_baca on public.presensi for select to authenticated
  using (sekolah_id = public.sekolah_saya() and public.boleh_lihat_presensi(public._rombel_siswa(siswa_id)));
revoke insert, update, delete on public.presensi from anon, authenticated;

create policy tap_baca on public.tap for select to authenticated using (sekolah_id = public.sekolah_saya() and public.saya_admin());
revoke insert, update, delete on public.tap from anon, authenticated;
create policy daftar_baca on public.pendaftaran_kartu for select to authenticated using (sekolah_id = public.sekolah_saya() and public.saya_piket());
revoke insert, update, delete on public.pendaftaran_kartu from anon, authenticated;
create policy audit_baca on public.audit for select to authenticated using (sekolah_id = public.sekolah_saya() and public.saya_admin());
revoke insert, update, delete on public.audit from anon, authenticated;

-- Wali kelas dan petugas piket perlu melihat nama siswa (rombel yang diwalikan / seluruh sekolah)
create policy rombel_presensi on public.rombel for select to authenticated
  using (sekolah_id = public.sekolah_saya() and (public.saya_piket() or wali_id = auth.uid()));
create policy siswa_presensi on public.siswa for select to authenticated
  using (sekolah_id = public.sekolah_saya() and (public.saya_piket() or public.saya_wali(rombel_id)));

-- Guru tidak boleh menjadikan dirinya petugas piket (sama seperti tidak boleh menjadikan dirinya admin)
drop policy if exists pengguna_diri on public.pengguna;
create policy pengguna_diri on public.pengguna for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and peran = public.peran_saya() and piket = public.piket_saya()
              and sekolah_id = public.sekolah_saya());

-- ===== Hak menjalankan fungsi =====
-- Supabase memberi EXECUTE ke anon secara bawaan; cabut semuanya lalu beri yang perlu saja.
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in (
             'saya_piket','piket_saya','saya_wali','boleh_lihat_presensi','_rombel_siswa','_catat_audit','_wajib_admin','_hash_uid','_nama_tampil',
             '_alat_sah','catat_tap','lapor_alat','_id_alat_baru','buat_alat','ganti_kunci_alat','mulai_daftar_kartu',
             'daftar_kartu_manual','undang_pengguna','_hari_ini','_hari_sekolah','_keadaan','presensi_kelas','ubah_presensi',
             '_rekap','rekap_bulan','peringatan_kelas')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;

-- Dipanggil alat (tanpa login)
grant execute on function public.catat_tap(text, text, bigint, text, boolean, text) to anon, authenticated;
grant execute on function public.lapor_alat(text, bigint, text, integer, text) to anon, authenticated;
-- Dipanggil aplikasi (setelah login)
-- Fungsi bantu yang dipakai di dalam kebijakan RLS dijalankan atas nama pengguna, jadi perlu EXECUTE
grant execute on function public.saya_piket(), public.piket_saya(), public.saya_wali(uuid), public.boleh_lihat_presensi(uuid),
  public._rombel_siswa(uuid) to authenticated;
grant execute on function public.buat_alat(text, text), public.ganti_kunci_alat(text), public.mulai_daftar_kartu(text, uuid),
  public.daftar_kartu_manual(uuid, text), public.undang_pengguna(text, text, text, boolean),
  public.presensi_kelas(uuid, date), public.ubah_presensi(uuid, date, char, text),
  public.rekap_bulan(uuid, date), public.peringatan_kelas(uuid, int) to authenticated;
