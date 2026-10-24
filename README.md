# Pendamping Kuis Kelas

Aplikasi open source untuk guru SD, SMP, dan SMA: buat kuis formatif singkat, cetak lembar jawaban, **pindai dengan kamera HP**, lalu dapatkan saran konsep mana yang perlu diulang dan siswa mana yang perlu didampingi. Bekerja **offline**, data tetap di perangkat guru.

> Saran bersifat usulan; keputusan tetap di tangan guru. Aplikasi ini untuk asesmen formatif, **bukan** untuk nilai rapor dan **bukan** untuk menilai kinerja guru.

## Fitur

| Fitur | Keterangan |
| --- | --- |
| Konsep dari CP resmi 2025 | 46 mapel, Fase A–F, 1.071 butir CP dari Keputusan Kepala BSKAP 046/H/KR/2025 (Lampiran II). Pilih butir → jadi konsep & draf TP. Tanpa AI. |
| Cetak LJK | Lembar A4 hitam-putih, maksimal 40 soal (pilihan ganda A–C/A–D/A–E dan benar-salah). Bisa dicetak per siswa dengan nama dan nomor absen sudah terisi. |
| Pindai LJK | Pemindai OMR murni JavaScript, berjalan di HP tanpa internet. Bulatan ragu, ganda, dan kosong ditandai untuk dicek guru. |
| Tempel dari Google Form | Salin tabel respons, tempel, selesai. Kolom stempel waktu/email/skor diabaikan otomatis. |
| Saran berbasis aturan | Konsep perlu diulang, bahas singkat, tuntas; siswa perlu didampingi; kelompok kecil; soal yang perlu dicek. Setiap saran menampilkan alasannya. |
| Riwayat & uji semester | Catat apakah saran dijalankan, ekspor CSV (tanpa nama siswa) untuk penelitian tindakan kelas. |
| Foto siswa (opsional) | Dengan izin orang tua; hanya di perangkat, 200×200 piksel, tidak dikirim ke mana pun. |
| Aplikasi Android | Proyek Android Studio (Kotlin) yang membungkus aplikasi web, offline, dengan kamera, simpan file, dan cetak. |

## Mulai cepat

**Mencoba di komputer** (butuh [Node.js](https://nodejs.org) 20 atau lebih baru, tanpa `npm install`):

```bash
git clone https://github.com/<organisasi>/pendamping-kuis.git
cd pendamping-kuis
node tools/serve.js          # buka http://localhost:8080
```

**Memasang di HP sebagai PWA:** unggah folder `web/` ke hosting statis apa pun (GitHub Pages, Netlify, server sekolah), buka di Chrome Android, lalu pilih "Tambahkan ke layar utama". Setelah dibuka sekali, aplikasi berjalan tanpa internet.

**Membangun APK Android:** buka folder `android/` di Android Studio, lalu Build → Build APK. Lihat [docs/android.md](docs/android.md).

## Struktur repo

```
web/                 aplikasi (HTML + JavaScript modul, tanpa proses build)
  js/core/           logika murni: analisis & saran, impor, LJK, pemindai OMR — diuji di Node
  js/views/          halaman-halaman aplikasi
  data/              data CP 2025 (JSON)
android/             aplikasi Android native (Kotlin + WebView)
supabase/migrations/ skema database Fase 2 + aturan akses (RLS) + data CP
tests/               uji unit (node:test), foto LJK sintetis, uji ujung-ke-ujung (Playwright)
tools/               server pengembangan, pemeriksa web, pembuat foto sintetis, ekstraksi CP, uji RLS
docs/                arsitektur, aturan saran, LJK & pemindai, Android, Supabase, peta jalan
```

## Menjalankan pengujian

```bash
node --test tests/*.test.js     # 36 uji unit, termasuk pemindai pada 5 foto LJK sintetis
node tools/cek-web.js           # pemeriksaan statis: import, daftar offline, id HTML
bash tools/supabase/uji.sh      # migrasi + uji aturan akses (butuh PostgreSQL)
python3 tests/e2e/uji_e2e.py    # alur guru di browser sungguhan (butuh Playwright)
```

## Ikut berkontribusi

Kontribusi tidak harus berupa kode. Guru bisa membantu dengan **menguji pindai LJK di kelas**, melaporkan masalah, mengusulkan aturan saran, atau memperbaiki teks. Baca [CONTRIBUTING.md](CONTRIBUTING.md).

## Privasi

Ringkasnya: data minimal, tersimpan di perangkat, tanpa pelacak, tanpa iklan, tanpa server pihak ketiga. Rincian di [PRIVASI.md](PRIVASI.md).

## Lisensi

Kode: [MIT](LICENSE). Data Capaian Pembelajaran bersumber dari Keputusan Kepala BSKAP Kemendikdasmen Nomor 046/H/KR/2025; peraturan perundang-undangan tidak dilindungi hak cipta (UU No. 28 Tahun 2014 Pasal 42), dan ekstraksinya disediakan apa adanya dengan rujukan halaman sumber.

---

*English summary:* Open-source, offline-first PWA and Android app that helps Indonesian K-12 teachers run short formative quizzes, scan printed answer sheets with a phone camera (pure-JS OMR), and get rule-based, explainable re-teaching suggestions. Includes the 2025 national learning outcomes (CP) as structured data and a Supabase schema with row-level security for multi-teacher schools. Contributions welcome; issues and docs are in Bahasa Indonesia.
