# Supabase (Fase 2)

Fase 1 berjalan penuh tanpa server. Fase 2 menambahkan sinkronisasi antarperangkat dan panel admin untuk satu sekolah. Skemanya sudah siap dan teruji; sinkronisasi di aplikasi web belum dibuat.

## Migrasi

| Berkas | Isi |
| --- | --- |
| `20261024000001_skema.sql` | `sekolah`, `pengguna`, `rombel`, `siswa`, `mengajar`, `konsep`, `kuis`, `kuis_konsep`, `soal`, `jawaban`, `tindakan` |
| `20261024000002_rls.sql` | Fungsi bantu dan semua kebijakan Row Level Security, fungsi `rekap_sekolah()` |
| `20261024000003_ref_cp_2025.sql` | Tabel referensi `ref_mapel`, `ref_cp`, `ref_cp_butir` dan isinya (46 mapel, 532 CP, 1.071 butir); hanya-baca |

Pasang ke proyek sendiri: `supabase link --project-ref <ref>` lalu `supabase db push`, atau tempel isinya berurutan di SQL Editor.

## Aturan akses (teruji di `tools/supabase/uji_rls.sql`)

- Guru hanya melihat rombel dan siswa yang diajarnya, dan hanya mengelola kuis miliknya.
- Guru tidak bisa membuat kuis di rombel lain, tidak bisa menjadikan dirinya admin, dan tidak bisa menulis jawaban untuk siswa kelas lain.
- Admin mengelola sekolah, pengguna, rombel, siswa, dan penugasan, tetapi **tidak dapat membaca kuis, jawaban, atau catatan guru**. Rekap hanya jumlah kuis/guru/rombel per mapel.
- Guru dan admin sekolah lain tidak melihat apa pun; pengunjung tanpa login ditolak.

Uji lokal: `bash tools/supabase/uji.sh` (memakai PostgreSQL dengan tiruan skema `auth`).

## Pekerjaan berikutnya

1. Masuk dengan akun belajar.id (Google) di aplikasi web.
2. Lapisan sinkronisasi: antrean perubahan offline di IndexedDB → `upsert` ke Supabase, konflik per baris `jawaban` diselesaikan dengan `diubah_at` terbaru.
3. Panel admin: impor Dapodik, rombel, penugasan, rekap.
4. CSP `connect-src` ditambah alamat proyek Supabase sekolah.
