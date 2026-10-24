# Aturan Saran

Saran dihasilkan aturan tetap di `web/js/core/analisis.js`, bukan model yang menebak. Setiap saran menampilkan angka yang memicunya. Batas bisa diubah guru per kuis.

| Aturan | Pemicu (bawaan) | Saran yang ditampilkan |
| --- | --- | --- |
| Konsep perlu diulang | % benar sekelas < `ulang` (60) | Latihan mengingat 3–5 soal tanpa nilai di awal pertemuan berikutnya, jelaskan ulang dengan contoh/praktikum berbeda, ulangi 3–7 hari kemudian. |
| Bahas singkat | `ulang` ≤ % benar < `kktp` (75) | Bahas 5–10 menit soal yang paling banyak salah dengan umpan balik spesifik. |
| Tuntas | % benar ≥ `kktp` | Lanjut; selipkan 1 soal konsep ini di kuis berikutnya (latihan berjarak). |
| Siswa perlu didampingi | % benar siswa < `siswa` (50) | Ajak bicara singkat untuk mencari penyebab; sebutkan konsep yang lemah (< 50%). |
| Kelompok kecil | ≥ 2 siswa lemah (< 50%) di konsep berstatus ulang/singkat, dan < 60% siswa yang ikut | Dampingi bersama 10 menit atau pasangkan dengan teman sebaya. |
| Ulang klasikal | ≥ 60% siswa yang ikut lemah di konsep itu | Ulang untuk seluruh kelas, tanpa kelompok. |
| Cek soal | % benar soal < 40, ≥ 20 poin di bawah konsepnya, ≥ 3 penjawab | Periksa redaksi dan kunci sebelum menyimpulkan siswa belum paham. |
| Benar-salah setara menebak | Soal B/S, ≥ 5 penjawab, % benar 40–60 | Konfirmasi dengan soal pilihan ganda. |

Catatan:

- Siswa yang tidak ikut (semua isian kosong) tidak dihitung.
- Isian huruf dinilai dengan kunci; isian 1/0 (manual) dipakai apa adanya; isian tanpa kunci tidak dihitung.
- Dasar pedagogis: umpan balik spesifik, latihan mengingat (*retrieval practice*), latihan berjarak (*spaced practice*), dan asesmen formatif. Usulan aturan baru perlu menyertakan alasan dan, bila ada, rujukan penelitian.

## Mengubah aturan

Ubah `analisis.js`, tabel ini, dan `tests/analisis.test.js` dalam satu PR. Aturan baru wajib bisa dijelaskan dalam satu kalimat kepada guru.
