-- Cikaracak: dasbor sekolah + kelas demo (untuk uji mesin dan presentasi).
--
--  • dasbor_sekolah(): ringkasan presensi beberapa hari terakhir (harian, per kelas, sebaran jam datang).
--    Untuk operator, kepala sekolah, wakasek, kesiswaan, dan petugas piket pada harinya.
--  • buat_kelas_demo() / hapus_kelas_demo(): satu kelas berisi siswa FIKTIF dengan riwayat presensi
--    tersimulasi dan kartu uji (UID DE000001, DE000002, …). Kelas demo ditandai rombel.demo = true,
--    dipisahkan dari data asli di dasbor, dan bisa dihapus bersih kapan saja.

alter table public.rombel add column if not exists demo boolean not null default false;

create or replace function public._tahun_ajaran(d date) returns text
language sql immutable as
$$ select case when extract(month from d) >= 7 then extract(year from d)::int || '/' || (extract(year from d)::int + 1)
               else (extract(year from d)::int - 1) || '/' || extract(year from d)::int end $$;

create or replace function public.dasbor_sekolah(p_hari int default 14, p_demo boolean default false) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  s uuid := public.sekolah_saya();
  v_zona text;
  hari_ini date;
  dari date;
  acuan date;
  hasil jsonb;
begin
  if s is null or not public.saya_lihat_semua() then
    raise exception 'Dasbor sekolah untuk operator, kepala sekolah, wakasek, kesiswaan, atau petugas piket'
      using errcode = 'insufficient_privilege';
  end if;
  select zona into v_zona from public.sekolah where id = s;
  hari_ini := public._hari_ini(s);
  dari := hari_ini - greatest(least(coalesce(p_hari, 14), 90), 1) + 1;
  -- hari acuan untuk tabel per kelas: hari ini bila hari sekolah, bila tidak hari sekolah terakhir
  select max(d::date) into acuan from generate_series(dari, hari_ini, interval '1 day') d where public._hari_sekolah(s, d::date);

  with sa as (
    select si.id, si.rombel_id from public.siswa si join public.rombel r on r.id = si.rombel_id
    where si.sekolah_id = s and si.aktif and r.demo = coalesce(p_demo, false)
  ),
  hari as (select d::date as tgl from generate_series(dari, hari_ini, interval '1 day') d where public._hari_sekolah(s, d::date)),
  k as (
    select h.tgl, sa.rombel_id, pr.masuk_at,
           public._keadaan(coalesce(pr, row(sa.id, h.tgl, s, null, null, 0, null, null, null, now())::public.presensi), true) as kd
    from hari h cross join sa
    left join public.presensi pr on pr.siswa_id = sa.id and pr.tanggal = h.tgl
  )
  select jsonb_build_object(
    'hari_ini', hari_ini,
    'acuan', acuan,
    'siswa', (select count(*) from sa),
    'kelas_jumlah', (select count(distinct rombel_id) from sa),
    'harian', (select coalesce(jsonb_agg(x order by x ->> 'tanggal'), '[]'::jsonb) from (
        select jsonb_build_object('tanggal', tgl,
          'hadir', count(*) filter (where kd = 'hadir'), 'terlambat', count(*) filter (where kd = 'terlambat'),
          'izin_sakit', count(*) filter (where kd in ('izin', 'sakit')), 'tidak_tercatat', count(*) filter (where kd in ('alpa', 'belum'))) as x
        from k group by tgl) q),
    'kelas', (select coalesce(jsonb_agg(x order by x ->> 'urut'), '[]'::jsonb) from (
        select jsonb_build_object('kelas', r.nama, 'urut', lpad(coalesce(r.tingkat, 0)::text, 2, '0') || r.nama, 'siswa', count(*),
          'hadir', count(*) filter (where kd = 'hadir'), 'terlambat', count(*) filter (where kd = 'terlambat'),
          'izin_sakit', count(*) filter (where kd in ('izin', 'sakit')), 'tidak_tercatat', count(*) filter (where kd in ('alpa', 'belum'))) as x
        from k join public.rombel r on r.id = k.rombel_id where k.tgl = acuan group by r.id, r.nama, r.tingkat) q),
    'kedatangan', (select coalesce(jsonb_agg(jsonb_build_object('jam', jam, 'jumlah', n) order by jam), '[]'::jsonb) from (
        select to_char(date_trunc('hour', t) + floor(extract(minute from t) / 5) * interval '5 minutes', 'HH24:MI') as jam, count(*) as n
        from (select (masuk_at at time zone v_zona) as t from k where masuk_at is not null) z
        where t::time between '05:00' and '12:00' group by 1) q),
    'jam_masuk', (select to_char(jam_masuk, 'HH24:MI') from public.jadwal where sekolah_id = s and hari = extract(isodow from acuan)),
    'toleransi', (select toleransi_menit from public.jadwal where sekolah_id = s and hari = extract(isodow from acuan))
  ) into hasil;
  return hasil;
end $$;

