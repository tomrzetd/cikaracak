# Cikaracak Core — Arsitektur Fase A1

**Status:** fondasi skema dan uji keamanan, BUKAN fitur portal orang tua atau sinkronisasi foto siap produksi.

> Cikaracak ninggang batu, laun-laun jadi legok: catatan kecil rutin, analisis cepat, tindak lanjut konsisten.

## 1. Identitas tunggal siswa

Gunakan UUID existing pada tabel **public.siswa.id** sebagai identitas resmi seluruh modul.
Jangan membuat master siswa kedua, mengganti UUID lama, atau mencocokkan identitas hanya dari nama,
nomor absen, atau UID MIFARE. Kartu dapat diganti dan nomor absen berubah setiap tahun.

Relasi utama:

- Sekolah -> rombel -> siswa -> presensi dan kartu RFID
- Sekolah -> pengguna (guru/TU) -> tugas -> akses sesuai kapabilitas
- Siswa -> hubungan_siswa_wali -> wali_keluarga -> auth.users
- Siswa -> persetujuan_foto -> foto_siswa (metadata bucket PRIVAT)
- Siswa (UUID server) <-> siswa lokal di IndexedDB lewat pemetaan yang diverifikasi

**Penting:** tabel siswa saat ini masih menunjuk rombel dengan FK ON DELETE CASCADE.
Menghapus rombel bisa ikut menghapus siswa dan riwayatnya. Jangan hapus rombel aktif.
Fase berikutnya perlu riwayat_keanggotaan_rombel agar pindah kelas/tahun tidak mengubah UUID siswa.

## 2. Lokasi sumber data

| Data | Sumber kebenaran | Prinsip |
|---|---|---|
| CP, kuis, LJK, jawaban, catatan guru | IndexedDB | Offline-first, tidak otomatis dikirim ke server |
| Foto resmi siswa | Supabase Storage PRIVATE (rencana fase A2) | Izin per anak dan per tujuan, cache terbatas |
| Siswa, rombel, guru/TU, tugas | Supabase PostgreSQL | UUID stabil, isolasi sekolah |
| Kartu RFID, presensi | Server + antrean ESP32 | UID hash; server mengesahkan hasil |
| Koperasi, kegiatan, tabungan | Server/ledger terpisah (rencana fase D) | Draft offline tidak dianggap lunas |
| Perpustakaan | Server (rencana fase C) | Setiap eksemplar fisik beridentitas |
| Relasi keluarga | Server, diverifikasi petugas | Tidak bisa klaim anak dari NISN atau UID |
| Notifikasi keluarga | Server outbox + kotak masuk | Push opsional, konten sensitif tidak di layar kunci |

## 3. Pemetaan siswa asesmen lokal ↔ server

1. Jangan mengganti ID siswa lokal yang telah menyimpan jawaban/foto.
2. Guru yang masuk memilih sekolah dan rombel server.
3. Guru menghubungkan siswa satu per satu ke UUID siswa server yang berwenang ia baca.
4. Simpan mapping di IndexedDB: localSiswaId, serverSiswaId, sekolahId, lastVerifiedAt, status.
5. Nama kembar, pindah kelas, data impor tidak cocok -> status ambigu, verifikasi manual.
6. Linking bukan persetujuan sinkronisasi. Jangan otomatis unggah foto/jawaban/catatan.

## 4. Skema database tambahan pada PR fase A1

Migrasi 20261110000003_core.sql bersifat additive: tidak mengubah siswa, kuis, jawaban,
presensi, kartu, dan tidak mengubah firmware.

- wali_keluarga: profil wali per sekolah. Satu akun login bisa terhubung ke beberapa sekolah.
- hubungan_siswa_wali: relasi banyak-ke-banyak, status menunggu/terverifikasi/dicabut.
  Hanya status terverifikasi memberi akses melihat RELASI, belum data anak.
- persetujuan_foto: status disetujui/ditolak/dicabut; tujuan identifikasi_guru/profil_keluarga;
  perubahan status dicatat ke audit.
- foto_siswa: METADATA foto saja (path, mime, ukuran, versi), bukan file gambar.

Foreign key gabungan siswa_id+sekolah_id dan wali_id+sekolah_id mencegah relasi lintas sekolah.
RLS aktif pada seluruh tabel baru. Anon tidak diberi izin. Operator sekolah mengelola metadata;
guru hanya membaca izin dan foto kelas yang diampu/dibina dan masih diberi izin.
Wali yang login hanya membaca profilnya dan hubungan yang terverifikasi; tidak bisa SELECT tabel
siswa/presensi/kuis/foto mentah.

