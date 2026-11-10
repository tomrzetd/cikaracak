# Cikaracak v0.6 — Asesmen, Dasbor Sekolah, Pustaka Demo

## Status dan lingkup

Rilis ini **tidak menambahkan tabel buku pada Supabase**, tidak menghubungkan pustaka dengan
kartu RFID/siswa sungguhan, dan tidak mengubah firmware/Android native. Yang baru:

- Beranda mode contoh menyapa "Selamat datang di Cikaracak!", bukan guru tertentu.
  Data contoh lama dalam IndexedDB tetap dipertahankan.
- Menu bernama **Asesmen** di UI. Route internal #kuis, kunci cadangan JSON, struktur IndexedDB,
  dan pemindaian LJK tidak diganti (agar data guru yang sudah ada tidak rusak).
- Pustaka demo interaktif: katalog, eksemplar berkode unik, peminjaman, pengembalian,
  peringatan jatuh tempo, stok, laporan CSV. Semua orang/sirkulasi adalah **data fiktif**,
  disimpan di IndexedDB terpisah (key pustaka-demo-fiktif-v1). Tidak ada API backend.
- Pratinjau Dasbor Sekolah Demo dibuka publik dari kartu Presensi & MIFARE pada halaman
  #layanan tanpa login. Angkanya simulasi lokal dengan label besar, bukan presensi sekolah.
- Pada tab Presensi → Dasbor sekolah, aplikasi tetap memprioritaskan RPC server asli
  dasbor_sekolah(p_hari,p_demo). Bila RPC belum tersedia (404/PGRST202), UI menyebutkan
  migrasi belum terpasang dan menampilkan grafik **SIMULASI LOKAL**. Tombol "Coba
  laporan server lagi" dapat dipakai setelah migrasi terpasang.
- Laporan asli tetap hanya untuk role yang diizinkan oleh fungsi SQL/RLS.

## Kenapa dasbor di Supabase masih error

Pesan "Fungsi presensi belum ada di server" pada tab Dasbor mengindikasikan endpoint RPC
belum tersedia pada proyek Supabase yang digunakan (atau skema API belum diperbarui).
File implementasinya sudah ada:

supabase/migrations/20261110000002_dasbor_demo.sql

Operator proyek perlu (1) backup/snapshot, (2) memastikan migrasi prasyarat
20261107000001_presensi.sql dan 20261110000001_pegawai.sql telah diterapkan,
(3) menjalankan migration 00002 melalui **Supabase SQL Editor** pada proyek yang tepat,
(4) memeriksa fungsi berhasil dibuat, dan (5) refresh schema cache PostgREST bila
perlu (NOTIFY pgrst, 'reload schema' melalui SQL Editor). Uji dari aplikasi dengan
akun operator yang sah.

**Frontend tidak diberi izin untuk menjalankan migrasi SQL menggunakan anon key.**
Migrasi ini belum kami terapkan ke database sekolah yang aktif.

## Jalur demo dan pemisahan data

| Alamat | Isi | Backend |
|---|---|---|
| #beranda | Ringkasan asesmen & ekosistem | Asesmen IndexedDB |
| #kuis | Asesmen formatif, CP/LJK/analisis | IndexedDB lokal |
| #presensi → Dasbor sekolah | Data asli jika RPC terpasang dan akun berwenang | Supabase + RLS |
| #dasborPublik | Grafik simulasi / data fiktif | 100% lokal |
| #pustaka | Inventaris, pinjam-kembali, laporan fiktif | IndexedDB terpisah |
| #layanan | Peta status modul dan tautan demo | Lokal |

## Roadmap production perpustakaan

1. Data induk siswa dari Core A1: UUID yang telah dipakai Cikaracak Hadir.
2. Tabel judul, penulis, kategori, ISBN opsional, dan tabel eksemplar berkode unik per unit fisik.
3. Transaksi peminjaman/pengembalian dengan log aktor, waktu, sekolah dan koreksi.
4. RLS menegakkan petugas pustaka sesuai penugasan aktif dan sekolah_id.
5. Reader RFID hanya untuk lookup siswa; petugas tetap mengonfirmasi transaksi.
6. Endpoint read-only untuk orang tua melihat pinjaman anak yang telah diverifikasi.
7. Konflik offline, keterlambatan, penghapusan/retensi serta backup diuji di staging.

**Seluruh angka pratinjau/CSV demo adalah fiktif, tidak boleh diperlakukan
sebagai laporan inventaris atau keuangan sekolah.** Modul pustaka production masih
memerlukan desain dan pengujian backend tersendiri.
