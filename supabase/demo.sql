-- Data demo Cikaracak Hadir: SMPN 2 Jalaksana. SEMUA NAMA SISWA FIKTIF.
--
-- Cara pakai di Supabase:
--   1. Jalankan dulu semua file di supabase/migrations/ (SQL Editor, berurutan).
--   2. Authentication → Users → Add user: buat akun operator (centang "Auto Confirm User").
--   3. Ganti email di baris v_email di bawah dengan email akun itu, lalu Run.
-- Aman dijalankan ulang: data yang sudah ada tidak digandakan.
-- Hasil akhir menampilkan ID dan kunci alat gerbang untuk diisi ke alat (tahan BOOT 3 detik).

do $$
declare
  v_email text := 'operator@contoh.sch.id';   -- GANTI dengan email akun operator/admin
  v_admin uuid;
  v_sekolah uuid;
  v_rombel uuid;
  v_alat text;
  kelas record;
  bagian text[];
  i int;
begin
  select id into v_admin from auth.users where lower(email) = lower(v_email);
  if v_admin is null then
    raise exception 'Akun % belum ada. Buat dulu di Authentication → Users (centang Auto Confirm User), lalu jalankan lagi.', v_email;
  end if;

  select id into v_sekolah from public.sekolah where nama = 'SMPN 2 Jalaksana';
  if v_sekolah is null then
    insert into public.sekolah (nama, jenjang, zona) values ('SMPN 2 Jalaksana', 'SMP', 'Asia/Jakarta') returning id into v_sekolah;
  end if;

  insert into public.pengguna (id, sekolah_id, nama, peran, piket)
    values (v_admin, v_sekolah, 'Operator Sekolah', 'admin', true)
    on conflict (id) do update set sekolah_id = excluded.sekolah_id, peran = 'admin', piket = true, aktif = true;

  -- Senin–Kamis 07.00–14.00, Jumat 07.00–11.00, toleransi 10 menit. Sabtu–Minggu libur.
  insert into public.jadwal (sekolah_id, hari, jam_masuk, toleransi_menit, jam_pulang)
    select v_sekolah, h, '07:00', 10, case when h = 5 then '11:00'::time else '14:00'::time end from generate_series(1, 5) h
    on conflict do nothing;

  for kelas in select * from (values
      ('VII-A', 7, array['Aditya Pratama|Adit', 'Bella Safitri|Bella', 'Cahya Nugraha|Cahya', 'Dede Kurniawan|Dede', 'Euis Komalasari|Euis',
                         'Fajar Ramadhan|Fajar', 'Gilang Saputra|Gilang', 'Hana Maharani|Hana', 'Intan Permata|Intan', 'Jajang Sudrajat|Jajang']),
      ('VIII-A', 8, array['Kiki Amelia|Kiki', 'Lutfi Hakim|Lutfi', 'Mumun Mulyani|Mumun', 'Nanda Prasetyo|Nanda', 'Opik Taufik|Opik',
                          'Pipit Rahmawati|Pipit', 'Rizki Firmansyah|Rizki', 'Santi Lestari|Santi', 'Tatang Hidayat|Tatang', 'Ujang Suherman|Ujang']),
      ('IX-A', 9, array['Vina Oktaviani|Vina', 'Wawan Setiawan|Wawan', 'Yayan Sopyan|Yayan', 'Zahra Nuraini|Zahra', 'Asep Saepudin|Asep',
                        'Neng Siti|Neng', 'Dadan Ramdani|Dadan', 'Elis Nurhayati|Elis', 'Ikbal Maulana|Ikbal', 'Rina Marlina|Rina'])
    ) as t(nama_kelas, tingkat, siswa)
  loop
    insert into public.rombel (sekolah_id, nama, tingkat, tahun_ajaran, wali_id)
      values (v_sekolah, kelas.nama_kelas, kelas.tingkat, '2026/2027', case when kelas.nama_kelas = 'VII-A' then v_admin end)
      on conflict (sekolah_id, nama, tahun_ajaran) do nothing;
    select id into v_rombel from public.rombel where sekolah_id = v_sekolah and nama = kelas.nama_kelas and tahun_ajaran = '2026/2027';
    if not exists (select 1 from public.siswa where rombel_id = v_rombel) then
      for i in 1 .. array_length(kelas.siswa, 1) loop
        bagian := string_to_array(kelas.siswa[i], '|');
        insert into public.siswa (sekolah_id, rombel_id, no_absen, nama, panggilan) values (v_sekolah, v_rombel, i, bagian[1], bagian[2]);
      end loop;
    end if;
  end loop;

  if not exists (select 1 from public.alat where sekolah_id = v_sekolah) then
    v_alat := public._id_alat_baru();
    insert into public.alat (id, sekolah_id, nama, titik) values (v_alat, v_sekolah, 'Gerbang utama', 'gerbang');
    insert into public.alat_kunci (alat_id, kunci) values (v_alat, gen_random_bytes(32));
  end if;
end $$;

-- ID dan kunci alat: salin ke alat (tahan BOOT 3 detik) atau ke Simulator di halaman Presensi.
select a.id as id_alat, a.nama as nama_alat, encode(k.kunci, 'hex') as kunci_alat
from public.alat a
join public.alat_kunci k on k.alat_id = a.id
join public.sekolah s on s.id = a.sekolah_id
where s.nama = 'SMPN 2 Jalaksana';
