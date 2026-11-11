# Cikaracak Pustaka — Production P1: OCR dan Barcode Buku

Status: **PR pilot / staging**, bukan migrasi yang sudah berjalan di Supabase sekolah.

## Alur untuk petugas pustaka

1. Petugas masuk melalui akun sekolah (NIP/PegID/password) dan memiliki tugas
   **pustakawan** yang ditetapkan operator, atau berperan admin.
2. Buka **Layanan Sekolah → Katalog Sekolah**. Petugas memotret sampul
   atau halaman identitas buku menggunakan webcam PWA atau kamera HP Android.
3. OCR membaca teks menjadi **usulan**, bukan otomatis menyimpan. Konfirmasikan
   judul, penulis, penerbit dan ISBN; salah baca OCR harus diedit.
4. Bila terhubung internet, petugas boleh menekan **Cari rekomendasi**.
   Hanya judul/ISBN yang dikirim ke API publik Open Library; foto, akun dan siswa
   **tidak dikirim**. Penerbit/penulis dari layanan eksternal belum tentu cocok
   dengan edisi fisik; petugas harus membandingkan ulang.
5. Tekan **Simpan judul + 1 eksemplar**. Database mencocokkan ISBN yang sudah ada
   pada **sekolah yang sama**. Jika sama, hanya eksemplar fisik baru dibuat;
   metadata judul lama tidak ditimpa rekomendasi.
6. Kode inventaris terbentuk (contoh CKR0123456789AB) pada setiap eksemplar.
   Cetak Code 39 pada A4 dan tempel di sampul belakang dekat punggung buku;
   hindari menempel barcode di permukaan lipatan atau punggung sangat sempit.
7. Untuk tambahan copy buku yang sama gunakan **+ Eksemplar**, jangan
   menduplikasi label. Menu cetak batch menyertakan kode yang berbeda-beda.
8. Buku yang sudah diberi label dapat ditemukan kembali dengan foto label atau
   memasukkan kodenya; belum ada transaksi pinjam/kembali siswa pada P1.

## Mekanisme OCR kamera

- **Android APK:** kamera sistem via FileChooser WebView, lalu ML Kit
  Text Recognition / Barcode Scanner **bundled on-device**. Scan menggunakan
  gambar yang diperkecil di perangkat; tidak disimpan permanen atau diunggah.
- **PWA/Chrome:** input file kamera atau webcam `getUserMedia()`. Bila
  `TextDetector` tidak tersedia, aplikasi memuat **Tesseract.js 6.0.1**
  dari jsDelivr saat petugas meminta OCR. Karena worker/model awalnya diambil
  dari jaringan, **OCR PWA tidak dijamin bisa berjalan offline pada instalasi
  pertama**. Pengisian manual selalu tersedia. Untuk deployment enterprise
  fully-offline, host paket OCR worker/WASM/model lokal dan masukkan ke cache PWA.
- Pembaca Code 39 PWA memakai `BarcodeDetector` bila browser mendukungnya.
  Jika tidak tersedia, gunakan kamera APK ML Kit atau input kode manual.
- Kamera hanya aktif atas tindakan petugas, ditutup ketika pindah halaman.
- Mode cetak memakai layanan printer browser/Android; perlu uji scanner dengan
  ukuran cetak fisik, kontras dan kertas label yang dipakai sekolah.

## SQL dan akses

Berkas SQL: `supabase/migrations/20261111000001_pustaka_katalog.sql`

Tabel:
- `pustaka_judul` — bibliografi (judul/penulis/penerbit/ISBN) per sekolah.
- `pustaka_eksemplar` — unit fisik, kode Code 39 unik, status/kondisi awal.

Hanya RPC `pustaka_terima_buku` dan `pustaka_tambah_eksemplar`
yang mengubah tabel. RLS SELECT hanya untuk operator atau petugas pustakawan
aktif pada sekolah sendiri. Tidak ada hak INSERT/UPDATE/DELETE langsung
untuk client. Operasi dicatat ke tabel audit. Ketika penugasan dicabut,
akses ikut hilang. Barcode bukan secret dan **tidak memberi kewenangan akses**.

## Sebelum dipakai dengan buku asli

1. Backup Supabase dan jalankan migrasi 20261111000001 pada **staging**
   setelah semua migrasi sebelumnya; jangan lewat akun anonim.
2. Jalankan `bash tools/supabase/uji.sh` dan CI Github Actions.
3. Uji akses operator, pustakawan TU, guru biasa, sekolah B dan anon;
   verifikasi tidak bisa melihat/menulis milik sekolah lain.
4. Uji Kamera Chrome laptop (HTTPS), kamera PWA Android, dan APK native;
   cetak label satu per buku dan pindai ulang dengan perangkat asli.
5. Periksa pencarian ISBN/title lokal Indonesia yang mungkin tidak ditemukan
   di Open Library; jangan salah mengklaim metadata rekomendasi sebagai kebenaran.
6. Terapkan migrasi production dengan backup dan checklist resmi petugas,
   kemudian baru aktifkan menu katalog untuk pengguna sekolah.

## Batas yang harus tetap dijaga

**P1 hanya inventaris, belum sistem sirkulasi production.** Peminjaman ke
siswa akan memerlukan transaksi server atomik, kode siswa terverifikasi,
aturan jatuh tempo, log pinjam/pulang, audit koreksi, penanganan buku hilang,
serta antrean offline dengan resolusi konflik. Data demo perpustakaan di
IndexedDB tetap terpisah dan **tidak otomatis dimigrasikan**. RFID presensi
tetap modul tersendiri; kartu siswa tidak otomatis mengesahkan peminjaman.
