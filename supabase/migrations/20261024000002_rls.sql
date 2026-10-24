-- Aturan akses (Row Level Security).
--  • Guru: membaca rombel & siswa yang diajarnya; mengelola kuis miliknya sendiri beserta soal, jawaban, tindakan.
--  • Admin: mengelola sekolah, pengguna, rombel, siswa, penugasan mengajar.
--  • Admin TIDAK punya kebijakan untuk membaca kuis/jawaban/tindakan guru. Rekap sekolah lewat
--    fungsi rekap_sekolah() yang hanya mengembalikan jumlah, agar angka kuis tidak dipakai menilai guru.

create or replace function public.sekolah_saya() returns uuid
language sql stable security definer set search_path = public as
$$ select sekolah_id from public.pengguna where id = auth.uid() and aktif $$;

create or replace function public.saya_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.pengguna where id = auth.uid() and aktif and peran = 'admin') $$;

create or replace function public.peran_saya() returns text
language sql stable security definer set search_path = public as
$$ select peran from public.pengguna where id = auth.uid() $$;

create or replace function public.saya_mengajar(r uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.mengajar m join public.pengguna p on p.id = m.guru_id
                  where m.guru_id = auth.uid() and p.aktif and m.rombel_id = r) $$;

create or replace function public.kuis_saya(k uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.kuis where id = k and guru_id = auth.uid() and public.saya_mengajar(rombel_id)) $$;

alter table public.sekolah enable row level security;
alter table public.pengguna enable row level security;
alter table public.rombel enable row level security;
alter table public.siswa enable row level security;
alter table public.mengajar enable row level security;
alter table public.konsep enable row level security;
alter table public.kuis enable row level security;
alter table public.kuis_konsep enable row level security;
alter table public.soal enable row level security;
alter table public.jawaban enable row level security;
alter table public.tindakan enable row level security;

-- sekolah
create policy sekolah_baca on public.sekolah for select to authenticated using (id = public.sekolah_saya());
create policy sekolah_ubah on public.sekolah for update to authenticated using (id = public.sekolah_saya() and public.saya_admin()) with check (id = public.sekolah_saya());

-- pengguna
create policy pengguna_baca on public.pengguna for select to authenticated using (sekolah_id = public.sekolah_saya());
create policy pengguna_admin on public.pengguna for all to authenticated
  using (sekolah_id = public.sekolah_saya() and public.saya_admin())
  with check (sekolah_id = public.sekolah_saya() and public.saya_admin());
-- Guru boleh mengganti namanya sendiri, tetapi tidak peran atau sekolahnya
create policy pengguna_diri on public.pengguna for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and peran = public.peran_saya()
              and sekolah_id = public.sekolah_saya());

-- rombel, siswa, mengajar: admin kelola; guru baca yang diajarnya
create policy rombel_admin on public.rombel for all to authenticated
  using (sekolah_id = public.sekolah_saya() and public.saya_admin()) with check (sekolah_id = public.sekolah_saya() and public.saya_admin());
create policy rombel_guru on public.rombel for select to authenticated using (public.saya_mengajar(id));
create policy siswa_admin on public.siswa for all to authenticated
  using (sekolah_id = public.sekolah_saya() and public.saya_admin()) with check (sekolah_id = public.sekolah_saya() and public.saya_admin());
create policy siswa_guru on public.siswa for select to authenticated using (public.saya_mengajar(rombel_id));
create policy mengajar_admin on public.mengajar for all to authenticated
  using (sekolah_id = public.sekolah_saya() and public.saya_admin()) with check (sekolah_id = public.sekolah_saya() and public.saya_admin());
create policy mengajar_diri on public.mengajar for select to authenticated using (guru_id = auth.uid());

-- bank konsep
create policy konsep_baca on public.konsep for select to authenticated
  using (sekolah_id = public.sekolah_saya() and (dibagikan or pembuat_id = auth.uid()));
create policy konsep_tulis on public.konsep for all to authenticated
  using (pembuat_id = auth.uid()) with check (pembuat_id = auth.uid() and sekolah_id = public.sekolah_saya());

-- kuis dan turunannya: hanya guru pemilik yang (masih) mengajar rombel tersebut
create policy kuis_guru on public.kuis for all to authenticated
  using (guru_id = auth.uid() and public.saya_mengajar(rombel_id))
  with check (guru_id = auth.uid() and public.saya_mengajar(rombel_id) and sekolah_id = public.sekolah_saya());
create policy kuis_konsep_guru on public.kuis_konsep for all to authenticated using (public.kuis_saya(kuis_id)) with check (public.kuis_saya(kuis_id));
create policy soal_guru on public.soal for all to authenticated using (public.kuis_saya(kuis_id)) with check (public.kuis_saya(kuis_id));
create policy tindakan_guru on public.tindakan for all to authenticated using (public.kuis_saya(kuis_id)) with check (public.kuis_saya(kuis_id));
create policy jawaban_guru on public.jawaban for all to authenticated
  using (public.kuis_saya(kuis_id))
  with check (public.kuis_saya(kuis_id)
              and exists (select 1 from public.siswa s join public.kuis k on k.id = kuis_id where s.id = siswa_id and s.rombel_id = k.rombel_id));

-- Rekap sekolah untuk admin: hanya jumlah, tanpa nilai, tanpa nama guru atau siswa.
create or replace function public.rekap_sekolah(dari date default current_date - 180, sampai date default current_date)
returns table (mapel text, jumlah_kuis bigint, jumlah_guru bigint, jumlah_rombel bigint)
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(k.mapel, ''), '(tanpa mapel)'), count(*), count(distinct k.guru_id), count(distinct k.rombel_id)
  from public.kuis k
  where public.saya_admin() and k.sekolah_id = public.sekolah_saya() and k.tanggal between dari and sampai
  group by 1 order by 1
$$;

revoke all on function public.rekap_sekolah(date, date) from public;
grant execute on function public.rekap_sekolah(date, date) to authenticated;
