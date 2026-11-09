-- Cikaracak: pegawai, jabatan, tugas, dan akun login NIP/PegID.
--
-- Sebelumnya satu baris `pengguna` = satu akun login. Sekarang `pengguna` adalah DATA PEGAWAI yang boleh ada
-- tanpa akun (diimpor dari Excel, langsung bisa menjadi wali kelas / pengampu / piket). Akun login (auth.users)
-- disambungkan lewat kolom akun_id oleh operator, dengan ID login NIP atau PegID dan sandi awal dari operator.
--
--  Jabatan (pengguna.peran): admin (operator), kepsek, guru, tu
--  Tugas (tabel tugas)      : piket (per hari), bendahara, keuangan, pustakawan, wakasek, kurikulum, kesiswaan, kepala_lab
--  Wali kelas = rombel.wali_id; pengampu mapel = tabel mengajar (keduanya merujuk ke pegawai).
--
-- Baris lama tetap sah: id pegawai lama = id akun, sehingga semua kuis, presensi, dan audit tidak berubah.

-- ===== pengguna menjadi data pegawai =====
do $$
declare c text;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.pengguna'::regclass and contype = 'f' and confrelid = 'auth.users'::regclass
  loop
    execute format('alter table public.pengguna drop constraint %I', c);
  end loop;
end $$;
alter table public.pengguna alter column id set default gen_random_uuid();
alter table public.pengguna add column if not exists akun_id uuid unique references auth.users(id) on delete set null;
alter table public.pengguna add column if not exists kode_login text unique check (kode_login ~ '^[0-9a-z.-]{4,30}$');
alter table public.pengguna add column if not exists wajib_ganti_sandi boolean not null default false;
alter table public.pengguna add column if not exists kode_impor text;
alter table public.pengguna add constraint pengguna_kode_impor_unik unique (sekolah_id, kode_impor);
update public.pengguna p set akun_id = p.id where p.akun_id is null and exists (select 1 from auth.users u where u.id = p.id);
alter table public.pengguna drop constraint if exists pengguna_peran_check;
alter table public.pengguna add constraint pengguna_peran_check check (peran in ('admin', 'kepsek', 'guru', 'tu'));

-- Cara lama (id pegawai = id akun) tetap berjalan: akun_id terisi otomatis.
create or replace function public._pengguna_akun_bawaan() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.akun_id is null and exists (select 1 from auth.users where id = new.id) then new.akun_id := new.id; end if;
  return new;
end $$;
create trigger pengguna_akun_bawaan before insert on public.pengguna for each row execute function public._pengguna_akun_bawaan();

-- ===== tugas =====
create table public.tugas (
  id uuid primary key default gen_random_uuid(),
  sekolah_id uuid not null references public.sekolah(id) on delete cascade,
  pengguna_id uuid not null references public.pengguna(id) on delete cascade,
  jenis text not null check (jenis in ('piket', 'bendahara', 'keuangan', 'pustakawan', 'wakasek', 'kurikulum', 'kesiswaan', 'kepala_lab')),
  hari smallint check (hari between 1 and 7),
  check ((jenis = 'piket') = (hari is not null)),
  unique nulls not distinct (pengguna_id, jenis, hari)
);
create index on public.tugas (sekolah_id, jenis);
insert into public.tugas (sekolah_id, pengguna_id, jenis, hari)
  select p.sekolah_id, p.id, 'piket', h from public.pengguna p cross join generate_series(1, 5) h where p.piket
  on conflict do nothing;

-- ===== siapa saya =====
create or replace function public.saya() returns uuid
language sql stable security definer set search_path = public as
$$ select id from public.pengguna where akun_id = auth.uid() and aktif $$;

create or replace function public.sekolah_saya() returns uuid
language sql stable security definer set search_path = public as
$$ select sekolah_id from public.pengguna where akun_id = auth.uid() and aktif $$;

create or replace function public.saya_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.pengguna where akun_id = auth.uid() and aktif and peran = 'admin') $$;

create or replace function public.peran_saya() returns text
language sql stable security definer set search_path = public as
$$ select peran from public.pengguna where akun_id = auth.uid() and aktif $$;

create or replace function public.saya_mengajar(r uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.mengajar m where m.guru_id = public.saya() and m.rombel_id = r) $$;

create or replace function public.kuis_saya(k uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.kuis where id = k and guru_id = public.saya() and public.saya_mengajar(rombel_id)) $$;

create or replace function public.saya_wali(r uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.rombel where id = r and wali_id = public.saya()) $$;

create or replace function public.tugas_saya(j text) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.tugas where pengguna_id = public.saya() and jenis = j) $$;