create or replace function public.buat_kelas_demo(p_siswa int default 30, p_hari int default 20) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  s uuid := public._wajib_admin();
  v_rombel uuid;
  v_tahun text := public._tahun_ajaran(public._hari_ini(s));
  v_zona text;
  nama_depan constant text[] := array['Adit', 'Bella', 'Cahya', 'Dimas', 'Eka', 'Fikri', 'Gita', 'Hilmi', 'Indah', 'Jaka', 'Kirana', 'Lutfi',
    'Maya', 'Naufal', 'Oki', 'Putri', 'Raka', 'Salsa', 'Tegar', 'Ulfa', 'Vino', 'Wulan', 'Yoga', 'Zahra', 'Arif', 'Bunga', 'Citra', 'Dafa',
    'Elsa', 'Farel', 'Galih', 'Hana', 'Ilham', 'Jihan', 'Kevin', 'Laras'];
  nama_belakang constant text[] := array['Pratama', 'Lestari', 'Nugraha', 'Saputra', 'Maharani', 'Ramadhan', 'Permata', 'Hidayat', 'Kurnia', 'Wibowo'];
  i int; d date; j public.jadwal; si record;
  v_masuk time; v_terlambat int; r float; telat_profil float; v_masuk_at timestamptz; v_pulang_at timestamptz;
  n_hari int := 0;
begin
  if p_siswa not between 5 and 36 or p_hari not between 1 and 60 then raise exception 'Siswa 5-36, hari 1-60'; end if;
  if exists (select 1 from public.rombel where sekolah_id = s and demo) then
    raise exception 'Kelas demo sudah ada. Hapus dulu bila ingin membuat ulang.' using errcode = 'unique_violation';
  end if;
  select zona into v_zona from public.sekolah where id = s;
  insert into public.rombel (sekolah_id, nama, tingkat, tahun_ajaran, demo)
    values (s, 'DEMO (simulasi)', 7, v_tahun, true) returning id into v_rombel;
  for i in 1 .. p_siswa loop
    insert into public.siswa (sekolah_id, rombel_id, no_absen, nama, panggilan)
      values (s, v_rombel, i, nama_depan[i] || ' ' || nama_belakang[1 + (i * 7) % 10] || ' (demo)', nama_depan[i]);
    -- kartu uji: UID DE000001 dst. (fiktif, untuk simulator alat)
    insert into public.kartu (sekolah_id, uid_hash, siswa_id)
      select s, public._hash_uid('DE' || lpad(upper(to_hex(i)), 6, '0')), id from public.siswa where rombel_id = v_rombel and no_absen = i
      on conflict (sekolah_id, uid_hash) do update set siswa_id = excluded.siswa_id, aktif = true;
  end loop;

  -- riwayat presensi: tiap siswa punya kebiasaan datang sendiri; beberapa sering terlambat
  -- p_hari hari terakhir TERMASUK hari ini (hari ini hanya sampai jam sekarang, agar dasbor 'hari ini' terisi wajar)
  for d in select g::date from generate_series(public._hari_ini(s) - p_hari + 1, public._hari_ini(s), interval '1 day') g loop
    if not public._hari_sekolah(s, d) then continue; end if;
    select * into j from public.jadwal where sekolah_id = s and hari = extract(isodow from d);
    n_hari := n_hari + 1;
    for si in select id, no_absen from public.siswa where rombel_id = v_rombel loop
      r := random();
      telat_profil := case when si.no_absen % 9 = 0 then 0.45 when si.no_absen % 5 = 0 then 0.15 else 0.05 end;
      if r < 0.02 then
        insert into public.presensi (siswa_id, tanggal, sekolah_id, status, alasan) values (si.id, d, s, 'S', 'Simulasi: sakit');
      elsif r < 0.035 then
        insert into public.presensi (siswa_id, tanggal, sekolah_id, status, alasan) values (si.id, d, s, 'I', 'Simulasi: izin keluarga');
      elsif r < 0.05 then
        null;   -- tidak tap, belum diisi wali: "belum tercatat"
      else
        if random() < telat_profil then
          v_masuk := j.jam_masuk + make_interval(mins => j.toleransi_menit + 1 + floor(random() * 25)::int);
        else
          v_masuk := j.jam_masuk - make_interval(mins => floor(random() * 40)::int) + make_interval(secs => floor(random() * 60)::int);
        end if;
        v_terlambat := case when v_masuk > j.jam_masuk + make_interval(mins => j.toleransi_menit)
                            then floor(extract(epoch from (v_masuk - j.jam_masuk)) / 60) else 0 end;
        v_masuk_at := (d + v_masuk) at time zone v_zona;
        v_pulang_at := (d + j.jam_pulang + make_interval(mins => floor(random() * 25)::int)) at time zone v_zona;
        if v_masuk_at <= now() then   -- yang "belum datang" hari ini dibiarkan belum tercatat
          insert into public.presensi (siswa_id, tanggal, sekolah_id, masuk_at, pulang_at, terlambat_menit)
            values (si.id, d, s, v_masuk_at, case when v_pulang_at <= now() then v_pulang_at end, v_terlambat);
        end if;
      end if;
    end loop;
  end loop;
  perform public._catat_audit(s, 'demo_buat', jsonb_build_object('rombel', v_rombel, 'siswa', p_siswa, 'hari', n_hari));
  return jsonb_build_object('rombel', v_rombel, 'siswa', p_siswa, 'hari_sekolah', n_hari, 'uid_contoh', 'DE000001');
end $$;

create or replace function public.hapus_kelas_demo() returns int
language plpgsql volatile security definer set search_path = public as $$
declare s uuid := public._wajib_admin(); n int;
begin
  with h as (delete from public.rombel where sekolah_id = s and demo returning id) select count(*) into n from h;
  perform public._catat_audit(s, 'demo_hapus', jsonb_build_object('kelas', n));
  return n;
end $$;

revoke all on function public.dasbor_sekolah(int, boolean), public.buat_kelas_demo(int, int), public.hapus_kelas_demo(), public._tahun_ajaran(date)
  from public, anon, authenticated;
grant execute on function public.dasbor_sekolah(int, boolean), public.buat_kelas_demo(int, int), public.hapus_kelas_demo() to authenticated;
