# Skenario demo Cikaracak Hadir (±15 menit)

Untuk presentasi di komunitas guru, kepala sekolah, atau calon mitra/pendana.
Semua langkah memakai menu **Presensi → Uji & demo mesin** (akun operator).

## Persiapan (sehari sebelumnya)

1. Supabase sudah berisi migrasi terbaru. Jalankan `20261110000002_dasbor_demo.sql` bila belum.
2. Alat ESP32 sudah diatur (WiFi 2,4 GHz, alamat server, kunci publishable, ID & kunci alat).
   Di tab **Alat**, status alat harus "kontak terakhir … menit lalu".
3. Tab **Uji & demo mesin → Buat kelas demo**: 30 siswa fiktif, kartu uji `DE000001…DE00001E`,
   riwayat presensi ±20 hari sekolah (sebagian sering terlambat, sesekali sakit/izin). Hari ini ikut terisi
   sampai jam pembuatan; buat ulang pada pagi hari demo agar "hari ini" terlihat hidup.
4. Siapkan 2–3 kartu MIFARE sungguhan. Daftarkan ke siswa demo lewat **Kartu siswa → Daftar lewat alat**
   (pilih kelas "DEMO (simulasi)").
5. HP/laptop untuk proyektor: buka aplikasi, masuk sebagai operator.

Hotspot HP sering lebih andal daripada WiFi gedung. Pilih pita 2,4 GHz.

## Alur presentasi

| Menit | Tampilkan | Pesan utama |
|---|---|---|
| 0–2 | Alat menyala: wajah Ciki berkedip, screensaver jam besar | Perangkat murah (±Rp150 ribu) dan ramah anak |
| 2–5 | **Uji mesin** → *Mulai uji* → peserta menempelkan kartu | Rantai lengkap terbukti: kartu → RC522 → ESP32 → internet → server → jawaban. Tanda tangan HMAC: tap palsu ditolak |
| 5–7 | **Layar langsung** → *Layar penuh* di proyektor; beberapa peserta tap bergantian | Wali kelas dan piket melihat kedatangan detik itu juga |
| 7–9 | Cabut WiFi alat → tap → angka antrean kuning → pasang WiFi lagi | Internet sekolah putus tidak menghilangkan data: tersimpan di alat, terkirim otomatis |
| 9–12 | **Dasbor sekolah → Data: Kelas demo**: tren harian, per kelas, jam kedatangan | Kepala sekolah melihat pola, bukan sekadar daftar hadir |
| 12–14 | **Perlu disapa** (kelas demo) dan **Rekap bulanan → Unduh CSV** | Tujuannya menyapa siswa, bukan menghukum. Rekap siap untuk laporan |
| 14–15 | **Pegawai & kelas**: jabatan, tugas piket per hari, akun NIP | Satu aplikasi untuk operator, kepala sekolah, guru, TU |

Setelah demo: **Hapus kelas demo**. Data asli sekolah tidak tersentuh selama demo.

## Pertanyaan yang sering muncul

- **Apakah data anak aman?** UID kartu hanya disimpan sebagai sidik (hash). Server tidak menyimpan NISN, alamat,
  atau foto. Setiap peran hanya melihat yang perlu (diuji otomatis di CI).
- **Kalau internet mati?** Alat menyimpan sampai 2000 tap selama 7 hari dan mengirimnya otomatis.
- **Kartu dipinjam teman?** Nama panggilan tampil di layar alat saat tap, sehingga petugas gerbang bisa mengenali.
  Kartu yang dipakai dua kali dalam 30 menit tercatat "sudah".
- **Biaya?** Perangkat ±Rp150–250 ribu per titik. Server Supabase gratis untuk skala satu sekolah, atau hosting
  sekolah sendiri (PHP + MySQL, menyusul).
- **Sumber terbuka?** Ya, github.com/tomrzetd/cikaracak. Sekolah lain bisa memakai dan ikut mengembangkan.