-- Piket hanya berlaku pada harinya (jam sekolah). Operator selalu boleh.
create or replace function public.saya_piket() returns boolean
language sql stable security definer set search_path = public as $$
  select public.saya_admin() or exists (
    select 1 from public.tugas t join public.sekolah s on s.id = t.sekolah_id
    where t.pengguna_id = public.saya() and t.jenis = 'piket'
      and t.hari = extract(isodow from (now() at time zone s.zona))::int)
$$;

-- Boleh melihat presensi SEMUA kelas: operator, kepala sekolah, wakasek, kesiswaan, piket hari ini.
create or replace function public.saya_lihat_semua() returns boolean
language sql stable security definer set search_path = public as
$$ select public.peran_saya() in ('admin', 'kepsek') or public.tugas_saya('wakasek') or public.tugas_saya('kesiswaan') or public.saya_piket() $$;

create or replace function public.boleh_lihat_presensi(r uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.rombel where id = r and sekolah_id = public.sekolah_saya()
                 and (public.saya_lihat_semua() or public.saya_wali(r) or public.saya_mengajar(r)))
$$;

-- ===== fungsi presensi yang mencatat pelaku: kini mencatat id pegawai =====
create or replace function public._catat_audit(p_sekolah uuid, p_aksi text, p_data jsonb) returns void
language sql security definer set search_path = public as
$$ insert into public.audit (sekolah_id, pengguna_id, aksi, data) values (p_sekolah, public.saya(), p_aksi, p_data) $$;

create or replace function public._wajib_admin() returns uuid
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.saya_admin() then
    raise exception 'Hanya admin sekolah' using errcode = 'insufficient_privilege';
  end if;
  return public.sekolah_saya();
end $$;

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
    values (p_alat, s, p_siswa, public.saya(), v_akhir)
    on conflict (alat_id) do update set siswa_id = excluded.siswa_id, oleh = excluded.oleh, berakhir_at = excluded.berakhir_at;
  return jsonb_build_object('alat', p_alat, 'berakhir_at', v_akhir);
end $$;

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
    values (p_siswa, p_tanggal, si.sekolah_id, p_status, nullif(trim(p_alasan), ''), public.saya())
    on conflict (siswa_id, tanggal) do update
      set status = excluded.status, alasan = excluded.alasan, diubah_oleh = excluded.diubah_oleh, diubah_at = now();
  perform public._catat_audit(si.sekolah_id, 'presensi_ubah',
    jsonb_build_object('siswa', p_siswa, 'tanggal', p_tanggal, 'dari', lama.status, 'ke', p_status, 'alasan', p_alasan));
end $$;


-- ===== akun login NIP/PegID =====
-- Operator membuat akun pegawai: ID login (NIP/PegID) + sandi awal. Pegawai wajib mengganti sandi saat masuk pertama.
-- Di balik layar akun Supabase memakai email buatan <id>@pegawai.cikaracak.invalid (domain .invalid tidak pernah
-- menerima surat), sehingga guru cukup mengetik NIP/PegID di aplikasi.
create or replace function public.atur_akun(p_pengguna uuid, p_kode text, p_sandi text) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  s uuid := public._wajib_admin();
  p public.pengguna;
  v_kode text := lower(trim(coalesce(p_kode, '')));
  v_email text;
  v_akun uuid;
