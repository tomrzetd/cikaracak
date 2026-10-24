# Kebijakan Privasi dan Data

Aplikasi ini mengolah data anak. Karena itu aturannya ketat dan berlaku untuk setiap kontribusi.

## Data yang disimpan

| Data | Di mana | Keterangan |
| --- | --- | --- |
| Nama siswa dan urutan absen | Perangkat guru (IndexedDB) | Tidak ada NIK, NISN, tanggal lahir, alamat, atau nama orang tua. |
| Konsep, soal, kunci, jawaban | Perangkat guru | Jawaban berupa huruf pilihan atau 1/0. |
| Foto siswa (opsional) | Perangkat guru saja | Aktif hanya setelah guru menyatakan sekolah sudah mendapat izin orang tua/wali. Dipotong 200×200 piksel. Tidak ikut cadangan, tidak ikut ekspor, tidak dikirim ke mana pun, tidak dipakai untuk pengenalan wajah. |
| Foto lembar jawaban (LJK) | Tidak disimpan | Dipindai di perangkat lalu dibuang; yang disimpan hanya pilihan jawabannya. |

## Yang tidak dilakukan aplikasi

- Tidak mengirim data ke server mana pun. Halaman memasang Content-Security-Policy `connect-src 'self'` sehingga koneksi ke luar diblokir browser.
- Tidak memakai pelacak, analitik, iklan, atau font/pustaka dari CDN.
- Tidak mencadangkan otomatis ke cloud (aplikasi Android menonaktifkan pencadangan Google).
- Tidak menilai atau memeringkat guru.

## Fase 2 (Supabase, opsional per sekolah)

Bila sekolah memilih sinkronisasi antarperangkat:

- Database milik sekolah sendiri (proyek Supabase sekolah/dinas), bukan milik pengembang aplikasi.
- Row Level Security: guru hanya melihat kelas yang diajarnya; admin **tidak dapat** membaca kuis, jawaban, atau catatan guru, hanya rekap jumlah lewat `rekap_sekolah()`.
- Foto siswa tetap tidak disinkronkan kecuali sekolah memintanya secara tertulis; implementasinya wajib memakai penyimpanan privat per sekolah.
- `connect-src` pada CSP hanya ditambah alamat proyek Supabase sekolah tersebut.

## Kewajiban sekolah

Sesuai UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi, sekolah sebagai pengendali data perlu memberi tahu orang tua/wali tentang pemakaian aplikasi, terutama bila foto siswa diaktifkan, dan menghapus data atas permintaan mereka (menu Kelas → hapus siswa, dan Kelas → Hapus semua foto).

## Melaporkan masalah privasi atau keamanan

Jangan membuka Issue publik. Ikuti [SECURITY.md](SECURITY.md).
