# LJK dan Pemindai

## Lembar jawaban (`web/js/core/ljk.js`, versi `ljk-a4-v1`)

- A4 potret, hitam-putih, satuan milimeter. Tata letak dipakai bersama oleh pencetak dan pemindai.
- 4 penanda persegi hitam 9 mm di sudut untuk meluruskan foto.
- Blok identitas: **kode kuis** 3 digit (dari id kuis, `kodeKuis()`) dan **nomor absen** 2 digit, keduanya berupa bulatan 0–9 agar terbaca pasti tanpa QR atau tulisan tangan.
- Maksimal 40 soal dalam dua kolom × 20 baris. Pilihan ganda 2–5 opsi (A–E) atau benar-salah (B/S).
- Bulatan berdiameter 5,2 mm; jarak antarpusat 8 mm mendatar dan 8,2 mm menurun.
- Lembar per siswa: nama dan bulatan absen dicetak terisi, sehingga siswa tidak salah mengisi absen.

## Pemindai (`web/js/core/omr.js`)

1. **Penanda.** Citra diperkecil ke ±900 piksel, ambang adaptif (Bradley), komponen terhubung. Kandidat: hampir persegi, isi ≥ 0,6 (kotak miring 8° hanya mengisi ±78% bingkainya), dan luas ≥ separuh penanda terbesar ke-4 (memisahkannya dari bulatan terisi). Dipilih empat yang paling pojok, lalu dicek ukurannya serupa.
2. **Homografi** 4 titik dari koordinat mm ke piksel (eliminasi Gauss).
3. **Skor bulatan** = (rata-rata cincin kertas di sekitarnya − rata-rata bagian dalam) / cincin. Membandingkan dengan kertas di sekitarnya membuat skor tahan bayangan dan cahaya tidak rata. Rata-rata memangkas 15% nilai ekstrem (huruf cetak samar, noda).
4. **Keputusan per baris** (`putuskan`): kosong bila skor tertinggi < 0,16; **ganda** bila bulatan kedua ≥ 0,30 dan lebih dari separuh yang pertama; yakin bila tertinggi ≥ 0,30 dan selisihnya ≥ 0,18; selain itu **ragu**. Ragu, ganda, dan kosong ditandai untuk dicek guru.

## Pengujian

- `tests/omr.test.js` memindai 5 foto sintetis di `tests/fixtures/omr/` (rapi, miring, bayangan, campur B/S, SD 3 opsi, sangat sulit) yang berisi soal kosong, ganda, dan bekas hapusan.
- `tools/omr/buat_sintetis.py` menggambar lembar, mengisinya seperti siswa (arsiran penuh/sebagian/keluar garis/tipis, hapusan, ganda), lalu "memotret": perspektif, rotasi, gradasi cahaya, buram, noise, JPEG.
- Uji massal: `python3 tools/omr/buat_sintetis.py --acak 40 /tmp/omr-acak` lalu ukur dengan skrip di PR. Hasil saat rilis 0.1.0: 40 lembar, 905 soal, **0 salah baca**, 80 isian ditandai untuk dicek.

## Yang masih dibutuhkan

Foto sintetis bukan pengganti foto asli. Target proyek: akurasi ≥ 99% per bulatan pada HP Android kelas bawah di ruang kelas biasa. Kirimkan hasil uji lapangan lewat Issue **"Laporan uji LJK"**. Bila memungkinkan, sertakan foto LJK **kosong atau diisi guru sendiri** (bukan milik siswa) yang gagal dibaca, agar bisa dijadikan fixture.
