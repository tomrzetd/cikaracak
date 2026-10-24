# Panduan Kontribusi

Terima kasih sudah mau membantu. Proyek ini dibuat oleh dan untuk guru, jadi kontribusi dari guru yang tidak menulis kode sama berharganya dengan kontribusi kode.

## Cara membantu tanpa menulis kode

| Bentuk bantuan | Caranya |
| --- | --- |
| Uji pindai LJK di kelas | Cetak LJK, pindai di HP Anda, lalu isi formulir **"Laporan uji LJK"** di tab Issues: merek/tipe HP, kondisi cahaya, jumlah lembar, berapa yang salah baca. Ini data paling dibutuhkan proyek. |
| Laporkan masalah | Tab Issues → **"Laporan masalah"**. Sertakan langkah yang dilakukan dan tangkapan layar (tanpa nama siswa). |
| Usulkan aturan saran | Tab Issues → **"Usulan fitur"**. Jelaskan aturan, alasan pedagogisnya, dan bila ada rujukan penelitiannya. |
| Periksa data CP | Bila ada butir CP yang salah baca dari dokumen resmi, laporkan dengan nomor halaman PDF (kolom `halaman_pdf`). |
| Perbaiki teks | Salah ketik, kalimat membingungkan, atau istilah yang kurang tepat di aplikasi maupun dokumen. |

## Untuk pemrogram

### Prinsip teknis

1. **Tanpa proses build.** Aplikasi web adalah HTML, CSS, dan JavaScript modul biasa. Siapa pun bisa membuka file dan langsung memahaminya. Jangan menambahkan bundler, framework, atau `npm install` tanpa diskusi di Issue lebih dulu.
2. **Tanpa dependensi di runtime.** Semua berjalan offline di HP murah. Pustaka luar perlu alasan kuat (mis. ukuran, keamanan, kebutuhan offline).
3. **Logika murni dipisah dari tampilan.** Aturan saran, impor, LJK, dan pemindai ada di `web/js/core/` dan diuji di Node. Tampilan di `web/js/views/` hanya memanggilnya.
4. **Bahasa Indonesia** untuk nama fungsi, variabel, komentar, pesan commit, dan teks aplikasi. Istilah teknis yang lazim (mis. `render`, `store`) boleh tetap.
5. **Privasi lebih dulu.** Perubahan yang mengirim data ke luar perangkat, menambah data pribadi siswa, atau menambah pelacak akan ditolak kecuali dibahas dan disetujui di Issue. Lihat [PRIVASI.md](PRIVASI.md).
6. **Saran harus bisa dijelaskan.** Setiap aturan saran menampilkan alasannya ke guru. Model yang tidak bisa dijelaskan tidak dipakai untuk memutuskan apa pun.

### Menyiapkan lingkungan

```bash
node tools/serve.js              # http://localhost:8080
node --test tests/*.test.js      # uji unit
node tools/cek-web.js            # pemeriksaan statis
```

Uji tambahan (opsional, juga dijalankan CI):

```bash
bash tools/supabase/uji.sh                       # butuh PostgreSQL
pip install playwright pillow && python -m playwright install chromium
python3 tests/e2e/uji_e2e.py
```

### Aturan perubahan

- **Menambah modul JS baru:** daftarkan di `FILE` pada `web/sw.js` dan naikkan `VERSI`. `tools/cek-web.js` akan gagal bila lupa.
- **Mengubah tata letak LJK** (`web/js/core/ljk.js`): naikkan `VERSI` tata letak, jalankan `python3 tools/omr/buat_sintetis.py` untuk membuat ulang foto uji, dan pastikan `tests/omr.test.js` lulus. Lembar yang sudah tercetak di sekolah memakai versi lama, jadi perubahan ini perlu dibahas dulu.
- **Mengubah pemindai** (`web/js/core/omr.js`): jalankan juga uji massal `python3 tools/omr/buat_sintetis.py --acak 40 /tmp/omr-acak` lalu ukur akurasinya (lihat [docs/ljk-dan-pemindai.md](docs/ljk-dan-pemindai.md)). Sertakan angka sebelum/sesudah di PR.
- **Mengubah aturan saran** (`web/js/core/analisis.js`): perbarui [docs/aturan-saran.md](docs/aturan-saran.md) dan tes di `tests/analisis.test.js` dalam PR yang sama.
- **Mengubah skema database:** buat file migrasi baru di `supabase/migrations/` (jangan mengubah migrasi lama), lalu tambahkan uji akses di `tools/supabase/uji_rls.sql`.

### Alur kerja

1. Buka atau pilih Issue, beri komentar bahwa Anda mengerjakannya.
2. Fork, buat cabang dengan nama jelas (`perbaiki-pindai-cahaya-redup`).
3. Commit kecil dengan pesan jelas dalam bahasa Indonesia.
4. Buka Pull Request, isi templatnya, dan pastikan CI hijau.
5. Satu pengulas menyetujui sebelum digabung. Perubahan pada pemindai, aturan saran, privasi, atau skema butuh dua.

Issue berlabel **`pemula`** cocok untuk kontribusi pertama.

## Kode etik

Semua peserta terikat [Kode Etik](CODE_OF_CONDUCT.md). Hormati sesama, terutama rekan guru yang baru belajar koding.