**Belum dibuat:** bucket Storage, UI unggah server, login wali UI, RPC orang tua, dan push notification.

## 5. Foto siswa untuk production — fase A2

- Google Drive bisa jadi sumber impor tertutup/backup, **bukan** host foto publik atau link 'anyone with link'.
- Buat bucket Storage PRIVATE. Sebelum mengunggah, periksa persetujuan per siswa dan tujuan.
- Foto ditranskode JPEG/WebP, dikrop, metadata EXIF dibuang, disimpan memakai UUID sekolah/siswa.
- Backend/Storage RLS harus membatasi baca/tulis objek. RLS pada foto_siswa saja TIDAK cukup.
- Gunakan URL bertanda tangan dengan masa berlaku singkat; jangan menyimpan public URL.
- Jika izin dicabut: blokir akses baru, bersihkan cache perangkat, atur penghapusan berkas/retensi.
- Foto offline guru tetap lokal sampai guru dan sekolah memilih migrasi dengan izin sah.
- Tidak ada face recognition otomatis.

## 6. Portal keluarga — fase B

Akun orang tua terpisah dari akun pegawai tetapi boleh memakai sistem Auth yang sama.
Hubungan siswa-wali diverifikasi operator, bisa banyak anak dan lintas sekolah.
Jangan menganggap NISN, tanggal lahir, nama, atau UID kartu sebagai bukti kewenangan.

Jangan memberi keluarga SELECT langsung ke tabel lama. Buat RPC read-only yang memeriksa
auth.uid() -> wali aktif -> hubungan terverifikasi -> sekolah/siswa cocok, lalu mengembalikan
data minimum milik anak itu saja:

- keluarga_anak_saya(): nama, kelas dan sekolah anak terverifikasi.
- keluarga_presensi_anak(siswaId, rentang): hadir/izin dan waktu masuk/pulang.
- keluarga_ringkasan_belajar(siswaId): hanya ringkasan yang guru pilih untuk dibagikan.
- keluarga_kegiatan_anak(siswaId): informasi kegiatan resmi yang relevan.
- keluarga_pustaka_anak(siswaId): buku yang dipinjam.
- keluarga_notifikasi(): notifikasi untuk akun login aktif.

Uji negatif wajib: hubungan pending/dicabut, akun keluarga tidak terhubung, dua anak,
sekolah lain, UUID anak orang lain, guru TU nonaktif, dan data belum dipublikasikan guru.

Notifikasi memakai event outbox idempotent setelah aksi server dikonfirmasi. Jangan push
'belum hadir' hanya karena alat offline; pesan layar kunci tetap generik.

## 7. Menu dashboard menurut peran

| Pengguna | Menu inti |
|---|---|
| Guru mapel | Beranda, Kelas & Foto, Asesmen CP/LJK, Presensi yang diampu, Tindak Lanjut |
| Wali kelas | Menu guru + Presensi kelas binaan dan Komunikasi orang tua |
| TU pustaka | Katalog, Eksemplar, Pinjam/Kembali, Rekap |
| TU keuangan | Koperasi, Tabungan, Kegiatan resmi, Laporan sesuai mandat |
| Kepala sekolah | Dasbor agregat, bukan akses mentah semua catatan guru |
| Operator | Master Siswa, Pegawai/Tugas, Wali Terverifikasi, Perangkat, Modul, Audit |
| Keluarga | Anak Saya, Kehadiran, Pembelajaran dibagikan, Administrasi anak, Pustaka, Notifikasi |

Hak adalah kombinasi peran + penugasan + sekolah + relasi data, bukan sekadar sidebar disembunyikan.
Kantin/MIFARE untuk pembayaran masih pending dan membutuhkan otorisasi transaksi tambahan.

## 8. Urutan kerja

- A1 (PR ini): skema additive, isolasi sekolah, relasi wali, izin foto, RLS dan uji otomatis.
- A2: sinkronisasi ID lokal-server dan Storage privat + migrasi foto dengan izin dan cache aman.
- B1: onboarding wali terverifikasi, portal read-only, RPC anak yang diautentikasi.
- B2: inbox dan push dengan idempotensi, pengaturan notifikasi dan audit.
- C: perpustakaan buku/eksemplar.
- D: keuangan koperasi, tabungan dan kegiatan resmi (ledger terpisah).
- E: kantin digital (ditunda).

**Batas merge:** uji migrasi/RLS harus berhasil dan diuji di staging Supabase.
Jangan jalankan migrasi pada server sekolah dengan data asli tanpa backup.
Demo GitHub Pages, Android dan firmware tidak berubah pada PR A1.