begin
  select * into p from public.pengguna where id = p_pengguna and sekolah_id = s;
  if p.id is null then raise exception 'Pegawai tidak ditemukan' using errcode = 'no_data_found'; end if;
  if v_kode !~ '^[0-9a-z.-]{4,30}$' then raise exception 'ID login 4-30 karakter: angka, huruf, titik, atau strip'; end if;
  if length(coalesce(p_sandi, '')) < 8 then raise exception 'Sandi minimal 8 karakter'; end if;
  if exists (select 1 from public.pengguna where kode_login = v_kode and id <> p.id) then
    raise exception 'ID login % sudah dipakai pegawai lain', v_kode using errcode = 'unique_violation';
  end if;
  v_email := v_kode || '@pegawai.cikaracak.invalid';

  if p.akun_id is null then
    if exists (select 1 from auth.users where lower(email) = v_email) then
      raise exception 'ID login % sudah terdaftar', v_kode using errcode = 'unique_violation';
    end if;
    v_akun := gen_random_uuid();
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, recovery_token, email_change_token_new, email_change,
                            email_change_token_current, phone_change, phone_change_token, reauthentication_token)
      values ('00000000-0000-0000-0000-000000000000', v_akun, 'authenticated', 'authenticated', v_email,
              crypt(p_sandi, gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(),
              '', '', '', '', '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (gen_random_uuid(), v_akun, v_akun::text,
              jsonb_build_object('sub', v_akun::text, 'email', v_email, 'email_verified', true), 'email', now(), now(), now());
    update public.pengguna set akun_id = v_akun, kode_login = v_kode, wajib_ganti_sandi = true where id = p.id;
  else
    v_akun := p.akun_id;
    -- akun buatan aplikasi ikut berganti ID; akun email lama (mis. operator) tetap memakai emailnya
    update auth.users set encrypted_password = crypt(p_sandi, gen_salt('bf')), updated_at = now(),
                          email = case when email like '%@pegawai.cikaracak.invalid' then v_email else email end
      where id = v_akun;
    update auth.identities set identity_data = identity_data || jsonb_build_object('email', v_email)
      where user_id = v_akun and provider = 'email' and identity_data ->> 'email' like '%@pegawai.cikaracak.invalid';
    update public.pengguna set kode_login = v_kode, wajib_ganti_sandi = true where id = p.id;
  end if;
  perform public._catat_audit(s, 'akun_atur', jsonb_build_object('pegawai', p.id, 'kode', v_kode));
  return jsonb_build_object('kode', v_kode, 'baru', p.akun_id is null);
end $$;

create or replace function public.sandi_sudah_diganti() returns void
language sql volatile security definer set search_path = public as
$$ update public.pengguna set wajib_ganti_sandi = false where id = public.saya() $$;

drop function if exists public.undang_pengguna(text, text, text, boolean);

-- ===== aturan akses =====
alter table public.tugas enable row level security;
create policy tugas_baca on public.tugas for select to authenticated using (sekolah_id = public.sekolah_saya());
create policy tugas_admin on public.tugas for all to authenticated
  using (sekolah_id = public.sekolah_saya() and public.saya_admin())
  with check (sekolah_id = public.sekolah_saya() and public.saya_admin()
              and exists (select 1 from public.pengguna where id = pengguna_id and sekolah_id = public.sekolah_saya()));

-- Kolom akun hanya diubah lewat atur_akun(); operator mengelola nama, jabatan, status.
revoke insert, update on public.pengguna from anon, authenticated;
grant insert (id, sekolah_id, nama, peran, aktif, kode_impor) on public.pengguna to authenticated;
grant update (nama, peran, aktif) on public.pengguna to authenticated;

drop policy if exists pengguna_diri on public.pengguna;
create policy pengguna_diri on public.pengguna for update to authenticated
  using (id = public.saya())
  with check (id = public.saya() and peran = public.peran_saya() and aktif and sekolah_id = public.sekolah_saya());

drop policy if exists mengajar_diri on public.mengajar;
create policy mengajar_diri on public.mengajar for select to authenticated using (guru_id = public.saya());
drop policy if exists konsep_baca on public.konsep;
create policy konsep_baca on public.konsep for select to authenticated
  using (sekolah_id = public.sekolah_saya() and (dibagikan or pembuat_id = public.saya()));
drop policy if exists konsep_tulis on public.konsep;
create policy konsep_tulis on public.konsep for all to authenticated
  using (pembuat_id = public.saya()) with check (pembuat_id = public.saya() and sekolah_id = public.sekolah_saya());
drop policy if exists kuis_guru on public.kuis;
create policy kuis_guru on public.kuis for all to authenticated
  using (guru_id = public.saya() and public.saya_mengajar(rombel_id))
  with check (guru_id = public.saya() and public.saya_mengajar(rombel_id) and sekolah_id = public.sekolah_saya());

drop policy if exists rombel_presensi on public.rombel;
create policy rombel_presensi on public.rombel for select to authenticated
  using (sekolah_id = public.sekolah_saya() and (public.saya_lihat_semua() or wali_id = public.saya()));
drop policy if exists siswa_presensi on public.siswa;
create policy siswa_presensi on public.siswa for select to authenticated
  using (sekolah_id = public.sekolah_saya() and (public.saya_lihat_semua() or public.saya_wali(rombel_id)));

drop function if exists public.piket_saya();
alter table public.pengguna drop column if exists piket;

-- ===== hak menjalankan fungsi =====
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('_pengguna_akun_bawaan', 'saya', 'tugas_saya', 'saya_lihat_semua',
             'atur_akun', 'sandi_sudah_diganti', '_catat_audit', 'mulai_daftar_kartu', 'ubah_presensi', 'saya_piket',
             'saya_wali', 'boleh_lihat_presensi', 'sekolah_saya', 'saya_admin', 'peran_saya', 'saya_mengajar', 'kuis_saya')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;
-- dipakai di dalam kebijakan RLS (dijalankan atas nama pengguna)
grant execute on function public.saya(), public.sekolah_saya(), public.saya_admin(), public.peran_saya(), public.saya_mengajar(uuid),
  public.kuis_saya(uuid), public.saya_wali(uuid), public.tugas_saya(text), public.saya_piket(), public.saya_lihat_semua(),
  public.boleh_lihat_presensi(uuid) to authenticated;
grant execute on function public.atur_akun(uuid, text, text), public.sandi_sudah_diganti(),
  public.mulai_daftar_kartu(text, uuid), public.ubah_presensi(uuid, date, char, text) to authenticated;
